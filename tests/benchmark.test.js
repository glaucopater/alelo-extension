const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const SCRIPT = join(ROOT, "scripts", "benchmark-llm.js");

const OLLAMA_PROBE =
  (process.env.OLLAMA_API_URL || "http://localhost:11434/api/chat").replace(/\/api\/chat\/?$/, "/api/tags");
const LLAMACPP_PROBE =
  (process.env.LLAMACPP_API_URL || "http://localhost:8080/v1/completions").replace(
    /\/v1\/completions\/?$/,
    "/v1/models"
  );

async function isServerReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

test("benchmark suite compares Ollama and llama.cpp with the same prompt", async (t) => {
  const [ollamaUp, llamacppUp] = await Promise.all([
    isServerReachable(OLLAMA_PROBE),
    isServerReachable(LLAMACPP_PROBE)
  ]);

  if (!ollamaUp && !llamacppUp) {
    t.skip("Neither Ollama nor llama.cpp is running");
    return;
  }

  const env = {
    ...process.env,
    BENCHMARK_ITERATIONS: process.env.BENCHMARK_ITERATIONS || "1",
    BENCHMARK_WARMUP: process.env.BENCHMARK_WARMUP || "0"
  };

  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    env,
    encoding: "utf8"
  });

  if (result.stdout) {
    t.diagnostic(result.stdout.trim());
  }
  if (result.stderr) {
    t.diagnostic(result.stderr.trim());
  }

  assert.equal(result.status, 0, "benchmark script should exit successfully");
  assert.match(result.stdout, /Alelo LLM benchmark/);
});

test("benchmark stats helper parses Ollama and OpenAI-style responses", () => {
  const { extractStatsFromRaw } = require("./helpers/benchmark-stats");

  const ollama = extractStatsFromRaw(
    JSON.stringify({
      prompt_eval_count: 12,
      eval_count: 34,
      total_duration: 2_500_000_000
    })
  );

  assert.equal(ollama.promptTokens, 12);
  assert.equal(ollama.outputTokens, 34);
  assert.equal(ollama.serverMs, 2500);

  const llamacpp = extractStatsFromRaw(
    JSON.stringify({
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      timings: { prompt_ms: 100, predicted_ms: 400 },
      aleloDurationMs: 550
    })
  );

  assert.equal(llamacpp.promptTokens, 10);
  assert.equal(llamacpp.outputTokens, 20);
  assert.equal(llamacpp.serverMs, 500);
  assert.equal(llamacpp.wallMs, 500);
});
