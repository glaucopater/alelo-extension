function cloneLanguagePresets() {
  return LANGUAGES_PRESET.map((item) => ({ ...item }));
}

function cloneDefaultFavorites() {
  return DEFAULT_FAVORITE_LANGUAGES.map((item) => ({ ...item }));
}

const DEFAULT_CONFIG = {
  configVersion: CURRENT_CONFIG_VERSION,
  apiUrl: DEFAULT_API_URL,
  model: DEFAULT_MODEL,
  authToken: "",
  favoriteLanguages: cloneDefaultFavorites()
};

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

  return {
    configVersion: CURRENT_CONFIG_VERSION,
    apiUrl: String(config?.apiUrl || DEFAULT_CONFIG.apiUrl).trim(),
    model,
    authToken: String(config?.authToken || "").trim(),
    favoriteLanguages
  };
}

function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG_STORAGE_KEY], (result) => {
      const stored = result[CONFIG_STORAGE_KEY] || {};
      const normalized = normalizeConfig({ ...DEFAULT_CONFIG, ...stored });

      if ((stored.configVersion ?? 1) < CURRENT_CONFIG_VERSION) {
        chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: normalized }, () => resolve(normalized));
        return;
      }

      resolve(normalized);
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
