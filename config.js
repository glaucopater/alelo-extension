const DEFAULT_CONFIG = {
  apiUrl: "http://localhost:11434/api/chat",
  model: "gemma4:e2b",
  authToken: ""
};

const CONFIG_STORAGE_KEY = "glowingMonocleConfig";
const HISTORY_STORAGE_KEY = "glowingMonocleHistory";
const MAX_HISTORY_ENTRIES = 30;

function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG_STORAGE_KEY], (result) => {
      resolve({ ...DEFAULT_CONFIG, ...(result[CONFIG_STORAGE_KEY] || {}) });
    });
  });
}

function saveStoredConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: config }, resolve);
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
