importScripts("constants.js", "llm-api.js", "config.js", "language-flags.js");

const flagImageCache = new Map();

async function fetchFlagDataUrl(langCode, width = 20) {
  const url = getLanguageFlagUrl(langCode, width);
  if (!url) return null;

  if (flagImageCache.has(url)) {
    return flagImageCache.get(url);
  }

  const response = await fetch(url);
  if (!response.ok) return null;

  const blob = await response.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  flagImageCache.set(url, dataUrl);
  return dataUrl;
}

function languageMenuId(code) {
  return `${CONTEXT_MENU_LANG_PREFIX}${normalizeLanguageCode(code).replace(/[^a-zA-Z0-9-]/g, "_")}`;
}

function menuIdToLanguageCode(menuItemId) {
  if (!menuItemId?.startsWith(CONTEXT_MENU_LANG_PREFIX)) return null;
  return menuItemId.slice(CONTEXT_MENU_LANG_PREFIX.length).replace(/_/g, "-");
}

function buildUserPrompt(sourceText, targetLanguage, sourceLanguage) {
  const label = targetLanguage?.label || targetLanguage?.code || "target language";
  const code = targetLanguage?.code || label;
  const sourceHint = sourceLanguage?.label
    ? `The text is in ${sourceLanguage.label} (${sourceLanguage.code}). `
    : "";
  return `${sourceHint}Translate the following text to ${label} (${code}):\n\n${sourceText}`;
}

function buildSourceLanguagePrompt(sourceText) {
  return `What language is this text?\n\n${sourceText}`;
}

function parseSourceLanguageResponse(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;

  try {
    const parsed = JSON.parse(jsonStr);
    const code = parsed.code || parsed.language || parsed.lang;
    const labelHint = parsed.label || parsed.name;
    if (!code && !labelHint) return null;

    let entry = findLanguageByCode(code || labelHint);
    if (
      labelHint &&
      !LANGUAGES_PRESET.some((lang) => normalizeLanguageCode(lang.code) === normalizeLanguageCode(entry.code))
    ) {
      entry = findLanguageByCode(labelHint);
    }

    const label = String(labelHint || entry.label || entry.code).trim();
    return normalizeLanguageEntry({ code: entry.code, label: label || entry.label });
  } catch {
    if (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/i.test(trimmed)) {
      return normalizeLanguageEntry(findLanguageByCode(trimmed));
    }

    const byName = findLanguageByCode(trimmed);
    if (byName && LANGUAGES_PRESET.some((lang) => normalizeLanguageCode(lang.code) === normalizeLanguageCode(byName.code))) {
      return normalizeLanguageEntry(byName);
    }

    return null;
  }
}

function formatErrorMessage(error, context = {}) {
  const msg = error?.message || String(error);
  const provider = context.provider || LLM_PROVIDER.OLLAMA;
  const apiUrl = String(context.apiUrl || "").trim();

  if (msg === "Failed to fetch" || (error?.name === "TypeError" && /fetch/i.test(msg))) {
    const hints = {
      [LLM_PROVIDER.OLLAMA]:
        "Start Ollama (`ollama serve`) and confirm http://localhost:11434/api/tags responds in a browser or .http file.",
      [LLM_PROVIDER.LLAMACPP]:
        "Start llama.cpp (e.g. `llama-server -m model.gguf --port 8080`) and confirm http://localhost:8080/v1/models responds."
    };
    const urlHint = apiUrl ? `\n\nConfigured URL: ${apiUrl}` : "";
    return {
      title: "Cannot reach the API",
      message: apiUrl
        ? `The translation server did not respond at ${apiUrl}.`
        : "The translation server did not respond. Check that it is running and that the API URL in Settings is correct.",
      hint: `${hints[provider] || hints[LLM_PROVIDER.OLLAMA]}${urlHint}\n\nOpen Settings (gear) to switch provider or refresh the model list.`
    };
  }

  if (msg.startsWith("API error 404")) {
    const model = context.model ? ` "${context.model}"` : "";
    const hints = {
      [LLM_PROVIDER.OLLAMA]:
        "Run `ollama list` in a terminal and copy the NAME column into Settings → Model (e.g. gemma4:e2b).",
      [LLM_PROVIDER.LLAMACPP]:
        "Refresh the model list in Settings and pick the model loaded in llama.cpp, or check the name matches /v1/models."
    };
    const messages = {
      [LLM_PROVIDER.OLLAMA]: `The model${model} is not installed or the name does not match Ollama exactly.`,
      [LLM_PROVIDER.LLAMACPP]: `The model${model} was not found on the llama.cpp server.`
    };
    return {
      title: "Model not found",
      message: messages[provider] || messages[LLM_PROVIDER.OLLAMA],
      hint: hints[provider] || hints[LLM_PROVIDER.OLLAMA]
    };
  }

  if (msg.startsWith("API error 401") || msg.startsWith("API error 403")) {
    const isOllamaApi =
      provider === LLM_PROVIDER.OLLAMA ||
      /:11434\b/.test(apiUrl) ||
      /\/api\/chat/.test(apiUrl);

    if (msg.startsWith("API error 403") && isOllamaApi) {
      return {
        title: "Ollama blocked the extension",
        message:
          "Ollama rejected the request because the browser extension origin is not allowed (HTTP 403). This is not an auth token problem.",
        hint:
          "On Windows: add a user environment variable OLLAMA_ORIGINS with value * (or chrome-extension://*), then fully quit and restart Ollama from the system tray.\n\n" +
          "In Settings, use API URL http://127.0.0.1:11434/api/chat and leave Auth token empty.\n\n" +
          "See README → CORS for extensions."
      };
    }

    return {
      title: "Authentication failed",
      message: "The API rejected the request. Check your auth token in Settings.",
      hint: apiUrl ? `Configured URL: ${apiUrl}` : ""
    };
  }

  if (msg.startsWith("API error 5")) {
    return {
      title: "Server error",
      message: "The translation server returned an error. Check the server logs for details.",
      hint: msg
    };
  }

  if (msg.startsWith("API error")) {
    return {
      title: "API error",
      message: msg,
      hint: ""
    };
  }

  return {
    title: "Translation failed",
    message: msg,
    hint: ""
  };
}

