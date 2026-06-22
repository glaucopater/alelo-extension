const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");

function loadExtensionApi() {
  const context = vm.createContext({
    console,
    fetch: globalThis.fetch,
    URL: globalThis.URL,
    AbortController: globalThis.AbortController,
    performance: globalThis.performance,
    setTimeout,
    clearTimeout
  });

  for (const file of ["constants.js", "llm-api.js"]) {
    const code = readFileSync(join(ROOT, file), "utf8");
    vm.runInContext(code, context);
  }

  return {
    LLM_PROVIDER: {
      OLLAMA: context.LLM_PROVIDER?.OLLAMA ?? "ollama",
      LLAMACPP: context.LLM_PROVIDER?.LLAMACPP ?? "llamacpp"
    },
    inferProviderFromApiUrl: context.inferProviderFromApiUrl,
    buildChatRequestPayload: context.buildChatRequestPayload,
    extractResponseContent: context.extractResponseContent,
    deriveModelsEndpointUrls: context.deriveModelsEndpointUrls,
    normalizeModelsPayload: context.normalizeModelsPayload,
    chatCompletion: context.chatCompletion,
    fetchAvailableModels: context.fetchAvailableModels,
    detectAvailableProvider: context.detectAvailableProvider,
    probeModelsEndpoint: context.probeModelsEndpoint
  };
}

module.exports = { loadExtensionApi, ROOT };
