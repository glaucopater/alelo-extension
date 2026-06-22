function cloneLanguagePresets() {
  return LANGUAGES_PRESET.map((item) => ({ ...item }));
}

function cloneDefaultFavorites() {
  return DEFAULT_FAVORITE_LANGUAGES.map((item) => ({ ...item }));
}

function normalizeProvider(provider, apiUrl) {
  const value = String(provider || "").trim().toLowerCase();
  if (value === LLM_PROVIDER.LLAMACPP || value === LLM_PROVIDER.OLLAMA) {
    return value;
  }
  return inferProviderFromApiUrl(apiUrl);
}

const DEFAULT_CONFIG = {
  configVersion: CURRENT_CONFIG_VERSION,
  provider: LLM_PROVIDER.OLLAMA,
  apiUrl: DEFAULT_API_URL,
  model: DEFAULT_MODEL,
  modelInfo: null,
  authToken: "",
  configSource: "default",
  temperature: DEFAULT_TEMPERATURE,
  favoriteLanguages: cloneDefaultFavorites()
};

function normalizeConfigSource(source) {
  const value = String(source || "").trim().toLowerCase();
  if (value === "user" || value === "auto" || value === "default") {
    return value;
  }
  return "default";
}

function normalizeModelInfo(info, modelName) {
  if (!info || typeof info !== "object") {
    return modelName ? { name: modelName } : null;
  }

  const name = String(info.name || modelName || "").trim();
  if (!name) return null;

  return {
    name,
    parameterSize: String(info.parameterSize || info.parameter_size || "").trim(),
    quantizationLevel: String(info.quantizationLevel || info.quantization_level || "").trim(),
    family: String(info.family || "").trim(),
    size: typeof info.size === "number" ? info.size : null,
    modifiedAt: String(info.modifiedAt || info.modified_at || "").trim()
  };
}

function normalizeLanguageCode(code) {
  return String(code || "")
    .trim()
    .replace(/_/g, "-")
    .split("-")
    .map((part, index) => (index === 0 ? part.toLowerCase() : part.toUpperCase()))
    .join("-");
}

function normalizeLanguageEntry(entry) {
  const code = normalizeLanguageCode(entry?.code);
  const label = String(entry?.label || code).trim();
  if (!code) return null;
  return { code, label: label || code };
}

function validateFavoriteLanguages(favoriteLanguages) {
  const input = Array.isArray(favoriteLanguages) ? favoriteLanguages : [];
  const seen = new Set();
  const normalized = [];

  for (const item of input) {
    const entry = normalizeLanguageEntry(item);
    if (!entry || seen.has(entry.code)) continue;
    seen.add(entry.code);
    normalized.push(entry);
  }

  if (!normalized.length) {
    return cloneDefaultFavorites();
  }

  return normalized;
}

function findLanguageByCode(codeOrLabel) {
  const raw = String(codeOrLabel || "").trim();
  const normalizedCode = normalizeLanguageCode(raw);
  const byCode = LANGUAGES_PRESET.find((lang) => normalizeLanguageCode(lang.code) === normalizedCode);
  if (byCode) return { ...byCode };

  const byLabel = LANGUAGES_PRESET.find((lang) => lang.label.toLowerCase() === raw.toLowerCase());
  if (byLabel) return { ...byLabel };

  return {
    code: normalizedCode,
    label: raw || normalizedCode
  };
}

function isFullPresetFavoriteList(favoriteLanguages) {
  if (!Array.isArray(favoriteLanguages) || favoriteLanguages.length !== LANGUAGES_PRESET.length) {
    return false;
  }

  const presetCodes = new Set(LANGUAGES_PRESET.map((lang) => normalizeLanguageCode(lang.code)));
  return favoriteLanguages.every((lang) => presetCodes.has(normalizeLanguageCode(lang.code)));
}

