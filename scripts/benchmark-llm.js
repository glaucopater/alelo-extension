#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { loadExtensionApi } = require("../tests/helpers/load-extension-api");
const { extractStatsFromRaw, summarizeRuns } = require("../tests/helpers/benchmark-stats");
const { resolveLocalApiUrl, probeUrlVariants } = require("../tests/helpers/local-api-url");

const ROOT = join(__dirname, "..");

const OLLAMA_URL = resolveLocalApiUrl(process.env.OLLAMA_API_URL || "http://127.0.0.1:11434/api/chat");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const LLAMACPP_URL = resolveLocalApiUrl(
  process.env.LLAMACPP_API_URL || "http://127.0.0.1:8080/v1/completions"
);
const LLAMACPP_MODEL = process.env.LLAMACPP_MODEL || "ggml-org/gemma-4-E2B-it-GGUF:Q8_0";
const TEMPERATURE = Number(process.env.BENCHMARK_TEMPERATURE ?? 1);
const ITERATIONS = Math.max(1, Number(process.env.BENCHMARK_ITERATIONS || 3));
const WARMUP = Math.max(0, Number(process.env.BENCHMARK_WARMUP ?? 1));
const JSON_OUTPUT = process.env.BENCHMARK_JSON === "1";

const DEFAULT_SOURCE =
  process.env.BENCHMARK_SOURCE ||
  "Climate change is one of the most pressing challenges of our time. Scientists agree that reducing greenhouse gas emissions requires coordinated action across governments, businesses, and individuals.";

const TARGET_LANGUAGE = {
  code: process.env.BENCHMARK_TARGET_CODE || "es",
  label: process.env.BENCHMARK_TARGET_LABEL || "Spanish"
};

function loadSystemPrompt() {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(join(ROOT, "constants.js"), "utf8"), context);
  return context.SYSTEM_PROMPT;
}

function buildUserPrompt(sourceText, targetLanguage) {
  const label = targetLanguage.label || targetLanguage.code;
  const code = targetLanguage.code || label;
  return `Translate the following text to ${label} (${code}):\n\n${sourceText}`;
}

function buildMessages(systemPrompt, sourceText, targetLanguage) {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(sourceText, targetLanguage) }
  ];
}

async function isServerReachable(url, method = "GET") {
  for (const candidate of probeUrlVariants(url)) {
    try {
      const response = await fetch(candidate, { method, signal: AbortSignal.timeout(5000) });
      if (response.ok || response.status < 500) return true;
    } catch {
      // try next variant
    }
  }
  return false;
}

function formatMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatNumber(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function truncate(text, max = 72) {
  const value = String(text || "");
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function pad(value, width) {
  const text = String(value);
  if (text.length >= width) return text;
  return `${text}${" ".repeat(width - text.length)}`;
}

async function runIteration(api, provider, messages) {
  const config =
    provider.id === "ollama"
      ? {
          apiUrl: OLLAMA_URL,
          model: OLLAMA_MODEL,
          temperature: TEMPERATURE,
          provider: api.LLM_PROVIDER.OLLAMA
        }
      : {
          apiUrl: LLAMACPP_URL,
          model: LLAMACPP_MODEL,
          temperature: TEMPERATURE,
          provider: api.LLM_PROVIDER.LLAMACPP
        };

  const startedAt = performance.now();
  const result = await api.chatCompletion(config, messages);
  const elapsedMs = performance.now() - startedAt;
  const stats = extractStatsFromRaw(result.rawJsonText) || {};

  return {
    ok: true,
    content: result.content,
    wallMs: stats.wallMs ?? elapsedMs,
    serverMs: stats.serverMs,
    promptTokens: stats.promptTokens,
    outputTokens: stats.outputTokens,
    totalTokens: stats.totalTokens,
    outputChars: String(result.content || "").length,
    elapsedMs
  };
}

async function benchmarkProvider(api, provider, messages) {
  const runs = [];

  for (let index = 0; index < WARMUP; index += 1) {
    await runIteration(api, provider, messages);
  }

  for (let index = 0; index < ITERATIONS; index += 1) {
    try {
      runs.push(await runIteration(api, provider, messages));
    } catch (error) {
      runs.push({
        ok: false,
        error: error?.message || String(error)
      });
    }
  }

  const successes = runs.filter((run) => run.ok);
  const summary = summarizeRuns(successes);

  return {
    provider,
    runs,
    summary,
    sampleOutput: successes[0]?.content || "",
    failures: runs.filter((run) => !run.ok)
  };
}

function printTextReport(context, results) {
  console.log("Alelo LLM benchmark");
  console.log(`Source (${context.sourceText.length} chars): ${truncate(context.sourceText)}`);
  console.log(`Target: ${context.targetLanguage.label} (${context.targetLanguage.code})`);
  console.log(`Temperature: ${context.temperature} · Warmup: ${context.warmup} · Iterations: ${context.iterations}`);
  console.log("");

  const header = [
    pad("Provider", 12),
    pad("Model", 28),
    pad("Avg wall", 10),
    pad("Avg server", 11),
    pad("Prompt tok", 11),
    pad("Output tok", 11),
    pad("Chars", 8),
    "Status"
  ].join(" | ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const result of results) {
    const { provider, summary, failures } = result;
    const status = failures.length ? `${failures.length} failed` : "ok";
    console.log(
      [
        pad(provider.label, 12),
        pad(truncate(provider.model, 27), 28),
        pad(formatMs(summary.wallMs.avg), 10),
        pad(formatMs(summary.serverMs.avg), 11),
        pad(formatNumber(summary.promptTokens.avg), 11),
        pad(formatNumber(summary.outputTokens.avg), 11),
        pad(formatNumber(summary.outputChars.avg), 8),
        status
      ].join(" | ")
    );
  }

  console.log("");
  const ranked = results
    .filter((result) => result.summary.wallMs.avg != null)
    .sort((a, b) => a.summary.wallMs.avg - b.summary.wallMs.avg);

  if (ranked.length >= 2) {
    const fastest = ranked[0];
    const slowest = ranked[ranked.length - 1];
    const delta = slowest.summary.wallMs.avg - fastest.summary.wallMs.avg;
    const ratio = slowest.summary.wallMs.avg / fastest.summary.wallMs.avg;
    console.log(
      `Fastest avg wall time: ${fastest.provider.label} (${formatMs(fastest.summary.wallMs.avg)})`
    );
    console.log(
      `${slowest.provider.label} is ${formatMs(delta)} slower (${ratio.toFixed(2)}×)`
    );
  } else if (ranked.length === 1) {
    console.log(`Only ${ranked[0].provider.label} completed successfully.`);
  }

  console.log("");
  for (const result of results) {
    if (result.sampleOutput) {
      console.log(`${result.provider.label} sample output:`);
      console.log(truncate(result.sampleOutput, 240));
      console.log("");
    }
  }
}

async function main() {
  const api = loadExtensionApi();
  const systemPrompt = loadSystemPrompt();
  const messages = buildMessages(systemPrompt, DEFAULT_SOURCE, TARGET_LANGUAGE);

  const ollamaProbe = OLLAMA_URL.replace(/\/api\/chat\/?$/, "/api/tags");
  const llamacppProbe = LLAMACPP_URL.replace(/\/v1\/completions\/?$/, "/v1/models");

  const providers = [];

  if (await isServerReachable(ollamaProbe)) {
    providers.push({ id: "ollama", label: "Ollama", model: OLLAMA_MODEL, probeUrl: ollamaProbe });
  }

  if (await isServerReachable(llamacppProbe)) {
    providers.push({
      id: "llamacpp",
      label: "llama.cpp",
      model: LLAMACPP_MODEL,
      probeUrl: llamacppProbe
    });
  }

  if (!providers.length) {
    console.error("No LLM backends reachable. Start Ollama and/or llama.cpp, then retry.");
    console.error(`  Ollama probe:     ${ollamaProbe}`);
    console.error(`  llama.cpp probe:  ${llamacppProbe}`);
    process.exit(1);
  }

  const context = {
    sourceText: DEFAULT_SOURCE,
    targetLanguage: TARGET_LANGUAGE,
    temperature: TEMPERATURE,
    warmup: WARMUP,
    iterations: ITERATIONS,
    messages
  };

  const results = [];
  for (const provider of providers) {
    results.push(await benchmarkProvider(api, provider, messages));
  }

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ context, results }, null, 2));
    return;
  }

  printTextReport(context, results);

  const anyFailed = results.some((result) => result.failures.length || !result.runs.some((run) => run.ok));
  if (anyFailed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
