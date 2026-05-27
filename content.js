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
  let historyBtn = null;
  let historyPanel = null;
  let historyList = null;
  let historyEmpty = null;
  let historyClearBtn = null;
  let configApiUrl = null;
  let configModel = null;
  let configAuthToken = null;
  let configSaveBtn = null;
  let configStatus = null;
  let favoritesList = null;
  let favoritesPreset = null;
  let favoritesAddBtn = null;
  let favoritesCustomCode = null;
  let favoritesCustomLabel = null;
  let favoritesAddCustomBtn = null;
  let targetLangEl = null;
  let pageSourceEl = null;
  let sourceTextEl = null;
  let sourceExpandBtn = null;
  let sourceWrap = null;

  let currentRawJson = "";
  let currentTranslatedText = "";
  let lastTranslations = [];
  let lastSourceText = "";
  let lastTargetLang = null;
  let lastRequestedLanguages = [];
  let lastPageUrl = "";
  let isErrorState = false;
  let isRunning = false;
  let cssLoaded = false;
  let historyEntries = [];
  let activeHistoryId = null;
  let languagePresets = [];
  let draftFavoriteLanguages = [];

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

  function extractStatsFromRaw(rawJsonText) {
    try {
      const parsed = JSON.parse(rawJsonText);
      const promptTokens = parsed?.prompt_eval_count;
      const outputTokens = parsed?.eval_count;
      const totalNs = parsed?.total_duration;
      const hasTokens = promptTokens != null || outputTokens != null;
      const prompt = promptTokens ?? 0;
      const output = outputTokens ?? 0;

      return {
        durationMs: totalNs != null ? totalNs / 1e6 : null,
        promptTokens: promptTokens ?? null,
        outputTokens: outputTokens ?? null,
        totalTokens: hasTokens ? prompt + output : null
      };
    } catch {
      return null;
    }
  }

  function historySummary(entry) {
    const parts = [];
    const langs = entry.translations?.length
      ? entry.translations.map((item) => item.targetLanguage?.label || item.targetLanguage?.code).filter(Boolean)
      : [];
    if (langs.length > 1) {
      parts.push(`${langs.length} languages`);
    } else {
      const lang = entry.targetLanguage?.label || entry.targetLanguage?.code || langs[0];
      if (lang) parts.push(lang);
    }
    const host = pageHostname(entry.pageUrl);
    if (host) parts.push(host);
    const stats = extractStatsFromRaw(entry.rawJsonText || "");
    const duration = formatDuration(stats?.durationMs);
    if (duration) parts.push(duration);
    return parts.join(" · ") || "Saved translation";
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

  function languageCardKey(lang) {
    return normalizeLanguageCode(lang?.code || "");
  }

  function renderPendingTranslationCard(lang) {
    const label = lang?.label || lang?.code || "Translation";
    const code = languageCardKey(lang);
    return `
      <div class="alelo-translation-card alelo-translation-card-pending" data-lang-code="${escapeHtml(code)}">
        <h4 class="alelo-translation-card-title">${escapeHtml(label)}</h4>
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
    }
  }

  function renderTranslationCard(item) {
    const label = item.targetLanguage?.label || item.targetLanguage?.code || "Translation";
    const code = languageCardKey(item.targetLanguage);

    if (!item.ok) {
      const errorInfo = item.errorInfo || {};
      return `
        <div class="alelo-translation-card alelo-translation-card-error" data-lang-code="${escapeHtml(code)}">
          <h4 class="alelo-translation-card-title">${escapeHtml(label)}</h4>
          <p class="alelo-translation-card-error-text">${escapeHtml(errorInfo.message || "Translation failed")}</p>
        </div>`;
    }

    const stats = extractStatsFromRaw(item.rawJsonText);
    const text = String(item.translatedText || "").trim() || "No translation returned";
    return `
      <div class="alelo-translation-card" data-lang-code="${escapeHtml(code)}">
        <h4 class="alelo-translation-card-title">${escapeHtml(label)}</h4>
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

  function updateTargetLanguageDisplay(targetLanguages) {
    if (!targetLangEl) return;
    const languages = Array.isArray(targetLanguages)
      ? targetLanguages
      : targetLanguages
        ? [targetLanguages]
        : [];
    const label = formatLanguageLabels(languages);
    targetLangEl.textContent = label ? `→ ${label}` : "";
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
    sourceWrap?.classList.toggle("alelo-hidden", !text);
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
      translations: successes,
      translatedText: buildCopyText(successes),
      targetLanguage: successes[0]?.targetLanguage || null,
      pageUrl: entry.pageUrl || "",
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

  function closeSidePanels() {
    settingsPanel?.classList.add("alelo-hidden");
    historyPanel?.classList.add("alelo-hidden");
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
        const langLabels = translations
          .map((item) => item.targetLanguage?.label || item.targetLanguage?.code)
          .filter(Boolean);
        const lang =
          langLabels.length > 1
            ? `${langLabels.length} languages`
            : langLabels[0] || entry.targetLanguage?.label || entry.targetLanguage?.code || "?";
        const snippet = truncateText(entry.sourceText, UI_LIMIT.HISTORY_SNIPPET);
        return `
          <div class="alelo-history-item${isActive ? " alelo-history-item-active" : ""}" data-id="${escapeHtml(entry.id)}">
            <button type="button" class="alelo-history-restore" data-id="${escapeHtml(entry.id)}">
              <span class="alelo-history-title">${escapeHtml(`"${snippet}" → ${lang}`)}</span>
              <span class="alelo-history-meta">${escapeHtml(formatRelativeTime(entry.savedAt))} · ${escapeHtml(historySummary(entry))}</span>
            </button>
            <button type="button" class="alelo-history-delete" data-id="${escapeHtml(entry.id)}" aria-label="Remove from history" title="Remove">×</button>
          </div>`;
      })
      .join("");
  }

  function restoreHistoryEntry(entry) {
    if (!entry) return;

    isErrorState = false;
    activeHistoryId = entry.id;
    lastSourceText = entry.sourceText || "";
    lastPageUrl = entry.pageUrl || "";
    const translations = normalizeHistoryTranslations(entry);
    setRequestedLanguages(translations.map((item) => item.targetLanguage).filter(Boolean));
    syncLegacyTranslationFields(translations);

    updateTargetLanguageDisplay(lastRequestedLanguages);
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay(lastSourceText, false);
    spinner.classList.add("alelo-hidden");
    errorBox.innerHTML = "";
    errorBox.classList.add("alelo-hidden");
    formattedBox.innerHTML = renderTranslationsHtml(translations);
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
    const isHidden = historyPanel.classList.contains("alelo-hidden");
    closeSidePanels();
    historyPanel.classList.toggle("alelo-hidden", !isHidden);
    if (isHidden) {
      fetchHistory();
    }
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

  function normalizeLanguageCode(code) {
    return String(code || "")
      .trim()
      .replace(/_/g, "-")
      .split("-")
      .map((part, index) => (index === 0 ? part.toLowerCase() : part.toUpperCase()))
      .join("-");
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
            <div class="alelo-favorite-label">${escapeHtml(lang.label)}</div>
            <div class="alelo-favorite-code">${escapeHtml(lang.code)}</div>
            <div class="alelo-favorite-actions">
              <button type="button" class="alelo-btn alelo-btn-small alelo-fav-up" data-index="${index}" ${canMoveUp ? "" : "disabled"} title="Move up">↑</button>
              <button type="button" class="alelo-btn alelo-btn-small alelo-fav-down" data-index="${index}" ${canMoveDown ? "" : "disabled"} title="Move down">↓</button>
              <button type="button" class="alelo-btn alelo-btn-small alelo-fav-remove" data-index="${index}" ${canRemove ? "" : "disabled"} title="Remove">×</button>
            </div>
          </div>`;
      })
      .join("");
  }

  function populatePresetSelect() {
    if (!favoritesPreset) return;

    const existing = new Set(draftFavoriteLanguages.map((lang) => normalizeLanguageCode(lang.code)));
    const options = languagePresets.filter((lang) => !existing.has(normalizeLanguageCode(lang.code)));

    favoritesPreset.innerHTML =
      `<option value="">Add a language…</option>` +
      options.map((lang) => `<option value="${escapeHtml(lang.code)}">${escapeHtml(lang.label)} (${escapeHtml(lang.code)})</option>`).join("");
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
    populatePresetSelect();
    return true;
  }

  function moveFavoriteLanguage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= draftFavoriteLanguages.length) return;
    const copy = [...draftFavoriteLanguages];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    draftFavoriteLanguages = copy;
    renderFavoritesList();
    populatePresetSelect();
  }

  function removeFavoriteLanguage(index) {
    if (draftFavoriteLanguages.length <= 1) return;
    draftFavoriteLanguages = draftFavoriteLanguages.filter((_, i) => i !== index);
    renderFavoritesList();
    populatePresetSelect();
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
    settingsPanel = root.querySelector("#alelo-settings-panel");
    historyBtn = root.querySelector("#alelo-history-btn");
    historyPanel = root.querySelector("#alelo-history-panel");
    historyList = root.querySelector("#alelo-history-list");
    historyEmpty = root.querySelector("#alelo-history-empty");
    historyClearBtn = root.querySelector("#alelo-history-clear-btn");
    configApiUrl = root.querySelector("#alelo-config-api-url");
    configModel = root.querySelector("#alelo-config-model");
    configAuthToken = root.querySelector("#alelo-config-auth-token");
    configSaveBtn = root.querySelector("#alelo-config-save-btn");
    configStatus = root.querySelector("#alelo-config-status");
    favoritesList = root.querySelector("#alelo-favorites-list");
    favoritesPreset = root.querySelector("#alelo-favorites-preset");
    favoritesAddBtn = root.querySelector("#alelo-favorites-add-btn");
    favoritesCustomCode = root.querySelector("#alelo-favorites-custom-code");
    favoritesCustomLabel = root.querySelector("#alelo-favorites-custom-label");
    favoritesAddCustomBtn = root.querySelector("#alelo-favorites-add-custom-btn");
    targetLangEl = root.querySelector("#alelo-target-lang");
    pageSourceEl = root.querySelector("#alelo-page-source");
    sourceTextEl = root.querySelector("#alelo-source-text");
    sourceExpandBtn = root.querySelector("#alelo-source-expand-btn");
    sourceWrap = root.querySelector("#alelo-source-wrap");
  }

  async function loadConfigIntoForm() {
    try {
      const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTION.GET_CONFIG });
      if (response?.ok && response.config) {
        configApiUrl.value = response.config.apiUrl || "";
        configModel.value = response.config.model || "";
        configAuthToken.value = response.config.authToken || "";
        languagePresets = response.languagePresets || [];
        draftFavoriteLanguages = (response.config.favoriteLanguages || []).map((lang) => ({
          code: lang.code,
          label: lang.label
        }));
        renderFavoritesList();
        populatePresetSelect();
      }
    } catch {
      // Settings unavailable — form stays empty
    }
  }

  async function saveConfig() {
    const config = {
      apiUrl: configApiUrl.value.trim(),
      model: configModel.value.trim(),
      authToken: configAuthToken.value.trim(),
      favoriteLanguages: draftFavoriteLanguages
    };

    if (!config.apiUrl || !config.model) {
      configStatus.textContent = "API URL and model are required";
      return;
    }

    if (!config.favoriteLanguages.length) {
      configStatus.textContent = "At least one favorite language is required";
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTION.SAVE_CONFIG, config });
      if (response?.ok) {
        draftFavoriteLanguages = (response.config?.favoriteLanguages || draftFavoriteLanguages).map((lang) => ({
          code: lang.code,
          label: lang.label
        }));
        renderFavoritesList();
        populatePresetSelect();
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
    const isHidden = settingsPanel.classList.contains("alelo-hidden");
    closeSidePanels();
    settingsPanel.classList.toggle("alelo-hidden", !isHidden);
    if (isHidden) {
      loadConfigIntoForm();
    }
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
    historyBtn.addEventListener("click", toggleHistoryPanel);
    historyClearBtn.addEventListener("click", clearHistory);
    settingsBtn.addEventListener("click", toggleSettingsPanel);
    configSaveBtn.addEventListener("click", saveConfig);

    sourceExpandBtn.addEventListener("click", () => {
      const expanded = sourceTextEl.classList.contains("alelo-source-expanded");
      updateSourceTextDisplay(lastSourceText, !expanded);
    });

    favoritesAddBtn.addEventListener("click", () => {
      const code = favoritesPreset.value;
      if (!code) return;
      const preset = languagePresets.find((lang) => normalizeLanguageCode(lang.code) === normalizeLanguageCode(code));
      if (preset) {
        addFavoriteLanguage(preset);
        favoritesPreset.value = "";
      }
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

    updateTargetLanguageDisplay(lastRequestedLanguages);
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay(lastSourceText, false);
    formattedBox.innerHTML = "";
    rawBox.textContent = "";
    errorBox.innerHTML = "";
    errorBox.classList.add("alelo-hidden");
    actionStatus.textContent = "";

    if (payload?.parallel && lastRequestedLanguages.length > 1) {
      formattedBox.innerHTML = renderPendingTranslationsHtml(lastRequestedLanguages);
      spinner.classList.add("alelo-hidden");
    } else {
      formattedBox.innerHTML = "";
      spinner.classList.remove("alelo-hidden");
    }

    setRunningState(true);
    closeSidePanels();
    activateTab("formatted");
  }

  window[CONTENT_GLOBAL.SHOW_LOADING] = async (payload) => {
    await ensureModal();
    resetToLoadingState(payload);
  };

  window[CONTENT_GLOBAL.SHOW_PARTIAL] = async (payload) => {
    await ensureModal();

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

    updateTargetLanguageDisplay(lastRequestedLanguages);
    updatePageSourceDisplay(lastPageUrl);
    updateSourceTextDisplay(lastSourceText, false);
    spinner.classList.add("alelo-hidden");
    errorBox.innerHTML = "";
    errorBox.classList.add("alelo-hidden");
    closeSidePanels();

    if (!payload?.finalizeOnly) {
      formattedBox.innerHTML = renderTranslationsHtml(translations);
    }

    rawBox.textContent = currentRawJson || "No raw JSON available";
    actionStatus.textContent = "";

    setRunningState(false);
    activateTab("formatted");

    await saveToHistory({
      sourceText: lastSourceText,
      translations,
      pageUrl: lastPageUrl
    });
  };

  window[CONTENT_GLOBAL.SHOW_ERROR] = async (payload) => {
    await ensureModal();

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

    updateTargetLanguageDisplay(lastRequestedLanguages);
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
      historyPanel.classList.remove("alelo-hidden");
      renderHistoryList();
    }
  };
})();