function normalizeConfig(config) {
  const storedVersion = config?.configVersion ?? 1;
  let favoriteLanguages = validateFavoriteLanguages(config?.favoriteLanguages);
  let model = String(config?.model || DEFAULT_CONFIG.model).trim();

  if (storedVersion < 4 && (LEGACY_DEFAULT_MODELS.includes(model) || !model)) {
    model = DEFAULT_CONFIG.model;
  }

  if (storedVersion < 5 && isFullPresetFavoriteList(favoriteLanguages)) {
    favoriteLanguages = cloneDefaultFavorites();
  }

  const modelInfo = normalizeModelInfo(config?.modelInfo, model);

  const apiUrl = String(config?.apiUrl || DEFAULT_CONFIG.apiUrl).trim();
  const provider = normalizeProvider(config?.provider, apiUrl);

  if (provider === LLM_PROVIDER.LLAMACPP && isOllamaDefaultModel(model)) {
    model = DEFAULT_LLAMACPP_MODEL;
  }

  return {
    configVersion: CURRENT_CONFIG_VERSION,
    provider,
    apiUrl,
    model,
    modelInfo: modelInfo?.name === model ? modelInfo : model ? { name: model } : null,
    authToken: String(config?.authToken || "").trim(),
    configSource: normalizeConfigSource(config?.configSource),
    temperature: normalizeTemperature(config?.temperature),
    favoriteLanguages
  };
}

let initialConfigPromise = null;

function createInitialConfig(detected) {
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    ...(detected || {}),
    configSource: detected ? "auto" : "default"
  });
}

function detectAndStoreInitialConfig() {
  if (!initialConfigPromise) {
    initialConfigPromise = detectAvailableProvider()
      .then((detected) => {
        const initial = createInitialConfig(detected);
        return new Promise((resolve) => {
          chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: initial }, () => resolve(initial));
        });
      })
      .catch(() => {
        const fallback = createInitialConfig(null);
        return new Promise((resolve) => {
          chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: fallback }, () => resolve(fallback));
        });
      })
      .finally(() => {
        initialConfigPromise = null;
      });
  }

  return initialConfigPromise;
}

async function resolveActiveConfig() {
  const config = await getStoredConfig();

  if (config.configSource === "user") {
    return config;
  }

  const reachable = await isConfigReachable(config);
  if (reachable.ok) {
    return config;
  }

  const detected = await detectAvailableProvider();
  if (!detected) {
    return config;
  }

  const next = normalizeConfig({
    ...config,
    ...detected,
    configSource: "auto"
  });

  if (
    next.apiUrl !== config.apiUrl ||
    next.provider !== config.provider ||
    next.model !== config.model ||
    !reachable.ok
  ) {
    return saveStoredConfig(next);
  }

  return next;
}

function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG_STORAGE_KEY], (result) => {
      const stored = result[CONFIG_STORAGE_KEY];

      const migrateIfNeeded = (storedConfig, normalized) => {
        if ((storedConfig.configVersion ?? 1) < CURRENT_CONFIG_VERSION) {
          chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: normalized }, () => resolve(normalized));
          return true;
        }
        return false;
      };

      if (!stored) {
        detectAndStoreInitialConfig().then(resolve);
        return;
      }

      const normalized = normalizeConfig({ ...DEFAULT_CONFIG, ...stored });
      if (!migrateIfNeeded(stored, normalized)) {
        resolve(normalized);
      }
    });
  });
}

function saveStoredConfig(config) {
  const normalized = normalizeConfig(config);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: normalized }, () => resolve(normalized));
  });
}

function getStoredHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_STORAGE_KEY], (result) => {
      resolve(result[HISTORY_STORAGE_KEY] || []);
    });
  });
}

function saveStoredHistory(history) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: history }, resolve);
  });
}

async function addHistoryEntry(entry) {
  const history = await getStoredHistory();
  history.unshift({ ...entry, savedAt: Date.now() });
  const trimmed = history.slice(0, MAX_HISTORY_ENTRIES);
  await saveStoredHistory(trimmed);
  return trimmed;
}

async function clearStoredHistory() {
  await saveStoredHistory([]);
}
