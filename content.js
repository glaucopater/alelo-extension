(() => {
  if (window[CONTENT_GLOBAL.LOADED]) return;
  window[CONTENT_GLOBAL.LOADED] = true;

  let overlay = null;
  let shadowHost = null;
  let spinner = null;
  let formattedBox = null;
  let rawBox = null;
  let errorBox = null;
  let copyBtn = null;
  let actionStatus = null;
  let runBtn = null;
  let tabRaw = null;
  let versionEl = null;
  let settingsBtn = null;
  let settingsPanel = null;
  let settingsCloseBtn = null;
  let modalEl = null;
  let drawerLayer = null;
  let historyBtn = null;
  let historyPanel = null;
  let historyCloseBtn = null;
  let historyList = null;
  let historyEmpty = null;
  let historyClearBtn = null;
  let configApiUrl = null;
  let configProvider = null;
  let configModel = null;
  let configTemperature = null;
  let configModelsRefreshBtn = null;
  let configModelMeta = null;
  let configModelsStatus = null;
  let configAuthToken = null;
  let configSaveBtn = null;
  let configStatus = null;
  let favoritesList = null;
  let favoritesPicker = null;
  let favoritesPickerTrigger = null;
  let favoritesPickerMenu = null;
  let favoritesAddRow = null;
  let selectedPresetCode = "";
  let favoritesAddBtn = null;
  let favoritesCustomCode = null;
  let favoritesCustomLabel = null;
  let favoritesAddCustomBtn = null;
  let targetLangEl = null;
  let composerLangBar = null;
  let composerLangButtons = null;
  let pageSourceEl = null;
  let sourceTextEl = null;
  let sourceInputEl = null;
  let sourceExpandBtn = null;
  let sourceWrap = null;
  let composerWrap = null;
  let translateBtn = null;
  let composerHint = null;

  let currentRawJson = "";
  let currentTranslatedText = "";
  let lastTranslations = [];
  let lastSourceText = "";
  let lastSourceLanguage = null;
  let lastSourceLanguagePending = false;
  let lastTargetLang = null;
  let lastRequestedLanguages = [];
  let lastPageUrl = "";
  let isErrorState = false;
  let isRunning = false;
  let isComposerMode = false;
  let cssLoaded = false;
  let historyEntries = [];
  let activeHistoryId = null;
  let languagePresets = [];
  let draftFavoriteLanguages = [];
  let availableModels = [];
  let storedModelInfo = null;
  let isLoadingModels = false;

  function closeModal() {
    if (shadowHost) {
      shadowHost.remove();
      shadowHost = null;
    }
    overlay = null;
    cssLoaded = false;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function inlineFormat(s) {
    let html = escapeHtml(s);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`(.+?)`/g, "<code>$1</code>");
    return html;
  }

  function truncateText(text, max = UI_LIMIT.TEXT_TRUNCATE) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  function truncateUrl(url, max = UI_LIMIT.URL_TRUNCATE) {
    const text = String(url || "");
    if (text.length <= max) return text;
    const start = Math.ceil((max - 1) / 2);
    const end = Math.floor((max - 1) / 2);
    return `${text.slice(0, start)}…${text.slice(-end)}`;
  }

  function formatRelativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function pageHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  function formatHistoryEndpoint(apiUrl) {
    const value = String(apiUrl || "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return value;
    }
  }

  function describePageSource(pageUrl) {
    const url = String(pageUrl || "").trim();
    if (!url) return { label: "", html: "" };

    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        const display = truncateUrl(url);
        return {
          label: parsed.hostname,
          html: `Found on <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(display)}</a>`
        };
      }

      if (parsed.protocol === "file:") {
        return { label: "Local file", html: "Found on a local file page" };
      }

      if (parsed.protocol === "chrome:" || parsed.protocol === "chrome-extension:") {
        return { label: "Browser page", html: "Found on a browser internal page" };
      }

      return { label: parsed.protocol.replace(":", ""), html: `Found on ${escapeHtml(parsed.protocol)} page` };
    } catch {
      return { label: "", html: "" };
    }
  }

  function formatDuration(ms) {
    if (ms == null || Number.isNaN(ms)) return null;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  }

  function extractDurationMs(parsed) {
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

  function extractStatsFromRaw(rawJsonText) {
    try {
      const parsed = JSON.parse(rawJsonText);

      const usage = parsed?.usage;
      let promptTokens = parsed?.prompt_eval_count ?? null;
      let outputTokens = parsed?.eval_count ?? null;
      let totalTokens = null;

      if (usage && (usage.prompt_tokens != null || usage.completion_tokens != null)) {
        promptTokens = usage.prompt_tokens ?? null;
        outputTokens = usage.completion_tokens ?? null;
        const prompt = promptTokens ?? 0;
        const output = outputTokens ?? 0;
        totalTokens =
          usage.total_tokens ??
          (usage.prompt_tokens != null || usage.completion_tokens != null ? prompt + output : null);
      } else if (promptTokens != null || outputTokens != null) {
        const prompt = promptTokens ?? 0;
        const output = outputTokens ?? 0;
        totalTokens = prompt + output;
      }

      const durationMs = extractDurationMs(parsed);

      if (durationMs == null && totalTokens == null) {
        return null;
      }

      return {
        durationMs,
        promptTokens,
        outputTokens,
        totalTokens
      };
    } catch {
      return null;
    }
  }

  function historyEntryStats(entry) {
    const translations = normalizeHistoryTranslations(entry);
    for (const item of translations) {
      const stats = extractStatsFromRaw(item.rawJsonText || "");
      if (stats?.durationMs != null || stats?.totalTokens != null) return stats;
    }
    return extractStatsFromRaw(entry.rawJsonText || "");
  }

  function historySummary(entry) {
    const parts = [];
    const source = entry.sourceLanguage?.label || entry.sourceLanguage?.code;
    if (source) parts.push(source);
    const langs = entry.translations?.length
      ? entry.translations.map((item) => item.targetLanguage?.label || item.targetLanguage?.code).filter(Boolean)
      : [];
    if (langs.length > 1) {
      parts.push(`${langs.length} target languages`);
    } else {
      const lang = entry.targetLanguage?.label || entry.targetLanguage?.code || langs[0];
      if (lang) parts.push(lang);
    }
    const host = pageHostname(entry.pageUrl);
    if (host) parts.push(host);
    if (entry.model) parts.push(truncateText(entry.model, 48));
    const endpoint = formatHistoryEndpoint(entry.apiUrl);
    if (endpoint) parts.push(endpoint);
    const stats = historyEntryStats(entry);
    const duration = formatDuration(stats?.durationMs);
    if (duration) parts.push(duration);
    return parts.join(" · ") || "Saved translation";
  }

  function normalizeSourceLanguage(sourceLanguage) {
    return resolveLanguageEntry(sourceLanguage);
  }

  function setSourceLanguageState(sourceLanguage, pending = false) {
    lastSourceLanguage = resolveLanguageEntry(sourceLanguage);
    lastSourceLanguagePending = pending;
    updateLanguageRouteDisplay();
  }

  function formatLanguageLabels(languages) {
    const labels = (languages || [])
      .map((lang) => lang?.label || lang?.code)
      .filter(Boolean);
    if (!labels.length) return "";
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  }

  function normalizeResultTranslations(payload) {
    if (Array.isArray(payload?.translations) && payload.translations.length) {
      return payload.translations;
    }

    if (payload?.translatedText) {
      return [
        {
          ok: true,
          targetLanguage: payload.targetLanguage || null,
          translatedText: payload.translatedText,
          rawJsonText: payload.rawJsonText || ""
        }
      ];
    }

    return [];
  }

  function normalizeHistoryTranslations(entry) {
    if (Array.isArray(entry?.translations) && entry.translations.length) {
      return entry.translations;
    }

    if (entry?.translatedText) {
      return [
        {
          ok: true,
          targetLanguage: entry.targetLanguage || null,
          translatedText: entry.translatedText,
          rawJsonText: entry.rawJsonText || ""
        }
      ];
    }

    return [];
  }

  const FLAG_PLACEHOLDER_PIXEL =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  const flagDataUrlCache = new Map();
  const flagLoadPromises = new Map();

  function missingFlagMarkup(width = 20) {
    const height = Math.round(width * 0.75);
    return `<span class="alelo-flag alelo-flag-missing" aria-hidden="true" style="width:${width}px;height:${height}px"></span>`;
  }

  function replaceMissingFlag(img, width = 20) {
    const span = document.createElement("span");
    span.className = "alelo-flag alelo-flag-missing";
    span.setAttribute("aria-hidden", "true");
    span.style.width = `${width}px`;
    span.style.height = `${Math.round(width * 0.75)}px`;
    img.replaceWith(span);
  }

  async function loadFlagImage(img) {
    if (!img || img.dataset.flagLoaded === "1" || img.dataset.flagLoading === "1") return;

    const code = img.dataset.flagCode;
    const width = Number(img.dataset.flagWidth || 20);
    const flagUrl = code ? getLanguageFlagUrl(code, width) : null;
    if (!flagUrl) {
      replaceMissingFlag(img, width);
      return;
    }

    img.dataset.flagLoading = "1";
    const cacheKey = flagUrl;

    try {
      let dataUrl = flagDataUrlCache.get(cacheKey);
      if (!dataUrl) {
        if (!flagLoadPromises.has(cacheKey)) {
          flagLoadPromises.set(
            cacheKey,
            chrome.runtime
              .sendMessage({
                action: MESSAGE_ACTION.GET_FLAG_IMAGE,
                langCode: code,
                width
              })
              .then((response) => (response?.ok ? response.dataUrl : null))
              .finally(() => flagLoadPromises.delete(cacheKey))
          );
        }
        dataUrl = await flagLoadPromises.get(cacheKey);
        if (dataUrl) {
          flagDataUrlCache.set(cacheKey, dataUrl);
        }
      }

      if (!img.isConnected) return;

      if (dataUrl) {
        img.src = dataUrl;
        img.classList.remove("alelo-flag-pending");
        img.dataset.flagLoaded = "1";
      } else {
        replaceMissingFlag(img, width);
      }
    } catch {
      if (img.isConnected) {
        replaceMissingFlag(img, width);
      }
    } finally {
      delete img.dataset.flagLoading;
    }
  }

  function hydrateLanguageFlags(root) {
    if (!root) return;
    root.querySelectorAll("img.alelo-flag-pending[data-flag-code]").forEach((img) => {
      loadFlagImage(img);
    });
  }

  function setupFlagHydration(root) {
    if (!root || root.__aleloFlagObserver) return;
    root.__aleloFlagObserver = true;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.("img.alelo-flag-pending[data-flag-code]")) {
            loadFlagImage(node);
          }
          node.querySelectorAll?.("img.alelo-flag-pending[data-flag-code]").forEach((img) => {
            loadFlagImage(img);
          });
        });
      }
    });

    observer.observe(root, { childList: true, subtree: true });
    hydrateLanguageFlags(root);
  }

  function normalizeLanguageCode(code) {
    return String(code || "")
      .trim()
      .replace(/_/g, "-")
      .split("-")
      .map((part, index) => (index === 0 ? part.toLowerCase() : part.toUpperCase()))
      .join("-");
  }

  function resolveLanguageEntry(lang) {
    if (!lang) return null;

    if (typeof lang === "string") {
      const raw = lang.trim();
      if (!raw) return null;
      const normalized = normalizeLanguageCode(raw);
      const byCode = LANGUAGES_PRESET.find((item) => normalizeLanguageCode(item.code) === normalized);
      if (byCode) return { code: byCode.code, label: byCode.label };
      const byLabel = LANGUAGES_PRESET.find((item) => item.label.toLowerCase() === raw.toLowerCase());
      if (byLabel) return { code: byLabel.code, label: byLabel.label };
      return { code: normalized, label: raw };
    }

    const code = normalizeLanguageCode(lang.code);
    if (!code) return null;
    const preset = LANGUAGES_PRESET.find((item) => normalizeLanguageCode(item.code) === code);
    const label = String(lang.label || preset?.label || code).trim();
    return { code: preset?.code || code, label: label || code };
  }

  function renderLanguageFlag(lang, width = 20) {
    const entry = resolveLanguageEntry(lang);
    const code = entry?.code;
    if (!code || !getLanguageFlagUrl(code, width)) {
      return missingFlagMarkup(width);
    }

    const height = Math.round(width * 0.75);
    return `<img class="alelo-flag alelo-flag-pending" src="${FLAG_PLACEHOLDER_PIXEL}" data-flag-code="${escapeHtml(code)}" data-flag-width="${width}" alt="" width="${width}" height="${height}" />`;
  }

  function renderLanguageChip(lang, width = 16) {
    const entry = resolveLanguageEntry(lang);
    if (!entry) return "";
    return `<span class="alelo-lang-chip">${renderLanguageFlag(entry, width)}<span class="alelo-lang-chip-label">${escapeHtml(entry.label)}</span></span>`;
  }

  function renderLanguageChipsRow(languages, width = 16) {
    const items = (languages || []).map(resolveLanguageEntry).filter(Boolean);
    if (!items.length) return "";
    return `<span class="alelo-lang-chips">${items.map((entry) => renderLanguageChip(entry, width)).join("")}</span>`;
  }

  function setFormattedTranslationsHtml(html) {
    if (!formattedBox) return;
    formattedBox.innerHTML = html;
    hydrateLanguageFlags(formattedBox);
  }

  function languageCardKey(lang) {
    return normalizeLanguageCode(lang?.code || "");
  }

  function renderPendingTranslationCard(lang) {
    const code = languageCardKey(lang);
    return `
      <div class="alelo-translation-card alelo-translation-card-pending" data-lang-code="${escapeHtml(code)}">
        <h4 class="alelo-translation-card-title">${renderLanguageChip(lang, 16)}</h4>
        <div class="alelo-card-spinner"><div class="alelo-spinner"></div></div>
      </div>`;
  }

  function renderPendingTranslationsHtml(languages) {
    return `<div class="alelo-translations">${(languages || [])
      .map((lang) => renderPendingTranslationCard(lang))
      .join("")}</div>`;
  }

  function upsertTranslationResult(translation) {
    const code = languageCardKey(translation?.targetLanguage);
    if (!code) return;

    const existingIndex = lastTranslations.findIndex(
      (item) => languageCardKey(item?.targetLanguage) === code
    );

    if (existingIndex >= 0) {
      lastTranslations[existingIndex] = translation;
    } else {
      lastTranslations.push(translation);
    }

    syncLegacyTranslationFields(lastTranslations);
  }

  function updateTranslationCard(translation) {
    if (!formattedBox) return;

    const code = languageCardKey(translation?.targetLanguage);
    const card = formattedBox.querySelector(`[data-lang-code="${code}"]`);
    if (!card) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderTranslationCard(translation).trim();
    const nextCard = wrapper.firstElementChild;
    if (nextCard) {
      card.replaceWith(nextCard);
      hydrateLanguageFlags(formattedBox);
    }
  }

  function renderTranslationCard(item) {
    const code = languageCardKey(item.targetLanguage);

    if (!item.ok) {
      const errorInfo = item.errorInfo || {};
      return `
        <div class="alelo-translation-card alelo-translation-card-error" data-lang-code="${escapeHtml(code)}">
          <h4 class="alelo-translation-card-title">${renderLanguageChip(item.targetLanguage, 16)}</h4>
          <p class="alelo-translation-card-error-text">${escapeHtml(errorInfo.message || "Translation failed")}</p>
        </div>`;
    }

    const stats = extractStatsFromRaw(item.rawJsonText);
    const text = String(item.translatedText || "").trim() || "No translation returned";
    return `
      <div class="alelo-translation-card" data-lang-code="${escapeHtml(code)}">
        <h4 class="alelo-translation-card-title">${renderLanguageChip(item.targetLanguage, 16)}</h4>
        ${renderTranslationMeta(stats)}
        <div class="alelo-translation-output">${inlineFormat(text)}</div>
      </div>`;
  }

  function renderTranslationsHtml(translations) {
    const items = translations || [];
    if (!items.length) {
      return `<div class="alelo-translation"><div class="alelo-translation-output">No translation returned</div></div>`;
    }

    return `<div class="alelo-translations">${items.map((item) => renderTranslationCard(item)).join("")}</div>`;
  }

  function buildCopyText(translations) {
    return (translations || [])
      .filter((item) => item.ok && item.translatedText)
      .map((item) => {
        const label = item.targetLanguage?.label || item.targetLanguage?.code || "Translation";
        return `${label}:\n${item.translatedText}`;
      })
      .join("\n\n");
  }

  function buildRawJson(translations) {
    return JSON.stringify(translations || [], null, 2);
  }

  function syncLegacyTranslationFields(translations) {
    const successes = (translations || []).filter((item) => item.ok && item.translatedText);
    lastTranslations = translations || [];
    currentTranslatedText = buildCopyText(successes);
    currentRawJson = buildRawJson(translations);
  }

  function setRequestedLanguages(languages) {
    lastRequestedLanguages = (languages || []).filter(Boolean);
    lastTargetLang = lastRequestedLanguages[0] || null;
    if (isComposerMode) {
      updateComposerLanguageBar();
    } else {
      updateLanguageRouteDisplay();
    }
  }

  function findFavoriteLanguage(code) {
    const normalized = normalizeLanguageCode(code);
    return lastRequestedLanguages.find(
      (lang) => normalizeLanguageCode(lang.code) === normalized
    );
  }

  function renderComposerLanguageButton(lang) {
    const entry = resolveLanguageEntry(lang);
    if (!entry) return "";

    const code = normalizeLanguageCode(entry.code);
    return `<button type="button" class="alelo-lang-btn" data-lang-code="${escapeHtml(code)}" title="Translate to ${escapeHtml(entry.label)}">${renderLanguageFlag(entry, 20)}<span class="alelo-lang-chip-label">${escapeHtml(entry.label)}</span></button>`;
  }

  function updateComposerLanguageBar() {
    if (!composerLangButtons || !isComposerMode) return;

    const favorites = lastRequestedLanguages || [];
    composerLangButtons.innerHTML = favorites.map(renderComposerLanguageButton).join("");
    hydrateLanguageFlags(composerLangButtons);

    const enabled = favorites.length > 0 && !isRunning;
    if (translateBtn) translateBtn.disabled = !enabled;
    composerLangButtons.querySelectorAll(".alelo-lang-btn").forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  function renderTranslationMeta(stats) {
    const items = [];
    const duration = formatDuration(stats?.durationMs);
    if (duration) {
      items.push(
        `<span class="alelo-meta-item"><span class="alelo-meta-label">Generation time</span> ${escapeHtml(duration)}</span>`
      );
    }
    if (stats?.totalTokens != null) {
      const tokenDetail =
        stats.promptTokens != null && stats.outputTokens != null
          ? `${stats.promptTokens.toLocaleString()} prompt · ${stats.outputTokens.toLocaleString()} output`
          : `${stats.totalTokens.toLocaleString()} total`;
      items.push(
        `<span class="alelo-meta-item"><span class="alelo-meta-label">Tokens</span> ${escapeHtml(tokenDetail)}</span>`
      );
    }
    if (!items.length) return "";
    return `<div class="alelo-translation-meta">${items.join("")}</div>`;
  }

  function renderTranslationHtml(translatedText, rawJsonText) {
    const stats = extractStatsFromRaw(rawJsonText);
    const text = String(translatedText || "").trim() || "No translation returned";
    return `
      <div class="alelo-translation">
        ${renderTranslationMeta(stats)}
        <div class="alelo-translation-output">${inlineFormat(text)}</div>
      </div>`;
  }

  function updateLanguageRouteDisplay() {
    if (!targetLangEl) return;

    const targets = lastRequestedLanguages || [];
    const parts = [];

    if (lastSourceLanguage) {
      parts.push(renderLanguageChip(lastSourceLanguage, 16));
    } else if (lastSourceLanguagePending) {
      parts.push(`<span class="alelo-source-lang-pending">Detecting language…</span>`);
    }

    const targetPart = renderLanguageChipsRow(targets, 16);
    if (parts.length && targetPart) {
      parts.push(`<span class="alelo-lang-arrow">→</span>`, targetPart);
    } else if (targetPart) {
      parts.push(targetPart);
    }

    targetLangEl.innerHTML = parts.join("");
    hydrateLanguageFlags(targetLangEl);
  }

  function updatePageSourceDisplay(pageUrl) {
    if (!pageSourceEl) return;
    const source = describePageSource(pageUrl);
    pageSourceEl.innerHTML = source.html;
  }

  function updateSourceTextDisplay(sourceText, expanded = false) {
    if (!sourceTextEl || !sourceExpandBtn) return;

    const text = String(sourceText || "");
    sourceTextEl.textContent = text;
    sourceTextEl.classList.toggle("alelo-source-expanded", expanded);

    const needsExpand = text.length > UI_LIMIT.SOURCE_TEXT_PREVIEW || text.includes("\n");
    sourceExpandBtn.classList.toggle("alelo-hidden", !needsExpand || expanded);
    sourceExpandBtn.textContent = expanded ? "Show less" : "Show more";
    if (!isComposerMode) {
      sourceWrap?.classList.toggle("alelo-hidden", !text);
    }
  }

  function setComposerMode(enabled) {
    isComposerMode = enabled;
    composerWrap?.classList.toggle("alelo-hidden", !enabled);
    sourceWrap?.classList.toggle("alelo-hidden", enabled);
    targetLangEl?.classList.toggle("alelo-hidden", enabled);
    composerLangBar?.classList.toggle("alelo-hidden", !enabled);

    if (enabled) {
      formattedBox.innerHTML = "";
      rawBox.textContent = "";
      errorBox.innerHTML = "";
      errorBox.classList.add("alelo-hidden");
      spinner.classList.add("alelo-hidden");
      isErrorState = false;
      activeHistoryId = null;
      setRunningState(false);
      if (runBtn) runBtn.disabled = true;
      activateTab("formatted");
      closeSidePanels();
      updateComposerLanguageBar();
    } else {
      updateLanguageRouteDisplay();
    }
  }

  function updateComposerHint(message = "") {
    if (!composerHint) return;
    composerHint.textContent = message;
  }

  async function openComposer(payload) {
    await ensureModal();

    let favorites = [];
    try {
      const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTION.GET_CONFIG });
      favorites = response?.ok ? response.config?.favoriteLanguages || [] : [];
    } catch {
      favorites = [];
    }

    lastSourceText = "";
    lastPageUrl = payload?.pageUrl || window.location.href;
    lastTranslations = [];
    currentRawJson = "";
    currentTranslatedText = "";
    setRequestedLanguages(favorites);
    setSourceLanguageState(null, false);
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay("", false);
    setComposerMode(true);

    if (sourceInputEl) {
      sourceInputEl.value = payload?.initialText || "";
      sourceInputEl.focus();
    }

    if (!favorites.length) {
      updateComposerHint("Add at least one favorite language in Settings.");
    } else {
      updateComposerHint("");
    }
    updateComposerLanguageBar();
  }

  async function submitComposerTranslation(targetLanguages = null) {
    const text = sourceInputEl?.value?.trim() || "";
    const langs = Array.isArray(targetLanguages) ? targetLanguages.filter(Boolean) : lastRequestedLanguages;

    if (!text) {
      updateComposerHint("Enter some text to translate.");
      sourceInputEl?.focus();
      return;
    }

    if (!langs.length) {
      updateComposerHint("Add at least one favorite language in Settings.");
      openSidePanel(settingsPanel);
      loadConfigIntoForm();
      return;
    }

    updateComposerHint("");
    lastSourceText = text;
    setRequestedLanguages(langs);
    setComposerMode(false);
    updateSourceTextDisplay(lastSourceText, false);
    await runTranslation();
  }

  function bindHistoryStorageSync() {
    if (!chrome.storage?.onChanged || window[CONTENT_GLOBAL.HISTORY_SYNC]) return;
    window[CONTENT_GLOBAL.HISTORY_SYNC] = true;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[HISTORY_STORAGE_KEY]) return;
      historyEntries = changes[HISTORY_STORAGE_KEY].newValue || [];
      updateHistoryBadge();
      if (historyPanel && !historyPanel.classList.contains("alelo-hidden")) {
        renderHistoryList();
      }
    });
  }

  async function fetchHistory() {
    try {
      const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTION.GET_HISTORY });
      historyEntries = response?.ok ? response.history || [] : [];
    } catch {
      historyEntries = [];
    }
    updateHistoryBadge();
    renderHistoryList();
    return historyEntries;
  }

  async function saveToHistory(entry) {
    const translations = normalizeHistoryTranslations(entry);
    const successes = translations.filter((item) => item.ok && item.translatedText);
    if (!entry?.sourceText || !successes.length) return;

    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceText: entry.sourceText,
      sourceLanguage: normalizeSourceLanguage(entry.sourceLanguage),
      translations: successes,
      translatedText: buildCopyText(successes),
      targetLanguage: successes[0]?.targetLanguage || null,
      pageUrl: entry.pageUrl || "",
      model: String(entry.model || "").trim(),
      apiUrl: String(entry.apiUrl || "").trim(),
      provider: String(entry.provider || "").trim(),
      rawJsonText: buildRawJson(translations)
    };

    try {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGE_ACTION.SAVE_HISTORY_ENTRY,
        entry: payload
      });
      if (response?.ok) {
        historyEntries = response.history || [];
        activeHistoryId = payload.id;
        updateHistoryBadge();
        renderHistoryList();
      }
    } catch {
      // History save is best-effort
    }
  }

  function updateHistoryBadge() {
    if (!historyBtn) return;
    const count = historyEntries.length;
    historyBtn.title = count ? `History (${count})` : "History";
    historyBtn.dataset.count = count ? String(count) : "";
  }

  function isDrawerPanelOpen(panel) {
    return Boolean(
      panel &&
        drawerLayer &&
        !drawerLayer.classList.contains("alelo-hidden") &&
        !panel.classList.contains("alelo-hidden")
    );
  }

  function openSidePanel(panel) {
    if (!drawerLayer || !panel) return;

    closeSidePanels();
    drawerLayer.classList.remove("alelo-hidden");
    drawerLayer.setAttribute("aria-hidden", "false");
    modalEl?.classList.add("alelo-drawer-open");
    panel.classList.remove("alelo-hidden");

    const isSettings = panel === settingsPanel;
    settingsBtn?.classList.toggle("alelo-btn-active", isSettings);
    historyBtn?.classList.toggle("alelo-btn-active", !isSettings);
  }

  function closeSidePanels() {
    settingsPanel?.classList.add("alelo-hidden");
    historyPanel?.classList.add("alelo-hidden");
    drawerLayer?.classList.add("alelo-hidden");
    drawerLayer?.setAttribute("aria-hidden", "true");
    modalEl?.classList.remove("alelo-drawer-open");
    settingsBtn?.classList.remove("alelo-btn-active");
    historyBtn?.classList.remove("alelo-btn-active");
    closePresetPicker();
  }

  function renderHistoryList() {
    if (!historyList || !historyEmpty) return;

    if (!historyEntries.length) {
      historyList.innerHTML = "";
      historyEmpty.classList.remove("alelo-hidden");
      return;
    }

    historyEmpty.classList.add("alelo-hidden");
    historyList.innerHTML = historyEntries
      .map((entry) => {
        const isActive = entry.id === activeHistoryId;
        const translations = normalizeHistoryTranslations(entry);
        const flagLangs =
          translations.length > 1
            ? translations.map((item) => item.targetLanguage).filter(Boolean)
            : [entry.targetLanguage || translations[0]?.targetLanguage].filter(Boolean);
        const snippet = truncateText(entry.sourceText, UI_LIMIT.HISTORY_SNIPPET);
        const routeParts = [];
        if (entry.sourceLanguage) {
          routeParts.push(renderLanguageChip(entry.sourceLanguage, 16));
        }
        const targetChips = renderLanguageChipsRow(flagLangs, 16);
        if (routeParts.length && targetChips) {
          routeParts.push(`<span class="alelo-lang-arrow">→</span>`, targetChips);
        } else if (targetChips) {
          routeParts.push(targetChips);
        }
        return `
          <div class="alelo-history-item${isActive ? " alelo-history-item-active" : ""}" data-id="${escapeHtml(entry.id)}">
            <button type="button" class="alelo-history-restore" data-id="${escapeHtml(entry.id)}">
              <span class="alelo-history-title">${routeParts.join("")}<span class="alelo-history-snippet">${escapeHtml(`"${snippet}"`)}</span></span>
              <span class="alelo-history-meta">${escapeHtml(formatRelativeTime(entry.savedAt))} · ${escapeHtml(historySummary(entry))}</span>
            </button>
            <button type="button" class="alelo-history-delete" data-id="${escapeHtml(entry.id)}" aria-label="Remove from history" title="Remove">×</button>
          </div>`;
      })
      .join("");

    hydrateLanguageFlags(historyList);
  }

  function restoreHistoryEntry(entry) {
    if (!entry) return;

    setComposerMode(false);
    isErrorState = false;
    activeHistoryId = entry.id;
    lastSourceText = entry.sourceText || "";
    lastPageUrl = entry.pageUrl || "";
    setSourceLanguageState(entry.sourceLanguage, false);
    const translations = normalizeHistoryTranslations(entry);
    setRequestedLanguages(translations.map((item) => item.targetLanguage).filter(Boolean));
    syncLegacyTranslationFields(translations);

    updateLanguageRouteDisplay();
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay(lastSourceText, false);
    spinner.classList.add("alelo-hidden");
    errorBox.innerHTML = "";
    errorBox.classList.add("alelo-hidden");
    formattedBox.innerHTML = renderTranslationsHtml(translations);
    hydrateLanguageFlags(formattedBox);
    rawBox.textContent = currentRawJson || "No raw JSON available";
    actionStatus.textContent = "";

    setRunningState(false);
    closeSidePanels();
    activateTab("formatted");
    renderHistoryList();
  }

  async function removeHistoryEntry(id) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGE_ACTION.REMOVE_HISTORY_ENTRY,
        id
      });
      if (response?.ok) {
        historyEntries = response.history || [];
        updateHistoryBadge();
        renderHistoryList();
      }
    } catch {
      // ignore
    }
  }

  async function clearHistory() {
    try {
      const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTION.CLEAR_HISTORY });
      if (response?.ok) {
        historyEntries = [];
        updateHistoryBadge();
        renderHistoryList();
      }
    } catch {
      // ignore
    }
  }

  function toggleHistoryPanel() {
    if (isDrawerPanelOpen(historyPanel)) {
      closeSidePanels();
      return;
    }

    openSidePanel(historyPanel);
    fetchHistory();
  }

  function copyFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-999999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }

    textarea.remove();
    return ok;
  }

  function showActionStatus(text, isError = false) {
    if (!actionStatus) return;
    actionStatus.textContent = text;
    actionStatus.classList.toggle("alelo-action-status-error", isError);
    if (text) {
      setTimeout(() => {
        if (actionStatus?.textContent === text) {
          actionStatus.textContent = "";
          actionStatus.classList.remove("alelo-action-status-error");
        }
      }, 1500);
    }
  }

  async function copyTranslation() {
    const text = currentTranslatedText || "";
    if (!text) return;

    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = copyFallback(text);
      }
    } catch {
      ok = copyFallback(text);
    }

    showActionStatus(ok ? "Copied" : "Copy failed", !ok);
  }

  function setRunningState(running) {
    isRunning = running;
    if (isComposerMode) {
      updateComposerLanguageBar();
    }
    if (runBtn) {
      runBtn.disabled = running || !lastSourceText || !lastRequestedLanguages.length;
      runBtn.classList.toggle("alelo-running", running);
      runBtn.title = running
        ? "Translation in progress…"
        : lastRequestedLanguages.length > 1
          ? "Retry all translations"
          : "Retry translation";
    }
  }

  function activateTab(name) {
    const showFormatted = name === "formatted";

    tabRaw.classList.toggle("alelo-tab-active", !showFormatted);
    tabRaw.title = showFormatted ? "Raw JSON" : "Translation";
    tabRaw.setAttribute("aria-label", showFormatted ? "Raw JSON view" : "Translation view");

    if (isErrorState) {
      errorBox.classList.toggle("alelo-hidden", !showFormatted);
      rawBox.classList.toggle("alelo-hidden", showFormatted);
      formattedBox.classList.add("alelo-hidden");
      return;
    }

    errorBox.classList.add("alelo-hidden");
    formattedBox.classList.toggle("alelo-hidden", !showFormatted);
    rawBox.classList.toggle("alelo-hidden", showFormatted);
  }

  function renderFavoritesList() {
    if (!favoritesList) return;

    favoritesList.innerHTML = draftFavoriteLanguages
      .map((lang, index) => {
        const canRemove = draftFavoriteLanguages.length > 1;
        const canMoveUp = index > 0;
        const canMoveDown = index < draftFavoriteLanguages.length - 1;
        return `
          <div class="alelo-favorite-item" data-index="${index}">
            <div class="alelo-favorite-label">${renderLanguageChip(lang, 20)}</div>
            <div class="alelo-favorite-code">${escapeHtml(lang.code)}</div>
            <div class="alelo-favorite-actions">
              <button type="button" class="alelo-btn alelo-btn-small alelo-fav-up" data-index="${index}" ${canMoveUp ? "" : "disabled"} title="Move up">↑</button>
              <button type="button" class="alelo-btn alelo-btn-small alelo-fav-down" data-index="${index}" ${canMoveDown ? "" : "disabled"} title="Move down">↓</button>
              <button type="button" class="alelo-btn alelo-btn-small alelo-fav-remove" data-index="${index}" ${canRemove ? "" : "disabled"} title="Remove">×</button>
            </div>
          </div>`;
      })
      .join("");

    hydrateLanguageFlags(favoritesList);
  }

  function resetPresetPickerMenuPosition() {
    if (!favoritesPickerMenu) return;
    favoritesPickerMenu.style.position = "";
    favoritesPickerMenu.style.top = "";
    favoritesPickerMenu.style.bottom = "";
    favoritesPickerMenu.style.left = "";
    favoritesPickerMenu.style.width = "";
    favoritesPickerMenu.style.maxHeight = "";
    favoritesPickerMenu.style.zIndex = "";
  }

  function positionPresetPickerMenu() {
    if (!favoritesPickerMenu || !favoritesAddRow || favoritesPickerMenu.classList.contains("alelo-hidden")) {
      return;
    }

    const rect = favoritesAddRow.getBoundingClientRect();
    const maxHeight = 220;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const openUpward = spaceBelow < 120 && rect.top > spaceBelow;
    const availableHeight = openUpward ? rect.top - viewportPadding - 4 : spaceBelow;

    favoritesPickerMenu.style.position = "fixed";
    favoritesPickerMenu.style.left = `${rect.left}px`;
    favoritesPickerMenu.style.width = `${rect.width}px`;
    favoritesPickerMenu.style.maxHeight = `${Math.max(80, Math.min(maxHeight, availableHeight))}px`;
    favoritesPickerMenu.style.zIndex = "2147483646";

    if (openUpward) {
      favoritesPickerMenu.style.top = "auto";
      favoritesPickerMenu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      favoritesPickerMenu.style.top = `${rect.bottom + 4}px`;
      favoritesPickerMenu.style.bottom = "auto";
    }
  }

  function onPresetPickerLayoutChange() {
    positionPresetPickerMenu();
  }

  function bindPresetPickerLayoutListeners() {
    window.addEventListener("resize", onPresetPickerLayoutChange, { passive: true });
    overlay?.querySelector(".alelo-drawer")?.addEventListener("scroll", onPresetPickerLayoutChange, { passive: true });
  }

  function unbindPresetPickerLayoutListeners() {
    window.removeEventListener("resize", onPresetPickerLayoutChange);
    overlay?.querySelector(".alelo-drawer")?.removeEventListener("scroll", onPresetPickerLayoutChange);
  }

  function mountPresetPickerMenu() {
    if (!favoritesPickerMenu || !overlay) return;
    overlay.appendChild(favoritesPickerMenu);
  }

  function unmountPresetPickerMenu() {
    if (!favoritesPickerMenu || !favoritesAddRow) return;
    favoritesAddRow.appendChild(favoritesPickerMenu);
  }

  function closePresetPicker() {
    if (!favoritesPickerMenu || !favoritesPickerTrigger) return;
    favoritesPickerMenu.classList.add("alelo-hidden");
    favoritesPickerTrigger.setAttribute("aria-expanded", "false");
    favoritesAddRow?.classList.remove("alelo-lang-picker-open");
    resetPresetPickerMenuPosition();
    unbindPresetPickerLayoutListeners();
    unmountPresetPickerMenu();
  }

  function togglePresetPicker() {
    if (!favoritesPickerMenu || !favoritesPickerTrigger || favoritesPickerTrigger.disabled) return;
    const open = favoritesPickerMenu.classList.contains("alelo-hidden");
    if (open) {
      mountPresetPickerMenu();
      favoritesPickerMenu.classList.remove("alelo-hidden");
      favoritesPickerTrigger.setAttribute("aria-expanded", "true");
      favoritesAddRow?.classList.add("alelo-lang-picker-open");
      positionPresetPickerMenu();
      bindPresetPickerLayoutListeners();
    } else {
      closePresetPicker();
    }
  }

  function renderPresetPickerTrigger() {
    if (!favoritesPickerTrigger) return;

    const valueEl = favoritesPickerTrigger.querySelector(".alelo-lang-picker-value");
    if (!valueEl) return;

    if (!selectedPresetCode) {
      valueEl.className = "alelo-lang-picker-value alelo-lang-picker-placeholder";
      valueEl.textContent = "Add a language…";
      return;
    }

    const preset = languagePresets.find(
      (lang) => normalizeLanguageCode(lang.code) === normalizeLanguageCode(selectedPresetCode)
    );
    if (!preset) {
      selectedPresetCode = "";
      renderPresetPickerTrigger();
      return;
    }

    valueEl.className = "alelo-lang-picker-value";
    valueEl.innerHTML = `${renderLanguageChip(preset, 20)}<span class="alelo-favorite-code">${escapeHtml(preset.code)}</span>`;
  }

  function clearPresetSelection() {
    selectedPresetCode = "";
    renderPresetPickerTrigger();
    favoritesPickerMenu?.querySelectorAll(".alelo-lang-picker-option.alelo-selected").forEach((el) => {
      el.classList.remove("alelo-selected");
    });
  }

  function populatePresetPicker() {
    if (!favoritesPickerMenu || !favoritesPickerTrigger) return;

    const existing = new Set(draftFavoriteLanguages.map((lang) => normalizeLanguageCode(lang.code)));
    const options = languagePresets.filter((lang) => !existing.has(normalizeLanguageCode(lang.code)));

    if (!options.length) {
      favoritesPickerMenu.innerHTML = `<li class="alelo-lang-picker-empty">All preset languages added</li>`;
      selectedPresetCode = "";
      renderPresetPickerTrigger();
      favoritesPickerTrigger.disabled = true;
      closePresetPicker();
      return;
    }

    favoritesPickerTrigger.disabled = false;

    if (
      selectedPresetCode &&
      !options.some((lang) => normalizeLanguageCode(lang.code) === normalizeLanguageCode(selectedPresetCode))
    ) {
      selectedPresetCode = "";
    }

    favoritesPickerMenu.innerHTML = options
      .map((lang) => {
        const selected = normalizeLanguageCode(lang.code) === normalizeLanguageCode(selectedPresetCode);
        return `<li class="alelo-lang-picker-option${selected ? " alelo-selected" : ""}" role="option" data-code="${escapeHtml(lang.code)}" tabindex="-1">
          ${renderLanguageChip(lang, 20)}
          <span class="alelo-favorite-code">${escapeHtml(lang.code)}</span>
        </li>`;
      })
      .join("");

    renderPresetPickerTrigger();
    hydrateLanguageFlags(favoritesPickerMenu);
    hydrateLanguageFlags(favoritesPickerTrigger);
    positionPresetPickerMenu();
  }

  function addFavoriteLanguage(entry) {
    const code = normalizeLanguageCode(entry?.code);
    const label = String(entry?.label || code).trim();
    if (!code) return false;

    if (draftFavoriteLanguages.some((lang) => normalizeLanguageCode(lang.code) === code)) {
      return false;
    }

    draftFavoriteLanguages.push({ code, label: label || code });
    renderFavoritesList();
    populatePresetPicker();
    return true;
  }

  function moveFavoriteLanguage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= draftFavoriteLanguages.length) return;
    const copy = [...draftFavoriteLanguages];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    draftFavoriteLanguages = copy;
    renderFavoritesList();
    populatePresetPicker();
  }

  function removeFavoriteLanguage(index) {
    if (draftFavoriteLanguages.length <= 1) return;
    draftFavoriteLanguages = draftFavoriteLanguages.filter((_, i) => i !== index);
    renderFavoritesList();
    populatePresetPicker();
  }

  async function loadCssIntoShadow(shadowRoot) {
    if (cssLoaded) return;

    const url = chrome.runtime.getURL("content.css");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load content.css: HTTP ${response.status}`);
    }

    const style = document.createElement("style");
    style.textContent = await response.text();
    shadowRoot.appendChild(style);
    cssLoaded = true;
  }

  async function loadHtmlTemplate() {
    const url = chrome.runtime.getURL("content.html");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load content.html: HTTP ${response.status}`);
    }
    return await response.text();
  }

  function cacheModalNodes(root) {
    spinner = root.querySelector("#alelo-spinner");
    formattedBox = root.querySelector("#alelo-formatted");
    rawBox = root.querySelector("#alelo-raw");
    errorBox = root.querySelector("#alelo-error");
    copyBtn = root.querySelector("#alelo-copy-btn");
    actionStatus = root.querySelector("#alelo-action-status");
    runBtn = root.querySelector("#alelo-run-btn");
    tabRaw = root.querySelector("#alelo-tab-raw");
    versionEl = root.querySelector("#alelo-extension-version");
    settingsBtn = root.querySelector("#alelo-settings-btn");
    modalEl = root.querySelector("#alelo-modal");
    drawerLayer = root.querySelector("#alelo-drawer-layer");
    settingsPanel = root.querySelector("#alelo-settings-panel");
    settingsCloseBtn = root.querySelector("#alelo-settings-close-btn");
    historyBtn = root.querySelector("#alelo-history-btn");
    historyPanel = root.querySelector("#alelo-history-panel");
    historyCloseBtn = root.querySelector("#alelo-history-close-btn");
    historyList = root.querySelector("#alelo-history-list");
    historyEmpty = root.querySelector("#alelo-history-empty");
    historyClearBtn = root.querySelector("#alelo-history-clear-btn");
    configApiUrl = root.querySelector("#alelo-config-api-url");
    configProvider = root.querySelector("#alelo-config-provider");
    configModel = root.querySelector("#alelo-config-model");
    configTemperature = root.querySelector("#alelo-config-temperature");
    configModelsRefreshBtn = root.querySelector("#alelo-config-models-refresh-btn");
    configModelMeta = root.querySelector("#alelo-config-model-meta");
    configModelsStatus = root.querySelector("#alelo-config-models-status");
    configAuthToken = root.querySelector("#alelo-config-auth-token");
    configSaveBtn = root.querySelector("#alelo-config-save-btn");
    configStatus = root.querySelector("#alelo-config-status");
    favoritesList = root.querySelector("#alelo-favorites-list");
    favoritesPicker = root.querySelector("#alelo-favorites-picker");
    favoritesPickerTrigger = root.querySelector("#alelo-favorites-picker-trigger");
    favoritesPickerMenu = root.querySelector("#alelo-favorites-picker-menu");
    favoritesAddRow = root.querySelector("#alelo-favorites-add-row");
    favoritesAddBtn = root.querySelector("#alelo-favorites-add-btn");
    favoritesCustomCode = root.querySelector("#alelo-favorites-custom-code");
    favoritesCustomLabel = root.querySelector("#alelo-favorites-custom-label");
    favoritesAddCustomBtn = root.querySelector("#alelo-favorites-add-custom-btn");
    targetLangEl = root.querySelector("#alelo-target-lang");
    composerLangBar = root.querySelector("#alelo-composer-lang-bar");
    composerLangButtons = root.querySelector("#alelo-composer-lang-buttons");
    pageSourceEl = root.querySelector("#alelo-page-source");
    sourceTextEl = root.querySelector("#alelo-source-text");
    sourceInputEl = root.querySelector("#alelo-source-input");
    sourceExpandBtn = root.querySelector("#alelo-source-expand-btn");
    sourceWrap = root.querySelector("#alelo-source-wrap");
    composerWrap = root.querySelector("#alelo-composer-wrap");
    translateBtn = root.querySelector("#alelo-translate-btn");
    composerHint = root.querySelector("#alelo-composer-hint");
  }

  function isStoredOllamaModel(modelName) {
    const name = String(modelName || "").trim();
    return !name || name === DEFAULT_MODEL || LEGACY_DEFAULT_MODELS.includes(name);
  }

  function pickLlamaCppModel(selectedModel = "") {
    const preferred = String(selectedModel || "").trim();
    if (preferred && availableModels.some((model) => model.name === preferred)) {
      return preferred;
    }
    if (availableModels.length) {
      return availableModels[0].name;
    }
    return DEFAULT_LLAMACPP_MODEL;
  }

  function getSelectedProvider() {
    const value = configProvider?.value || LLM_PROVIDER.OLLAMA;
    return value === LLM_PROVIDER.LLAMACPP ? LLM_PROVIDER.LLAMACPP : LLM_PROVIDER.OLLAMA;
  }

  function updateApiUrlPlaceholder() {
    if (!configApiUrl) return;
    const preset = PROVIDER_PRESETS[getSelectedProvider()];
    configApiUrl.placeholder = preset?.apiUrl || DEFAULT_API_URL;
  }

  function applyProviderPreset({ forceUrl = false } = {}) {
    if (!configProvider || !configApiUrl) return;

    const provider = getSelectedProvider();
    const preset = PROVIDER_PRESETS[provider];
    if (!preset) return;

    updateApiUrlPlaceholder();

    const currentUrl = configApiUrl.value.trim();
    const otherUrls = Object.values(PROVIDER_PRESETS)
      .map((item) => item.apiUrl)
      .filter((url) => url !== preset.apiUrl);

    if (forceUrl || !currentUrl || otherUrls.includes(currentUrl)) {
      configApiUrl.value = preset.apiUrl;
    }
  }

  function onProviderChange({ forceUrl = false } = {}) {
    applyProviderPreset({ forceUrl });
    if (getSelectedProvider() === LLM_PROVIDER.LLAMACPP) {
      storedModelInfo = null;
    }
    loadModelsList({ preserveSelection: false, selectedModel: "" });
  }

  function formatModelOptionLabel(model) {
    const meta = [];
    if (model?.parameterSize) meta.push(model.parameterSize);
    if (model?.quantizationLevel) meta.push(model.quantizationLevel);
    return meta.length ? `${model.name} (${meta.join(" · ")})` : model.name;
  }

  function formatModelMeta(model) {
    if (!model) return "";
    const parts = [];
    if (model.family) parts.push(model.family);
    if (model.parameterSize) parts.push(model.parameterSize);
    if (model.quantizationLevel) parts.push(model.quantizationLevel);
    if (typeof model.size === "number" && model.size > 0) {
      parts.push(`${(model.size / 1e9).toFixed(1)} GB`);
    }
    return parts.join(" · ");
  }

  function getSelectedModelEntry() {
    const selectedName = configModel?.value || "";
    return (
      availableModels.find((model) => model.name === selectedName) ||
      (storedModelInfo?.name === selectedName ? storedModelInfo : null) ||
      (selectedName ? { name: selectedName } : null)
    );
  }

  function updateModelMetaDisplay() {
    if (!configModelMeta) return;

    const meta = formatModelMeta(getSelectedModelEntry());
    if (meta) {
      configModelMeta.textContent = meta;
      configModelMeta.classList.remove("alelo-hidden");
    } else {
      configModelMeta.textContent = "";
      configModelMeta.classList.add("alelo-hidden");
    }
  }

  function setModelsStatus(message, isError = false) {
    if (!configModelsStatus) return;
    configModelsStatus.textContent = message;
    configModelsStatus.classList.toggle("alelo-field-hint-error", Boolean(isError && message));
  }

  function renderModelSelect(selectedModel = "") {
    if (!configModel) return;

    const previous = selectedModel || configModel.value || storedModelInfo?.name || "";
    const models = [...availableModels];
    const hasPrevious = previous && !models.some((model) => model.name === previous);

    if (hasPrevious) {
      models.unshift(storedModelInfo?.name === previous ? { ...storedModelInfo } : { name: previous });
    }

    if (!models.length) {
      const fallbackModel =
        getSelectedProvider() === LLM_PROVIDER.LLAMACPP ? DEFAULT_LLAMACPP_MODEL : "";
      const emptyLabel = fallbackModel
        ? `Default (${fallbackModel})`
        : "No models available";
      configModel.innerHTML = `<option value="${escapeHtml(fallbackModel)}" selected>${escapeHtml(emptyLabel)}</option>`;
      configModel.disabled = false;
      updateModelMetaDisplay();
      return;
    }

    configModel.disabled = false;
    configModel.innerHTML = models
      .map((model) => {
        const selected = model.name === previous ? " selected" : "";
        return `<option value="${escapeHtml(model.name)}"${selected}>${escapeHtml(formatModelOptionLabel(model))}</option>`;
      })
      .join("");

    if (previous && models.some((model) => model.name === previous)) {
      configModel.value = previous;
    }

    updateModelMetaDisplay();
  }

  async function loadModelsList({ preserveSelection = true, selectedModel = "" } = {}) {
    if (!configApiUrl || !configModel || isLoadingModels) return;

    const apiUrl = configApiUrl.value.trim();
    if (!apiUrl) {
      setModelsStatus("Enter an API URL first.", true);
      return;
    }

    let activeModel = preserveSelection
      ? selectedModel || configModel.value || storedModelInfo?.name || ""
      : selectedModel;
    isLoadingModels = true;
    if (configModelsRefreshBtn) configModelsRefreshBtn.disabled = true;
    setModelsStatus("Loading models…");

    try {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGE_ACTION.FETCH_MODELS,
        apiUrl,
        authToken: configAuthToken?.value.trim() || "",
        provider: getSelectedProvider()
      });

      if (response?.ok && Array.isArray(response.models)) {
        availableModels = response.models;

        if (getSelectedProvider() === LLM_PROVIDER.LLAMACPP) {
          if (!activeModel || isStoredOllamaModel(activeModel)) {
            activeModel = pickLlamaCppModel(activeModel);
          }
        }

        renderModelSelect(activeModel);
        setModelsStatus(
          response.models.length
            ? `${response.models.length} model${response.models.length === 1 ? "" : "s"} loaded`
            : "No models returned by the API."
        );
      } else {
        availableModels = [];
        if (getSelectedProvider() === LLM_PROVIDER.LLAMACPP && isStoredOllamaModel(activeModel)) {
          activeModel = "";
        }
        renderModelSelect(activeModel);
        setModelsStatus(response?.error || "Could not load models", true);
      }
    } catch (error) {
      availableModels = [];
      if (getSelectedProvider() === LLM_PROVIDER.LLAMACPP && isStoredOllamaModel(activeModel)) {
        activeModel = "";
      }
      renderModelSelect(activeModel);
      setModelsStatus(error?.message || "Could not load models", true);
    } finally {
      isLoadingModels = false;
      if (configModelsRefreshBtn) configModelsRefreshBtn.disabled = false;
    }
  }

  async function loadConfigIntoForm() {
    try {
      const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTION.GET_CONFIG });
      if (response?.ok && response.config) {
        if (configProvider) {
          configProvider.value = response.config.provider || LLM_PROVIDER.OLLAMA;
        }
        if (configApiUrl) configApiUrl.value = response.config.apiUrl || "";
        updateApiUrlPlaceholder();
        if (configAuthToken) configAuthToken.value = response.config.authToken || "";
        if (configTemperature) {
          configTemperature.value = String(response.config.temperature ?? DEFAULT_TEMPERATURE);
        }
        storedModelInfo = response.config.modelInfo || null;
        languagePresets = response.languagePresets || [];
        draftFavoriteLanguages = (response.config.favoriteLanguages || []).map((lang) => ({
          code: lang.code,
          label: lang.label
        }));
        renderFavoritesList();
        populatePresetPicker();

        let selectedModel = response.config.model || "";
        if (
          (response.config.provider || LLM_PROVIDER.OLLAMA) === LLM_PROVIDER.LLAMACPP &&
          isStoredOllamaModel(selectedModel)
        ) {
          selectedModel = "";
        }

        await loadModelsList({
          preserveSelection: Boolean(selectedModel),
          selectedModel
        });
      }
    } catch (error) {
      console.error("Alelo: failed to load settings", error);
    }
  }

  async function saveConfig() {
    const selectedModel = getSelectedModelEntry();
    const config = {
      provider: getSelectedProvider(),
      apiUrl: configApiUrl.value.trim(),
      model: (configModel?.value || selectedModel?.name || "").trim(),
      modelInfo: selectedModel,
      authToken: configAuthToken.value.trim(),
      temperature: Number(configTemperature?.value),
      configSource: "user",
      favoriteLanguages: draftFavoriteLanguages
    };

    if (!config.apiUrl) {
      configStatus.textContent = "API URL is required";
      return;
    }

    if (!config.model && getSelectedProvider() === LLM_PROVIDER.OLLAMA) {
      configStatus.textContent = "Model is required for Ollama";
      return;
    }

    if (!config.model && getSelectedProvider() === LLM_PROVIDER.LLAMACPP) {
      config.model = DEFAULT_LLAMACPP_MODEL;
    }

    if (!config.favoriteLanguages.length) {
      configStatus.textContent = "At least one favorite language is required";
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTION.SAVE_CONFIG, config });
      if (response?.ok) {
        storedModelInfo = response.config?.modelInfo || null;
        draftFavoriteLanguages = (response.config?.favoriteLanguages || draftFavoriteLanguages).map((lang) => ({
          code: lang.code,
          label: lang.label
        }));
        renderFavoritesList();
        populatePresetPicker();
        updateModelMetaDisplay();
        configStatus.textContent = "Saved";
      } else {
        configStatus.textContent = response?.error || "Save failed";
      }
      setTimeout(() => {
        if (configStatus) configStatus.textContent = "";
      }, 1500);
    } catch {
      configStatus.textContent = "Save failed";
    }
  }

  function toggleSettingsPanel() {
    if (isDrawerPanelOpen(settingsPanel)) {
      closeSidePanels();
      return;
    }

    openSidePanel(settingsPanel);
    loadConfigIntoForm();
  }

  async function runTranslation() {
    if (isRunning || !lastSourceText || !lastRequestedLanguages.length) return;

    setRunningState(true);
    spinner.classList.remove("alelo-hidden");
    formattedBox.innerHTML = "";
    rawBox.textContent = "";
    errorBox.innerHTML = "";
    errorBox.classList.add("alelo-hidden");
    isErrorState = false;
    activateTab("formatted");

    try {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGE_ACTION.RETRY_TRANSLATION,
        sourceText: lastSourceText,
        targetLanguages: lastRequestedLanguages,
        pageUrl: lastPageUrl
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Could not start translation");
      }
    } catch (error) {
      setRunningState(false);
      spinner.classList.add("alelo-hidden");
      await window[CONTENT_GLOBAL.SHOW_ERROR]({
        sourceText: lastSourceText,
        targetLanguages: lastRequestedLanguages,
        pageUrl: lastPageUrl,
        errorInfo: {
          title: "Could not run translation",
          message: error?.message || "Failed to communicate with the extension background.",
          hint: "Try reloading the page and translating again."
        }
      });
    }
  }

  function attachModalEvents(root) {
    root.querySelector("#alelo-close").addEventListener("click", closeModal);

    root.addEventListener("click", (e) => {
      if (e.target === root) {
        closeModal();
      }
    });

    tabRaw.addEventListener("click", () => {
      const showRaw = tabRaw.classList.contains("alelo-tab-active");
      activateTab(showRaw ? "formatted" : "raw");
    });
    copyBtn.addEventListener("click", copyTranslation);
    runBtn.addEventListener("click", runTranslation);
    translateBtn.addEventListener("click", () => submitComposerTranslation());
    composerLangButtons?.addEventListener("click", (event) => {
      const btn = event.target.closest(".alelo-lang-btn");
      if (!btn || btn.disabled) return;
      const lang = findFavoriteLanguage(btn.dataset.langCode);
      if (lang) submitComposerTranslation([lang]);
    });
    sourceInputEl?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitComposerTranslation();
      }
    });
    historyBtn.addEventListener("click", toggleHistoryPanel);
    historyCloseBtn?.addEventListener("click", closeSidePanels);
    historyClearBtn.addEventListener("click", clearHistory);
    settingsBtn.addEventListener("click", toggleSettingsPanel);
    settingsCloseBtn?.addEventListener("click", closeSidePanels);
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && drawerLayer && !drawerLayer.classList.contains("alelo-hidden")) {
        event.preventDefault();
        closeSidePanels();
      }
    });
    configSaveBtn.addEventListener("click", saveConfig);
    configProvider?.addEventListener("change", () => onProviderChange({ forceUrl: true }));
    configModelsRefreshBtn?.addEventListener("click", () => loadModelsList({ preserveSelection: true }));
    configModel?.addEventListener("change", updateModelMetaDisplay);
    configApiUrl?.addEventListener("change", () => loadModelsList({ preserveSelection: true }));
    configAuthToken?.addEventListener("change", () => loadModelsList({ preserveSelection: true }));

    sourceExpandBtn.addEventListener("click", () => {
      const expanded = sourceTextEl.classList.contains("alelo-source-expanded");
      updateSourceTextDisplay(lastSourceText, !expanded);
    });

    favoritesAddBtn.addEventListener("click", () => {
      if (!selectedPresetCode) return;
      const preset = languagePresets.find(
        (lang) => normalizeLanguageCode(lang.code) === normalizeLanguageCode(selectedPresetCode)
      );
      if (preset) {
        addFavoriteLanguage(preset);
        clearPresetSelection();
        populatePresetPicker();
      }
    });

    favoritesPickerTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePresetPicker();
    });

    favoritesPickerMenu.addEventListener("click", (e) => {
      const option = e.target.closest(".alelo-lang-picker-option");
      if (!option?.dataset.code) return;
      selectedPresetCode = normalizeLanguageCode(option.dataset.code);
      populatePresetPicker();
      closePresetPicker();
    });

    root.addEventListener("click", () => {
      closePresetPicker();
    });

    favoritesAddCustomBtn.addEventListener("click", () => {
      const code = favoritesCustomCode.value.trim();
      const label = favoritesCustomLabel.value.trim();
      if (!addFavoriteLanguage({ code, label: label || code })) return;
      favoritesCustomCode.value = "";
      favoritesCustomLabel.value = "";
    });

    favoritesList.addEventListener("click", (e) => {
      const upBtn = e.target.closest(".alelo-fav-up");
      if (upBtn?.dataset.index != null) {
        moveFavoriteLanguage(Number(upBtn.dataset.index), -1);
        return;
      }

      const downBtn = e.target.closest(".alelo-fav-down");
      if (downBtn?.dataset.index != null) {
        moveFavoriteLanguage(Number(downBtn.dataset.index), 1);
        return;
      }

      const removeBtn = e.target.closest(".alelo-fav-remove");
      if (removeBtn?.dataset.index != null) {
        removeFavoriteLanguage(Number(removeBtn.dataset.index));
      }
    });

    historyList.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest(".alelo-history-delete");
      if (deleteBtn?.dataset.id) {
        removeHistoryEntry(deleteBtn.dataset.id);
        return;
      }

      const restoreBtn = e.target.closest(".alelo-history-restore");
      if (restoreBtn?.dataset.id) {
        const entry = historyEntries.find((item) => item.id === restoreBtn.dataset.id);
        restoreHistoryEntry(entry);
      }
    });
  }

  async function ensureModal() {
    bindHistoryStorageSync();

    if (overlay) {
      await fetchHistory();
      return;
    }

    shadowHost = document.createElement("div");
    shadowHost.id = "alelo-shadow-host";
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    document.documentElement.appendChild(shadowHost);

    await loadCssIntoShadow(shadowRoot);

    const html = await loadHtmlTemplate();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();

    overlay = wrapper.firstElementChild;
    if (!overlay) {
      throw new Error("content.html did not produce a root element");
    }

    shadowRoot.appendChild(overlay);

    cacheModalNodes(overlay);
    setupFlagHydration(overlay);
    attachModalEvents(overlay);

    if (versionEl) {
      try {
        versionEl.textContent = `Version ${chrome.runtime.getManifest().version}`;
      } catch {
        versionEl.textContent = "";
      }
    }

    await loadConfigIntoForm();
    await fetchHistory();
  }

  function resetToLoadingState(payload) {
    setComposerMode(false);
    isErrorState = false;
    activeHistoryId = null;
    lastSourceText = payload?.sourceText || "";
    setRequestedLanguages(
      Array.isArray(payload?.targetLanguages)
        ? payload.targetLanguages
        : payload?.targetLanguage
          ? [payload.targetLanguage]
          : []
    );
    lastPageUrl = payload?.pageUrl || "";
    lastTranslations = [];
    currentRawJson = "";
    currentTranslatedText = "";

    setSourceLanguageState(null, true);
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay(lastSourceText, false);
    formattedBox.innerHTML = "";
    rawBox.textContent = "";
    errorBox.innerHTML = "";
    errorBox.classList.add("alelo-hidden");
    actionStatus.textContent = "";

    if (payload?.parallel && lastRequestedLanguages.length > 1) {
      setFormattedTranslationsHtml(renderPendingTranslationsHtml(lastRequestedLanguages));
      spinner.classList.add("alelo-hidden");
    } else {
      formattedBox.innerHTML = "";
      spinner.classList.remove("alelo-hidden");
    }

    setRunningState(true);
    closeSidePanels();
    activateTab("formatted");
  }

  window[CONTENT_GLOBAL.SHOW_COMPOSER] = async (payload) => {
    await openComposer(payload);
  };

  window[CONTENT_GLOBAL.SHOW_LOADING] = async (payload) => {
    await ensureModal();
    resetToLoadingState(payload);
  };

  window[CONTENT_GLOBAL.SHOW_PARTIAL] = async (payload) => {
    await ensureModal();
    setComposerMode(false);

    isErrorState = false;
    lastSourceText = payload?.sourceText || lastSourceText;
    lastPageUrl = payload?.pageUrl || lastPageUrl;

    if (Array.isArray(payload?.targetLanguages) && payload.targetLanguages.length) {
      setRequestedLanguages(payload.targetLanguages);
    }

    if (payload?.translation) {
      spinner.classList.add("alelo-hidden");
      errorBox.classList.add("alelo-hidden");
      closeSidePanels();
      activateTab("formatted");

      upsertTranslationResult(payload.translation);
      updateTranslationCard(payload.translation);
      rawBox.textContent = currentRawJson || "No raw JSON available";
    }
  };

  window[CONTENT_GLOBAL.SHOW_RESULT] = async (payload) => {
    await ensureModal();
    setComposerMode(false);

    isErrorState = false;
    lastSourceText = payload?.sourceText || lastSourceText;
    lastPageUrl = payload?.pageUrl || lastPageUrl;
    const translations = normalizeResultTranslations(payload);
    setRequestedLanguages(
      Array.isArray(payload?.targetLanguages) && payload.targetLanguages.length
        ? payload.targetLanguages
        : translations.map((item) => item.targetLanguage).filter(Boolean)
    );
    syncLegacyTranslationFields(translations);

    setSourceLanguageState(payload?.sourceLanguage, false);
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay(lastSourceText, false);
    spinner.classList.add("alelo-hidden");
    errorBox.innerHTML = "";
    errorBox.classList.add("alelo-hidden");
    closeSidePanels();

    if (!payload?.finalizeOnly) {
      setFormattedTranslationsHtml(renderTranslationsHtml(translations));
    }

    rawBox.textContent = currentRawJson || "No raw JSON available";
    actionStatus.textContent = "";

    setRunningState(false);
    activateTab("formatted");

    await saveToHistory({
      sourceText: lastSourceText,
      sourceLanguage: lastSourceLanguage,
      translations,
      pageUrl: lastPageUrl,
      model: payload?.model,
      apiUrl: payload?.apiUrl,
      provider: payload?.provider
    });
  };

  window[CONTENT_GLOBAL.UPDATE_SOURCE_LANGUAGE] = async (payload) => {
    await ensureModal();

    if (payload?.sourceText) {
      lastSourceText = payload.sourceText;
    }
    if (payload?.pageUrl) {
      lastPageUrl = payload.pageUrl;
    }
    if (Array.isArray(payload?.targetLanguages) && payload.targetLanguages.length) {
      setRequestedLanguages(payload.targetLanguages);
    }
    setSourceLanguageState(payload?.sourceLanguage, false);
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay(lastSourceText, false);
  };

  window[CONTENT_GLOBAL.SHOW_ERROR] = async (payload) => {
    await ensureModal();
    setComposerMode(false);

    isErrorState = true;
    lastSourceText = payload?.sourceText || lastSourceText;
    if (Array.isArray(payload?.targetLanguages) && payload.targetLanguages.length) {
      setRequestedLanguages(payload.targetLanguages);
    } else if (payload?.targetLanguage) {
      setRequestedLanguages([payload.targetLanguage]);
    }
    lastPageUrl = payload?.pageUrl || lastPageUrl;
    const errorInfo = payload?.errorInfo || {};

    const title = escapeHtml(errorInfo.title || "Translation failed");
    const message = escapeHtml(errorInfo.message || "An unknown error occurred.");
    const hint = errorInfo.hint ? escapeHtml(errorInfo.hint) : "";

    setSourceLanguageState(payload?.sourceLanguage, false);
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay(lastSourceText, false);
    spinner.classList.add("alelo-hidden");
    formattedBox.innerHTML = "";
    rawBox.textContent = "";
    actionStatus.textContent = "";
    closeSidePanels();

    errorBox.innerHTML = `
      <div class="alelo-error-title">${title}</div>
      <div class="alelo-error-message">${message}</div>
      ${hint ? `<div class="alelo-error-hint">${hint}</div>` : ""}
    `;

    currentRawJson = JSON.stringify(errorInfo, null, 2);
    rawBox.textContent = currentRawJson;

    setRunningState(false);
    activateTab("formatted");

    if (historyEntries.length) {
      openSidePanel(historyPanel);
      renderHistoryList();
    }
  };
})();
