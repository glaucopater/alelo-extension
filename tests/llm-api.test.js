const test = require("node:test");
const assert = require("node:assert/strict");
const { loadExtensionApi } = require("./helpers/load-extension-api");

test("inferProviderFromApiUrl detects Ollama and llama.cpp endpoints", () => {
  const api = loadExtensionApi();

  assert.equal(api.inferProviderFromApiUrl("http://localhost:11434/api/chat"), api.LLM_PROVIDER.OLLAMA);
  assert.equal(
    api.inferProviderFromApiUrl("http://localhost:8080/v1/chat/completions"),
    api.LLM_PROVIDER.LLAMACPP
  );
  assert.equal(api.inferProviderFromApiUrl("http://localhost:8080/v1/completions"), api.LLM_PROVIDER.LLAMACPP);
});

test("buildChatRequestPayload uses messages for Ollama chat API", () => {
  const api = loadExtensionApi();
  const messages = [
    { role: "system", content: "You translate." },
    { role: "user", content: "Hello" }
  ];

  const payload = api.buildChatRequestPayload(
    { apiUrl: "http://localhost:11434/api/chat", model: "gemma4:e2b" },
    messages
  );

  assert.equal(payload.model, "gemma4:e2b");
  assert.equal(payload.stream, false);
  assert.deepEqual(payload.messages, messages);
  assert.equal(payload.options?.temperature, 1);
});

test("buildChatRequestPayload uses configured temperature for each provider", () => {
  const api = loadExtensionApi();
  const messages = [{ role: "user", content: "Hello" }];

  const ollamaPayload = api.buildChatRequestPayload(
    { apiUrl: "http://localhost:11434/api/chat", model: "gemma4:e2b", temperature: 0.3 },
    messages
  );
  assert.equal(ollamaPayload.options?.temperature, 0.3);

  const llamaChatPayload = api.buildChatRequestPayload(
    { apiUrl: "http://localhost:8080/v1/chat/completions", model: "local", temperature: 0.7 },
    messages
  );
  assert.equal(llamaChatPayload.temperature, 0.7);

  const llamaCompletionPayload = api.buildChatRequestPayload(
    { apiUrl: "http://localhost:8080/v1/completions", model: "local", temperature: 1.5 },
    messages
  );
  assert.equal(llamaCompletionPayload.temperature, 1.5);
});

test("buildChatRequestPayload uses prompt for llama.cpp /v1/completions", () => {
  const api = loadExtensionApi();
  const messages = [
    { role: "system", content: "You translate." },
    { role: "user", content: "Why is the sky blue?" }
  ];

  const payload = api.buildChatRequestPayload(
    { apiUrl: "http://localhost:8080/v1/completions", model: "local" },
    messages
  );

  assert.equal(payload.model, "local");
  assert.equal(payload.stream, false);
  assert.equal(payload.max_tokens, 512);
  assert.equal(payload.temperature, 1);
  assert.equal(payload.timings_per_token, true);
  assert.match(payload.prompt, /System: You translate\./);
  assert.match(payload.prompt, /User: Why is the sky blue\?/);
  assert.match(payload.prompt, /Assistant:$/);
  assert.equal(payload.messages, undefined);
});

test("buildChatRequestPayload uses default llama.cpp model when unset", () => {
  const api = loadExtensionApi();
  const payload = api.buildChatRequestPayload(
    { apiUrl: "http://localhost:8080/v1/completions", model: "" },
    [{ role: "user", content: "Why is the sky blue?" }]
  );

  assert.equal(payload.model, "ggml-org/gemma-4-E2B-it-GGUF:Q8_0");
  assert.equal(payload.temperature, 1);
  assert.match(payload.prompt, /Why is the sky blue\?/);
});

test("buildChatRequestPayload uses messages for llama.cpp /v1/chat/completions", () => {
  const api = loadExtensionApi();
  const messages = [{ role: "user", content: "Hello" }];

  const payload = api.buildChatRequestPayload(
    { apiUrl: "http://localhost:8080/v1/chat/completions", model: "local" },
    messages
  );

  assert.equal(payload.model, "local");
  assert.equal(payload.stream, false);
  assert.deepEqual(payload.messages, messages);
});