async function isContentScriptReady(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => typeof globalThis.__aleloShowLoading === "function"
    });
    return Boolean(result?.result);
  } catch {
    return false;
  }
}

const injectedContentTabs = new Set();
const injectingContentTabs = new Set();

async function injectContentScript(tabId) {
  if (injectedContentTabs.has(tabId) || injectingContentTabs.has(tabId)) {
    return;
  }

  if (await isContentScriptReady(tabId)) {
    injectedContentTabs.add(tabId);
    return;
  }

  injectingContentTabs.add(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["constants.js", "language-flags.js", "content.js"]
    });
    injectedContentTabs.add(tabId);
  } catch {
    injectedContentTabs.delete(tabId);
  } finally {
    injectingContentTabs.delete(tabId);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedContentTabs.delete(tabId);
  injectingContentTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    injectedContentTabs.delete(tabId);
    injectingContentTabs.delete(tabId);
  }
});

async function showLoading(tabId, payload) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (data, hookName) => {
      if (window[hookName]) {
        window[hookName](data);
      }
    },
    args: [payload, CONTENT_GLOBAL.SHOW_LOADING]
  });
}

async function showPartialResult(tabId, payload) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (data, hookName) => {
      if (window[hookName]) {
        window[hookName](data);
      }
    },
    args: [payload, CONTENT_GLOBAL.SHOW_PARTIAL]
  });
}

async function showResult(tabId, payload) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (data, hookName) => {
      if (window[hookName]) {
        window[hookName](data);
      }
    },
    args: [payload, CONTENT_GLOBAL.SHOW_RESULT]
  });
}

async function showError(tabId, payload) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (data, hookName) => {
      if (window[hookName]) {
        window[hookName](data);
      }
    },
    args: [payload, CONTENT_GLOBAL.SHOW_ERROR]
  });
}

async function updateSourceLanguage(tabId, payload) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (data, hookName) => {
      if (window[hookName]) {
        window[hookName](data);
      }
    },
    args: [payload, CONTENT_GLOBAL.UPDATE_SOURCE_LANGUAGE]
  });
}

async function showComposer(tabId, payload) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (data, hookName) => {
      if (window[hookName]) {
        window[hookName](data);
      }
    },
    args: [payload, CONTENT_GLOBAL.SHOW_COMPOSER]
  });
}

async function getTabSelectionText(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() || ""
    });
    return String(result?.result || "").trim();
  } catch {
    return "";
  }
}

async function requestSourceLanguage(config, sourceText) {
  const { content } = await chatCompletion(config, [
    { role: "system", content: SOURCE_LANGUAGE_SYSTEM_PROMPT },
    { role: "user", content: buildSourceLanguagePrompt(sourceText) }
  ]);
  return parseSourceLanguageResponse(content);
}

function llmHistoryFields(config) {
  if (!config) return {};
  return {
    model: String(config.model || "").trim(),
    apiUrl: String(config.apiUrl || "").trim(),
    provider: String(config.provider || "").trim()
  };
}

