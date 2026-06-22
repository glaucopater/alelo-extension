const test = require("node:test");
const assert = require("node:assert/strict");
const { loadExtensionApi } = require("./helpers/load-extension-api");

const OLLAMA_URL = process.env.OLLAMA_API_URL || "http://localhost:11434/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const LLAMACPP_URL = process.env.LLAMACPP_API_URL || "http://localhost:8080/v1/completions";
const LLAMACPP_MODEL = process.env.LLAMACPP_MODEL || "ggml-org/gemma-4-E2B-it-GGUF:Q8_0";

async function isServerReachable(url, method = "GET") {
  try {
    const response = await fetch(url, { method });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function resolveLlamaCppModel(api) {
  if (LLAMACPP_MODEL) return LLAMACPP_MODEL;

  const result = await api.fetchAvailableModels(LLAMACPP_URL, "", api.LLM_PROVIDER.LLAMACPP);
  return result.ok ? result.models[0]?.name || LLAMACPP_MODEL : LLAMACPP_MODEL;
}

test("integration: Ollama /api/chat translates text", async (t) => {
  const api = loadExtensionApi();
  const tagsUrl = OLLAMA_URL.replace(/\/api\/chat\/?$/, "/api/tags");

  if (!(await isServerReachable(tagsUrl))) {
    t.skip("Ollama is not running on localhost:11434");
    return;
  }

  const result = await api.chatCompletion(
    { apiUrl: OLLAMA_URL, model: OLLAMA_MODEL },
    [
      { role: "system", content: "Reply with ONLY the translated text." },
      { role: "user", content: "Translate to Spanish: hello" }
    ]
  );

  assert.ok(result.content.length > 0);
  assert.match(result.content.toLowerCase(), /hola|hello/);
});

test("integration: llama.cpp /v1/completions answers a prompt", async (t) => {
  const api = loadExtensionApi();
  const modelsUrl = LLAMACPP_URL.replace(/\/v1\/completions\/?$/, "/v1/models");

  if (!(await isServerReachable(modelsUrl))) {
    t.skip("llama.cpp is not running on localhost:8080");
    return;
  }

  const model = await resolveLlamaCppModel(api);
  const config = { apiUrl: LLAMACPP_URL, model };

  const result = await api.chatCompletion(config, [
    { role: "user", content: "Why is the sky blue?" }
  ]);

  assert.ok(result.content.length > 0);
});

test("integration: llama.cpp raw /v1/completions matches expected request shape", async (t) => {
  const modelsUrl = LLAMACPP_URL.replace(/\/v1\/completions\/?$/, "/v1/models");

  if (!(await isServerReachable(modelsUrl))) {
    t.skip("llama.cpp is not running on localhost:8080");
    return;
  }

  const api = loadExtensionApi();
  const model = await resolveLlamaCppModel(api);

  const response = await fetch(LLAMACPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: "Why is the sky blue?",
      max_tokens: 200,
      temperature: 1,
      stream: false
    })
  });

  assert.equal(response.ok, true, `llama.cpp returned HTTP ${response.status}`);
  const body = await response.json();
  const text = body?.choices?.[0]?.text || "";
  assert.ok(String(text).trim().length > 0);
});