test("extractResponseContent parses Ollama, chat, and completion responses", () => {
  const api = loadExtensionApi();

  assert.equal(
    api.extractResponseContent({ message: { content: "Bonjour" } }),
    "Bonjour"
  );
  assert.equal(
    api.extractResponseContent({ choices: [{ message: { content: "Hola" } }] }),
    "Hola"
  );
  assert.equal(
    api.extractResponseContent({ choices: [{ text: "Because of Rayleigh scattering." }] }),
    "Because of Rayleigh scattering."
  );
});

test("deriveModelsEndpointUrls maps chat and completion URLs to model lists", () => {
  const api = loadExtensionApi();

  assert.ok(
    api
      .deriveModelsEndpointUrls("http://localhost:8080/v1/completions", api.LLM_PROVIDER.LLAMACPP)
      .includes("http://localhost:8080/v1/models")
  );
  assert.ok(
    api
      .deriveModelsEndpointUrls("http://localhost:11434/api/chat", api.LLM_PROVIDER.OLLAMA)
      .includes("http://localhost:11434/api/tags")
  );
});

test("normalizeModelsPayload supports Ollama tags and OpenAI model lists", () => {
  const api = loadExtensionApi();

  const ollamaModels = api.normalizeModelsPayload({
    models: [{ name: "gemma4:e2b", details: { parameter_size: "4B" } }]
  });
  assert.equal(ollamaModels[0].name, "gemma4:e2b");
  assert.equal(ollamaModels[0].parameterSize, "4B");

  const openAiModels = api.normalizeModelsPayload({
    data: [{ id: "local-model" }]
  });
  assert.deepEqual(openAiModels[0].name, "local-model");
});

test("chatCompletion sends Ollama chat payload and parses response", async () => {
  const api = loadExtensionApi();
  let requestUrl = "";
  let requestBody = null;

  const fetchMock = async (url, options) => {
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      text: async () => JSON.stringify({ message: { role: "assistant", content: "Cielo azul" } })
    };
  };

  const result = await api.chatCompletion(
    { apiUrl: "http://localhost:11434/api/chat", model: "gemma4:e2b" },
    [{ role: "user", content: "Translate to Spanish: blue sky" }],
    fetchMock
  );

  assert.equal(requestUrl, "http://127.0.0.1:11434/api/chat");
  assert.equal(requestBody.model, "gemma4:e2b");
  assert.deepEqual(requestBody.messages, [{ role: "user", content: "Translate to Spanish: blue sky" }]);
  assert.equal(result.content, "Cielo azul");
});

test("chatCompletion sends llama.cpp /v1/completions payload and parses response", async () => {
  const api = loadExtensionApi();
  let requestBody = null;

  const fetchMock = async () => {
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ text: "Because of Rayleigh scattering." }],
          usage: { prompt_tokens: 8, completion_tokens: 6, total_tokens: 14 }
        })
    };
  };

  const fetchWithCapture = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return fetchMock();
  };

  const result = await api.chatCompletion(
    { apiUrl: "http://localhost:8080/v1/completions", model: "local" },
    [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Why is the sky blue?" }
    ],
    fetchWithCapture
  );

  assert.equal(requestBody.model, "local");
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.max_tokens, 512);
  assert.equal(requestBody.temperature, 1);
  assert.match(requestBody.prompt, /Why is the sky blue\?/);
  assert.equal(result.content, "Because of Rayleigh scattering.");
  assert.ok(requestBody.timings_per_token);
  const saved = JSON.parse(result.rawJsonText || "{}");
  assert.ok(saved.aleloDurationMs != null);
});