async function requestTranslation(config, sourceText, targetLanguage, sourceLanguage = null) {
  const targetLang = normalizeLanguageEntry(targetLanguage);
  if (!targetLang) {
    throw new Error("Invalid target language");
  }

  const { content, rawJsonText } = await chatCompletion(config, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(sourceText, targetLang, sourceLanguage) }
  ]);

  return {
    targetLanguage: targetLang,
    translatedText: content,
    rawJsonText
  };
}

async function translateLanguages(tabId, sourceText, targetLanguages, pageUrl) {
  const trimmedSource = String(sourceText || "").trim();
  const langs = (Array.isArray(targetLanguages) ? targetLanguages : [])
    .map((lang) => normalizeLanguageEntry(lang))
    .filter(Boolean);

  if (!trimmedSource) {
    await showError(tabId, {
      sourceText: "",
      targetLanguages: langs,
      pageUrl: pageUrl || "",
      errorInfo: {
        title: "No text selected",
        message: "Select some text on the page, then right-click and choose a language.",
        hint: ""
      }
    });
    return;
  }

  if (!langs.length) {
    await showError(tabId, {
      sourceText: trimmedSource,
      targetLanguages: [],
      pageUrl: pageUrl || "",
      errorInfo: {
        title: "No target language",
        message: "Add at least one favorite language in Settings.",
        hint: ""
      }
    });
    return;
  }

  let config = null;

  try {
    await showLoading(tabId, {
      sourceText: trimmedSource,
      targetLanguages: langs,
      pageUrl: pageUrl || "",
      parallel: langs.length > 1
    });

    config = await resolveActiveConfig();

    const sourceLanguagePromise = requestSourceLanguage(config, trimmedSource)
      .then(async (sourceLanguage) => {
        await updateSourceLanguage(tabId, {
          sourceText: trimmedSource,
          sourceLanguage: sourceLanguage || null,
          targetLanguages: langs,
          pageUrl: pageUrl || ""
        });
        return sourceLanguage;
      })
      .catch(async () => {
        await updateSourceLanguage(tabId, {
          sourceText: trimmedSource,
          sourceLanguage: null,
          targetLanguages: langs,
          pageUrl: pageUrl || ""
        });
        return null;
      });

    if (langs.length === 1) {
      try {
        const [sourceLanguage, result] = await Promise.all([
          sourceLanguagePromise,
          requestTranslation(config, trimmedSource, langs[0])
        ]);
        await showResult(tabId, {
          sourceText: trimmedSource,
          sourceLanguage,
          targetLanguages: langs,
          pageUrl: pageUrl || "",
          translations: [{ ok: true, ...result }],
          ...llmHistoryFields(config)
        });
      } catch (error) {
        await showError(tabId, {
          sourceText: trimmedSource,
          sourceLanguage: await sourceLanguagePromise.catch(() => null),
          targetLanguages: langs,
          pageUrl: pageUrl || "",
          errorInfo: formatErrorMessage(error, {
            model: config.model,
            provider: config.provider,
            apiUrl: config.apiUrl
          })
        });
      }
      return;
    }

    const orderedResults = new Array(langs.length);

    await Promise.all([
      sourceLanguagePromise,
      ...langs.map(async (lang, index) => {
        let item;

        try {
          const result = await requestTranslation(config, trimmedSource, lang);
          item = { ok: true, ...result };
        } catch (error) {
          item = {
            ok: false,
            targetLanguage: lang,
            errorInfo: formatErrorMessage(error, {
            model: config.model,
            provider: config.provider,
            apiUrl: config.apiUrl
          })
          };
        }

        orderedResults[index] = item;

        await showPartialResult(tabId, {
          sourceText: trimmedSource,
          targetLanguages: langs,
          pageUrl: pageUrl || "",
          translation: item
        });
      })
    ]);

    const results = orderedResults.filter(Boolean);
    const successes = results.filter((item) => item.ok);
    const sourceLanguage = await sourceLanguagePromise.catch(() => null);

    if (!successes.length) {
      await showError(tabId, {
        sourceText: trimmedSource,
        sourceLanguage,
        targetLanguages: langs,
        pageUrl: pageUrl || "",
        errorInfo: results[0]?.errorInfo || {
          title: "Translation failed",
          message: "All translations failed.",
          hint: ""
        }
      });
      return;
    }

    await showResult(tabId, {
      sourceText: trimmedSource,
      sourceLanguage,
      targetLanguages: langs,
      pageUrl: pageUrl || "",
      translations: results,
      finalizeOnly: true,
      ...llmHistoryFields(config)
    });
  } catch (error) {
    try {
      await showError(tabId, {
        sourceText: trimmedSource,
        targetLanguages: langs,
        pageUrl: pageUrl || "",
        errorInfo: formatErrorMessage(error, {
          model: config?.model,
          provider: config?.provider,
          apiUrl: config?.apiUrl
        })
      });
    } catch (innerError) {
      console.error("Failed to display error in modal:", innerError);
    }
  }
}

