function resolveLocalApiUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return parsed.href;
    }
  } catch {
    // fall through
  }
  return String(url || "").trim();
}

function isCompletionsEndpoint(apiUrl) {
  try {
    return /\/v1\/completions\/?$/i.test(new URL(String(apiUrl || "").trim()).pathname);
  } catch {
    return false;
  }
}

function inferProviderFromApiUrl(apiUrl) {
  const url = String(apiUrl || "").trim().toLowerCase();
  if (/\/v1\/(chat\/)?completions/.test(url) || (url.includes(":8080") && url.includes("/v1/"))) {
    return LLM_PROVIDER.LLAMACPP;
  }
  if (/\/api\/chat/.test(url) || /:11434\b/.test(url) || /127\.0\.0\.1:11434/.test(url)) {
    return LLM_PROVIDER.OLLAMA;
  }
  return LLM_PROVIDER.OLLAMA;
}

function messagesToPrompt(messages) {
  const parts = [];

  for (const message of messages || []) {
    const role = String(message?.role || "user").toLowerCase();
    const content = String(message?.content || "").trim();
    if (!content) continue;

    if (role === "system") {
      parts.push(`System: ${content}`);
    } else if (role === "assistant") {
      parts.push(`Assistant: ${content}`);
    } else {
      parts.push(`User: ${content}`);
    }
  }

  parts.push("Assistant:");
  return parts.join("\n\n");
}

function isOllamaDefaultModel(model) {
  const name = String(model || "").trim();
  return !name || name === DEFAULT_MODEL || LEGACY_DEFAULT_MODELS.includes(name);
}

function normalizeTemperature(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_TEMPERATURE;
  const clamped = Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, num));
  return Math.round(clamped * 100) / 100;
}

function resolveLlamaCppModel(config) {
  const model = String(config?.model || "").trim();
  if (model && !isOllamaDefaultModel(model)) {
    return model;
  }
  return DEFAULT_LLAMACPP_MODEL;
}

function buildChatRequestPayload(config, messages) {
  const temperature = normalizeTemperature(config?.temperature);

  if (isCompletionsEndpoint(config.apiUrl)) {
    return {
      model: resolveLlamaCppModel(config),
      prompt: messagesToPrompt(messages),
      max_tokens: LLAMACPP_COMPLETION_MAX_TOKENS,
      temperature,
      stream: false,
      timings_per_token: true
    };
  }

  const modelPart = config.model ? { model: config.model } : {};
  const isOllama = inferProviderFromApiUrl(config.apiUrl) === LLM_PROVIDER.OLLAMA;

  if (isOllama) {
    return {
      ...modelPart,
      stream: false,
      messages,
      options: { temperature }
    };
  }

  return {
    ...modelPart,
    stream: false,
    messages,
    temperature
  };
}

function deriveModelsEndpointUrls(apiUrl, provider = LLM_PROVIDER.OLLAMA) {
  const trimmed = String(apiUrl || "").trim();
  if (!trimmed) return [];

  const urls = [];
  try {
    const parsed = new URL(trimmed);
    const origin = parsed.origin;

    if (/\/v1\/chat\/completions\/?$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/v1\/chat\/completions\/?$/i, "/v1/models");
      urls.push(parsed.href);
    } else if (/\/v1\/completions\/?$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/v1\/completions\/?$/i, "/v1/models");
      urls.push(parsed.href);
    } else if (/\/api\/chat\/?$/i.test(parsed.pathname)) {
      urls.push(`${origin}/api/tags`);
      parsed.pathname = parsed.pathname.replace(/\/api\/chat\/?$/i, "/api/models");
      urls.push(parsed.href);
    } else if (/\/chat\/?$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/chat\/?$/i, "/models");
      urls.push(parsed.href);
    }

    if (provider === LLM_PROVIDER.LLAMACPP) {
      urls.push(`${origin}/v1/models`);
    } else {
      urls.push(`${origin}/api/tags`, `${origin}/api/models`);
    }

    urls.push(`${origin}/models`, `${origin}/v1/models`);
  } catch {
    return [];
  }

  return [...new Set(urls.filter(Boolean))];
}

function normalizeModelEntry(entry) {
  if (typeof entry === "string") {
    const name = entry.trim();
    return name ? { name } : null;
  }

  const name = String(entry?.name || entry?.model || entry?.id || "").trim();
  if (!name) return null;

  const details = entry?.details && typeof entry.details === "object" ? entry.details : {};
  return {
    name,
    parameterSize: String(details.parameter_size || entry?.parameter_size || "").trim(),
    quantizationLevel: String(details.quantization_level || entry?.quantization_level || "").trim(),
    family: String(details.family || entry?.family || "").trim(),
    size: typeof entry?.size === "number" ? entry.size : null,
    modifiedAt: String(entry?.modified_at || entry?.modifiedAt || "").trim()
  };
}

function normalizeModelsPayload(data) {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map(normalizeModelEntry).filter(Boolean);
  }

  if (Array.isArray(data.models)) {
    return data.models.map(normalizeModelEntry).filter(Boolean);
  }

  if (Array.isArray(data.data)) {
    return data.data.map((item) => normalizeModelEntry({ name: item?.id, ...item })).filter(Boolean);
  }

  return [];
}