test("chatCompletion keeps server timings when llama.cpp returns them", async () => {
  const api = loadExtensionApi();

  const fetchMock = async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        choices: [{ text: "Hola" }],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        timings: { prompt_ms: 120.5, predicted_ms: 340.2 }
      })
  });

  const result = await api.chatCompletion(
    { apiUrl: "http://localhost:8080/v1/completions", model: "local" },
    [{ role: "user", content: "Hello" }],
    fetchMock
  );

  const saved = JSON.parse(result.rawJsonText);
  assert.equal(saved.timings.prompt_ms, 120.5);
  assert.equal(saved.aleloDurationMs, undefined);
});

test("fetchAvailableModels reads Ollama /api/tags", async () => {
  const api = loadExtensionApi();

  const fetchMock = async (url) => {
    if (url === "http://127.0.0.1:11434/api/tags") {
      return {
        ok: true,
        json: async () => ({ models: [{ name: "gemma4:e2b" }] })
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  const result = await api.fetchAvailableModels(
    "http://localhost:11434/api/chat",
    "",
    api.LLM_PROVIDER.OLLAMA,
    fetchMock
  );

  assert.equal(result.ok, true);
  assert.equal(result.models[0].name, "gemma4:e2b");
  assert.equal(result.endpoint, "http://127.0.0.1:11434/api/tags");
});

test("fetchAvailableModels reads llama.cpp /v1/models", async () => {
  const api = loadExtensionApi();

  const fetchMock = async (url) => {
    if (url === "http://127.0.0.1:8080/v1/models") {
      return {
        ok: true,
        json: async () => ({ data: [{ id: "local-model" }] })
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  const result = await api.fetchAvailableModels(
    "http://localhost:8080/v1/completions",
    "",
    api.LLM_PROVIDER.LLAMACPP,
    fetchMock
  );

  assert.equal(result.ok, true);
  assert.equal(result.models[0].name, "local-model");
  assert.equal(result.endpoint, "http://127.0.0.1:8080/v1/models");
});

test("detectAvailableProvider picks Ollama when /api/tags responds", async () => {
  const api = loadExtensionApi();

  const fetchMock = async (url) => {
    if (url === "http://127.0.0.1:11434/api/tags") {
      return {
        ok: true,
        json: async () => ({ models: [{ name: "gemma4:e2b" }] })
      };
    }
    throw new Error("connection refused");
  };

  const detected = await api.detectAvailableProvider(fetchMock);

  assert.equal(detected.provider, api.LLM_PROVIDER.OLLAMA);
  assert.equal(detected.apiUrl, "http://127.0.0.1:11434/api/chat");
  assert.equal(detected.model, "gemma4:e2b");
});

test("detectAvailableProvider picks llama.cpp when only /v1/models responds", async () => {
  const api = loadExtensionApi();

  const fetchMock = async (url) => {
    if (url === "http://127.0.0.1:8080/v1/models") {
      return {
        ok: true,
        json: async () => ({ data: [{ id: "local-model" }] })
      };
    }
    throw new Error("connection refused");
  };

  const detected = await api.detectAvailableProvider(fetchMock);

  assert.equal(detected.provider, api.LLM_PROVIDER.LLAMACPP);
  assert.equal(detected.apiUrl, "http://127.0.0.1:8080/v1/completions");
  assert.equal(detected.model, "local-model");
});

test("detectAvailableProvider prefers Ollama when both backends respond", async () => {
  const api = loadExtensionApi();

  const fetchMock = async (url) => {
    if (url === "http://127.0.0.1:11434/api/tags") {
      return { ok: true, json: async () => ({ models: [{ name: "gemma4:e2b" }] }) };
    }
    if (url === "http://127.0.0.1:8080/v1/models") {
      return { ok: true, json: async () => ({ data: [{ id: "local-model" }] }) };
    }
    return { ok: false, json: async () => ({}) };
  };

  const detected = await api.detectAvailableProvider(fetchMock);
  assert.equal(detected.provider, api.LLM_PROVIDER.OLLAMA);
});

test("detectAvailableProvider returns null when neither backend responds", async () => {
  const api = loadExtensionApi();
  const fetchMock = async () => {
    throw new Error("Failed to fetch");
  };

  const detected = await api.detectAvailableProvider(fetchMock);
  assert.equal(detected, null);
});