async function rebuildContextMenus() {
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));

  chrome.contextMenus.create({
    id: CONTEXT_MENU_PARENT_ID,
    title: CONTEXT_MENU_TITLE,
    contexts: ["selection"]
  });

  const config = await getStoredConfig();
  const favorites = config.favoriteLanguages;

  if (favorites.length > 1) {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ALL_FAVORITES_ID,
      parentId: CONTEXT_MENU_PARENT_ID,
      title: CONTEXT_MENU_ALL_FAVORITES_TITLE,
      contexts: ["selection"]
    });
  }

  for (const lang of favorites) {
    chrome.contextMenus.create({
      id: languageMenuId(lang.code),
      parentId: CONTEXT_MENU_PARENT_ID,
      title: lang.label,
      contexts: ["selection"]
    });
  }
}

async function initializeExtension() {
  await resolveActiveConfig();
  await rebuildContextMenus();
}

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

initializeExtension();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  const pageUrl = tab.url || "";
  if (pageUrl.startsWith("chrome://") || pageUrl.startsWith("chrome-extension://") || pageUrl.startsWith("edge://")) {
    return;
  }

  try {
    const initialText = await getTabSelectionText(tab.id);
    await showComposer(tab.id, { initialText, pageUrl });
  } catch {
    // Injection blocked on this page (e.g. restricted URLs)
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const config = await getStoredConfig();
  const favorites = config.favoriteLanguages;

  if (info.menuItemId === CONTEXT_MENU_ALL_FAVORITES_ID) {
    await translateLanguages(tab.id, info.selectionText, favorites, tab.url || "");
    return;
  }

  const menuCode = menuIdToLanguageCode(info.menuItemId);
  if (!menuCode) return;

  const targetLanguage = favorites.find(
    (lang) => normalizeLanguageCode(lang.code) === normalizeLanguageCode(menuCode)
  );

  if (!targetLanguage) return;

  await translateLanguages(tab.id, info.selectionText, [targetLanguage], tab.url || "");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === MESSAGE_ACTION.RETRY_TRANSLATION) {
    const tabId = sender.tab?.id;
    const { sourceText, targetLanguages, pageUrl } = message;
    const langs = Array.isArray(targetLanguages) ? targetLanguages : [];

    if (tabId && sourceText && langs.length) {
      translateLanguages(tabId, sourceText, langs, pageUrl);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "Missing tab, source text, or target languages" });
    }
    return true;
  }

  if (message.action === MESSAGE_ACTION.GET_CONFIG) {
    resolveActiveConfig().then((config) =>
      sendResponse({ ok: true, config, languagePresets: LANGUAGES_PRESET })
    );
    return true;
  }

  if (message.action === MESSAGE_ACTION.SAVE_CONFIG) {
    saveStoredConfig(message.config)
      .then((config) => rebuildContextMenus().then(() => sendResponse({ ok: true, config })))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Save failed" }));
    return true;
  }

  if (message.action === MESSAGE_ACTION.FETCH_MODELS) {
    fetchAvailableModels(message.apiUrl, message.authToken, message.provider)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Could not load models", models: [] }));
    return true;
  }

  if (message.action === MESSAGE_ACTION.GET_HISTORY) {
    getStoredHistory().then((history) => sendResponse({ ok: true, history }));
    return true;
  }

  if (message.action === MESSAGE_ACTION.SAVE_HISTORY_ENTRY) {
    addHistoryEntry(message.entry).then((history) => sendResponse({ ok: true, history }));
    return true;
  }

  if (message.action === MESSAGE_ACTION.CLEAR_HISTORY) {
    clearStoredHistory().then(() => sendResponse({ ok: true, history: [] }));
    return true;
  }

  if (message.action === MESSAGE_ACTION.REMOVE_HISTORY_ENTRY) {
    getStoredHistory().then((history) => {
      const filtered = history.filter((item) => item.id !== message.id);
      return saveStoredHistory(filtered).then(() => sendResponse({ ok: true, history: filtered }));
    });
    return true;
  }

  if (message.action === MESSAGE_ACTION.GET_FLAG_IMAGE) {
    fetchFlagDataUrl(message.langCode, message.width)
      .then((dataUrl) => sendResponse({ ok: Boolean(dataUrl), dataUrl: dataUrl || null }))
      .catch(() => sendResponse({ ok: false, dataUrl: null }));
    return true;
  }

  return false;
});