function extractResponseContent(parsed) {
  if (!parsed || typeof parsed !== "object") return "";

  const chatContent = parsed?.choices?.[0]?.message?.content;
  if (chatContent != null) return String(chatContent).trim();

  const completionText = parsed?.choices?.[0]?.text;
  if (completionText != null) return String(completionText).trim();

  const ollamaContent = parsed?.message?.content;
  if (ollamaContent != null) return String(ollamaContent).trim();

  return "";
}

function extractDurationFromResponse(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  if (parsed.total_duration != null) {
    return parsed.total_duration / 1e6;
  }

  const timings = parsed.timings;
  if (timings && (timings.prompt_ms != null || timings.predicted_ms != null)) {
    return (timings.prompt_ms ?? 0) + (timings.predicted_ms ?? 0);
  }

  if (parsed.aleloDurationMs != null) {
    return Number(parsed.aleloDurationMs);
  }

  return null;
}

function enrichResponseWithDuration(rawJsonText, clientDurationMs) {
  try {
    const parsed = JSON.parse(rawJsonText);
    if (!parsed || typeof parsed !== "object") return rawJsonText;
    if (extractDurationFromResponse(parsed) != null) return rawJsonText;
    parsed.aleloDurationMs = Math.round(clientDurationMs);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return rawJsonText;
  }
}

function parseChatResponse(raw) {
  let content = raw;
  let rawJsonText = raw;

  try {
    const parsed = JSON.parse(raw);
    rawJsonText = JSON.stringify(parsed, null, 2);
    content = extractResponseContent(parsed) || raw;
  } catch {
    rawJsonText = raw;
    content = raw;
  }

  return {
    content: String(content || "").trim(),
    rawJsonText
  };
}

async function chatCompletion(config, messages, fetchImpl = fetch) {
  const payload = buildChatRequestPayload(config, messages);
  const startedAt = performance.now();

  const headers = { "Content-Type": "application/json" };
  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  }

  const response = await fetchImpl(resolveLocalApiUrl(config.apiUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  const clientDurationMs = performance.now() - startedAt;

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${raw || "No response body"}`);
  }

  const result = parseChatResponse(raw);
  result.rawJsonText = enrichResponseWithDuration(result.rawJsonText, clientDurationMs);
  return result;
}

async function fetchAvailableModels(apiUrl, authToken, provider = LLM_PROVIDER.OLLAMA, fetchImpl = fetch) {
  const headers = { Accept: "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const urls = deriveModelsEndpointUrls(apiUrl, provider).flatMap((url) => {
    const resolved = resolveLocalApiUrl(url);
    return resolved === url ? [url] : [url, resolved];
  });
  const uniqueUrls = [...new Set(urls.map(resolveLocalApiUrl))];
  let lastError = "Could not load models";

  for (const url of uniqueUrls) {
    try {
      const response = await fetchImpl(url, { headers });
      if (!response.ok) {
        lastError = `HTTP ${response.status} from ${url}`;
        continue;
      }

      const data = await response.json();
      const models = normalizeModelsPayload(data);
      if (models.length) {
        return { ok: true, models, endpoint: url };
      }

      lastError = `No models returned from ${url}`;
    } catch (error) {
      lastError = error?.message || lastError;
    }
  }

  return { ok: false, error: lastError, models: [] };
}

async function isConfigReachable(config, fetchImpl = fetch) {
  const result = await fetchAvailableModels(
    config?.apiUrl,
    config?.authToken || "",
    config?.provider || LLM_PROVIDER.OLLAMA,
    fetchImpl
  );
  return { ok: result.ok, error: result.error };
}

const PROVIDER_PROBE_CANDIDATES = [
  {
    provider: LLM_PROVIDER.OLLAMA,
    apiUrl: DEFAULT_OLLAMA_API_URL,
    modelsUrl: DEFAULT_OLLAMA_API_URL.replace(/\/api\/chat\/?$/, "/api/tags")
  },
  {
    provider: LLM_PROVIDER.LLAMACPP,
    apiUrl: DEFAULT_LLAMACPP_API_URL,
    modelsUrl: DEFAULT_LLAMACPP_API_URL.replace(/\/v1\/completions\/?$/, "/v1/models")
  }
];

async function probeModelsEndpoint(modelsUrl, fetchImpl = fetch, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(resolveLocalApiUrl(modelsUrl), {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) return null;

    const data = await response.json();
    const models = normalizeModelsPayload(data);
    return models.length ? models : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function detectAvailableProvider(fetchImpl = fetch) {
  const probes = await Promise.all(
    PROVIDER_PROBE_CANDIDATES.map(async (candidate) => {
      const models = await probeModelsEndpoint(candidate.modelsUrl, fetchImpl);
      if (!models) return null;
      return { ...candidate, models };
    })
  );

  const ollama = probes.find((result) => result?.provider === LLM_PROVIDER.OLLAMA);
  const llamacpp = probes.find((result) => result?.provider === LLM_PROVIDER.LLAMACPP);
  const match = ollama || llamacpp;
  if (!match) return null;

  const firstModel = match.models[0];
  return {
    provider: match.provider,
    apiUrl: match.apiUrl,
    model: firstModel?.name || "",
    modelInfo: firstModel || null
  };
}
