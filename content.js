(() => {
  if (window.__imageAnalyzerLoaded) return;
  window.__imageAnalyzerLoaded = true;

  let overlay = null;
  let shadowHost = null;
  let imageBox = null;
  let imagePreviewWrap = null;
  let imagePreview = null;
  let spinner = null;
  let formattedBox = null;
  let rawBox = null;
  let errorBox = null;
  let copyBtn = null;
  let actionStatus = null;
  let runBtn = null;
  let tabFormatted = null;
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

  let currentRawJson = "";
  let currentImageMetadata = null;
  let lastImageUrl = "";
  let isErrorState = false;
  let isRunning = false;
  let cssLoaded = false;
  let historyEntries = [];
  let activeHistoryId = null;

  const HISTORY_STORAGE_KEY = "glowingMonocleHistory";

  function closeModal() {
    if (shadowHost) {
      shadowHost.remove();
      shadowHost = null;
    }
    overlay = null;
    cssLoaded = false;
  }

  function updateImagePreview(imageUrl) {
    if (!imagePreview || !imagePreviewWrap) return;

    if (!imageUrl) {
      imagePreview.removeAttribute("src");
      imagePreviewWrap.classList.add("ia-hidden");
      return;
    }

    imagePreview.onerror = () => {
      imagePreviewWrap.classList.add("ia-hidden");
    };
    imagePreview.onload = () => {
      imagePreviewWrap.classList.remove("ia-hidden");
    };
    imagePreview.src = imageUrl;
  }

  function pageHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  function truncateUrl(url, max = 72) {
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

  function formatFileSize(bytes) {
    if (bytes == null || Number.isNaN(bytes)) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatImageMetadataSummary(imageMetadata) {
    if (!imageMetadata) return "";
    const parts = [];
    if (imageMetadata.width && imageMetadata.height) {
      parts.push(`${imageMetadata.width}×${imageMetadata.height}`);
    }
    if (imageMetadata.aspectRatio) parts.push(imageMetadata.aspectRatio);
    const fileSize = formatFileSize(imageMetadata.fileSize);
    if (fileSize) parts.push(fileSize);
    return parts.join(" · ");
  }

  function historySummary(entry) {
    const stats = extractStatsFromRaw(entry.rawJsonText || "");
    const parts = [];
    const host = pageHostname(entry.pageUrl || entry.imageUrl);
    if (host) parts.push(host);
    const imageMeta = formatImageMetadataSummary(entry.imageMetadata);
    if (imageMeta) parts.push(imageMeta);
    const duration = formatDuration(stats?.durationMs);
    if (duration) parts.push(duration);
    if (stats?.totalTokens != null) parts.push(`${stats.totalTokens.toLocaleString()} tokens`);
    return parts.join(" · ") || "Saved analysis";
  }

  function bindHistoryStorageSync() {
    if (!chrome.storage?.onChanged || window.__imageAnalyzerHistorySync) return;
    window.__imageAnalyzerHistorySync = true;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[HISTORY_STORAGE_KEY]) return;
      historyEntries = changes[HISTORY_STORAGE_KEY].newValue || [];
      updateHistoryBadge();
      if (historyPanel && !historyPanel.classList.contains("ia-hidden")) {
        renderHistoryList();
      }
    });
  }

  async function fetchHistory() {
    try {
      const response = await chrome.runtime.sendMessage({ action: "get-history" });
      historyEntries = response?.ok ? response.history || [] : [];
    } catch {
      historyEntries = [];
    }
    updateHistoryBadge();
    renderHistoryList();
    return historyEntries;
  }

  async function saveToHistory(imageUrl, formattedText, rawJsonText, imageMetadata) {
    if (!imageUrl || !formattedText) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      imageUrl,
      pageUrl: window.location.href,
      formattedText,
      rawJsonText: rawJsonText || "",
      imageMetadata: imageMetadata || null
    };

    try {
      const response = await chrome.runtime.sendMessage({
        action: "save-history-entry",
        entry
      });
      if (response?.ok) {
        historyEntries = response.history || [];
        activeHistoryId = entry.id;
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
    settingsPanel?.classList.add("ia-hidden");
    historyPanel?.classList.add("ia-hidden");
  }

  function renderHistoryList() {
    if (!historyList || !historyEmpty) return;

    if (!historyEntries.length) {
      historyList.innerHTML = "";
      historyEmpty.classList.remove("ia-hidden");
      return;
    }

    historyEmpty.classList.add("ia-hidden");
    historyList.innerHTML = historyEntries
      .map((entry) => {
        const isActive = entry.id === activeHistoryId;
        return `
          <div class="ia-history-item${isActive ? " ia-history-item-active" : ""}" data-id="${escapeHtml(entry.id)}">
            <button type="button" class="ia-history-restore" data-id="${escapeHtml(entry.id)}">
              <span class="ia-history-url">${escapeHtml(truncateUrl(entry.imageUrl))}</span>
              <span class="ia-history-meta">${escapeHtml(formatRelativeTime(entry.savedAt))} · ${escapeHtml(historySummary(entry))}</span>
            </button>
            <button type="button" class="ia-history-delete" data-id="${escapeHtml(entry.id)}" aria-label="Remove from history" title="Remove">×</button>
          </div>`;
      })
      .join("");
  }

  function restoreHistoryEntry(entry) {
    if (!entry) return;

    isErrorState = false;
    activeHistoryId = entry.id;
    lastImageUrl = entry.imageUrl;
    currentRawJson = entry.rawJsonText || "";
    currentImageMetadata = entry.imageMetadata || null;

    imageBox.textContent = lastImageUrl;
    updateImagePreview(lastImageUrl);
    spinner.classList.add("ia-hidden");
    errorBox.innerHTML = "";
    errorBox.classList.add("ia-hidden");
    formattedBox.innerHTML = renderReportHtml(
      entry.formattedText || "No result",
      currentRawJson,
      currentImageMetadata
    );
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
        action: "remove-history-entry",
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
      const response = await chrome.runtime.sendMessage({ action: "clear-history" });
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
    const isHidden = historyPanel.classList.contains("ia-hidden");
    closeSidePanels();
    historyPanel.classList.toggle("ia-hidden", !isHidden);
    if (isHidden) {
      fetchHistory();
    }
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
    actionStatus.classList.toggle("ia-action-status-error", isError);
    if (text) {
      setTimeout(() => {
        if (actionStatus?.textContent === text) {
          actionStatus.textContent = "";
          actionStatus.classList.remove("ia-action-status-error");
        }
      }, 1500);
    }
  }

  async function copyRawJson() {
    const text = currentRawJson || "";
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
      runBtn.disabled = running || !lastImageUrl;
      runBtn.classList.toggle("ia-running", running);
      runBtn.title = running ? "Analysis in progress…" : "Run analysis";
    }
  }

  function activateTab(name) {
    const showFormatted = name === "formatted";

    tabFormatted.classList.toggle("ia-tab-active", showFormatted);
    tabRaw.classList.toggle("ia-tab-active", !showFormatted);

    if (isErrorState) {
      errorBox.classList.toggle("ia-hidden", !showFormatted);
      rawBox.classList.toggle("ia-hidden", showFormatted);
      formattedBox.classList.add("ia-hidden");
      return;
    }

    errorBox.classList.add("ia-hidden");
    formattedBox.classList.toggle("ia-hidden", !showFormatted);
    rawBox.classList.toggle("ia-hidden", showFormatted);
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

  function renderReportMeta(stats, imageMetadata) {
    const items = [];

    if (imageMetadata?.width && imageMetadata?.height) {
      items.push(
        `<span class="ia-meta-item"><span class="ia-meta-label">Dimensions</span> ${escapeHtml(`${imageMetadata.width}×${imageMetadata.height}`)}</span>`
      );
    }

    if (imageMetadata?.aspectRatio) {
      items.push(
        `<span class="ia-meta-item"><span class="ia-meta-label">Aspect ratio</span> ${escapeHtml(imageMetadata.aspectRatio)}</span>`
      );
    }

    const fileSize = formatFileSize(imageMetadata?.fileSize);
    if (fileSize) {
      items.push(
        `<span class="ia-meta-item"><span class="ia-meta-label">File size</span> ${escapeHtml(fileSize)}</span>`
      );
    }

    if (!stats) {
      if (!items.length) return "";
      return `<div class="ia-report-meta">${items.join("")}</div>`;
    }

    const duration = formatDuration(stats.durationMs);
    if (duration) {
      items.push(`<span class="ia-meta-item"><span class="ia-meta-label">Generation time</span> ${escapeHtml(duration)}</span>`);
    }

    if (stats.totalTokens != null) {
      const tokenDetail =
        stats.promptTokens != null && stats.outputTokens != null
          ? `${stats.promptTokens.toLocaleString()} prompt · ${stats.outputTokens.toLocaleString()} output`
          : `${stats.totalTokens.toLocaleString()} total`;
      items.push(`<span class="ia-meta-item"><span class="ia-meta-label">Tokens</span> ${escapeHtml(tokenDetail)}</span>`);
    }

    if (!items.length) return "";

    return `<div class="ia-report-meta">${items.join("")}</div>`;
  }

  function parseSectionHeading(trimmed) {
    if (trimmed.startsWith("### ")) {
      return trimmed.slice(4).trim();
    }

    if (trimmed.startsWith("## ")) {
      const heading = trimmed.slice(3).trim();
      if (/^glowing monocle\b/i.test(heading)) return null;
      return heading;
    }

    if (trimmed.startsWith("# ")) {
      const heading = trimmed.slice(2).trim();
      if (/^glowing monocle\b/i.test(heading)) return null;
      return heading;
    }

    return null;
  }

  function parseReportSections(markdown) {
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    const sections = [];
    let current = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || /^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
        continue;
      }

      const heading = parseSectionHeading(trimmed);
      if (heading) {
        if (current) sections.push(current);
        current = { heading, lines: [] };
        continue;
      }

      if (current) {
        current.lines.push(line);
      }
    }

    if (current) sections.push(current);
    return { sections };
  }

  function sectionKind(heading) {
    const h = heading.toLowerCase();
    if (h.includes("categor") || h.includes("tag")) return "tags";
    if (h.includes("color") || h.includes("palette")) return "palette";
    if (h.includes("nsfw")) return "nsfw";
    if (h.includes("anomal") || h.includes("hallucin")) return "anomalies";
    if (h.includes("description")) return "description";
    return "default";
  }

  function parseBulletItems(lines) {
    return lines
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, "").replace(/`/g, "").trim())
      .filter(Boolean);
  }

  function parsePaletteBullets(lines) {
    const rows = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!/^[-*]\s+/.test(trimmed)) continue;

      let content = trimmed.replace(/^[-*]\s+/, "").replace(/`/g, "");
      const hexMatches = content.match(/#[0-9A-Fa-f]{3,8}/g) || [];
      const hex = hexMatches[0]?.toUpperCase() || null;

      let name = content;
      const boldMatch = content.match(/^\*\*(.+?)\*\*:?\s*/);
      if (boldMatch) {
        name = boldMatch[1];
      } else {
        const colonIdx = content.indexOf(":");
        if (colonIdx > 0) name = content.slice(0, colonIdx);
      }

      name = name.replace(/\*\*/g, "").trim();
      const note = content
        .replace(/^\*\*.+?\*\*:?\s*/, "")
        .replace(/#[0-9A-Fa-f]{3,8}/g, "")
        .replace(/\(\s*\)/g, "")
        .trim();

      rows.push({ name, hex, note: note || null });
    }

    return rows;
  }

  function parsePaletteRows(lines) {
    const rows = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || trimmed.includes(":---")) continue;

      const cells = trimmed
        .split("|")
        .map((cell) => cell.trim().replace(/`/g, ""))
        .filter(Boolean);

      if (cells.length >= 2 && !/^color$/i.test(cells[0])) {
        const hexMatch = cells[1].match(/#[0-9A-Fa-f]{3,8}/);
        rows.push({
          name: cells[0],
          hex: hexMatch ? hexMatch[0].toUpperCase() : cells[1],
          note: null
        });
      }
    }

    if (rows.length) return rows;
    return parsePaletteBullets(lines);
  }

  function renderPaletteRow(row) {
    const swatchClass = row.hex ? "ia-swatch" : "ia-swatch ia-swatch-neutral";
    const swatch = row.hex
      ? `<span class="${swatchClass}" style="background:${escapeHtml(row.hex)}"></span>`
      : `<span class="${swatchClass}"></span>`;

    const hexCell = row.hex
      ? `<code class="ia-swatch-hex">${escapeHtml(row.hex)}</code>`
      : row.note
        ? `<span class="ia-swatch-note">${inlineFormat(row.note)}</span>`
        : "";

    return `
      <div class="ia-swatch-row">
        ${swatch}
        <span class="ia-swatch-name">${inlineFormat(row.name)}</span>
        ${hexCell}
      </div>`;
  }

  function renderProse(lines) {
    const paragraphs = [];
    let buffer = [];

    function flush() {
      const text = buffer.join(" ").trim();
      if (text) paragraphs.push(`<p>${inlineFormat(text)}</p>`);
      buffer = [];
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flush();
        continue;
      }
      if (/^[-*|]/.test(trimmed)) continue;
      buffer.push(trimmed);
    }

    flush();
    return paragraphs.join("") || "<p>No content</p>";
  }

  function renderTagsSection(section) {
    const tags = parseBulletItems(section.lines);
    const chips = tags
      .map((tag) => `<span class="ia-tag">${inlineFormat(tag)}</span>`)
      .join("");
    return chips || "<p>No tags</p>";
  }

  function renderPaletteSection(section) {
    const rows = parsePaletteRows(section.lines);
    if (!rows.length) {
      const items = parseBulletItems(section.lines);
      if (items.length) {
        return items.map((item) => `<p class="ia-palette-item">${inlineFormat(item)}</p>`).join("");
      }
      return renderProse(section.lines);
    }

    return rows.map((row) => renderPaletteRow(row)).join("");
  }

  function detectNsfwStatus(text) {
    const plain = text.replace(/\*\*/g, "").trim();
    const lower = plain.toLowerCase();

    if (
      /\bdoes not contain\b/.test(lower) ||
      /\bno nsfw\b/.test(lower) ||
      /\bnot safe for work\b/.test(lower) && /\bno\b|\bdoes not\b|\bnot contain\b/.test(lower) ||
      /\bno\b.*\bnsfw\b/.test(lower) ||
      /\bnsfw\b.*\bno\b/.test(lower)
    ) {
      return false;
    }

    const firstWord = plain.split(/[\s,]/)[0].toLowerCase();
    if (firstWord === "yes") return true;
    if (firstWord === "no" || /^no[.\s,]/i.test(plain)) return false;

    if (/\bnsfw\b/.test(lower) && /\b(contain|contains|detected|suggestive|explicit)\b/.test(lower)) {
      return !/\b(no|not|without)\b/.test(lower);
    }

    return false;
  }

  function renderNsfwSection(section) {
    const text = section.lines.join("\n").trim();
    const isNsfw = detectNsfwStatus(text);
    const label = isNsfw ? "Yes — NSFW content detected" : "No — safe content";
    const cls = isNsfw ? "ia-nsfw-yes" : "ia-nsfw-no";
    const detail = renderProse(section.lines);

    return `
      <div class="ia-report-card ia-card-nsfw">
        <h3 class="ia-card-title">${inlineFormat(section.heading)}</h3>
        <span class="ia-nsfw-badge ${cls}">${escapeHtml(label)}</span>
        ${detail !== "<p>No content</p>" ? `<div class="ia-nsfw-detail">${detail}</div>` : ""}
      </div>`;
  }

  function renderSectionCard(section) {
    const kind = sectionKind(section.heading);
    const title = `<h3 class="ia-card-title">${inlineFormat(section.heading)}</h3>`;

    if (kind === "nsfw") {
      return renderNsfwSection(section);
    }

    let body = "";
    let cardClass = "ia-report-card";

    if (kind === "tags") {
      body = `<div class="ia-tag-list">${renderTagsSection(section)}</div>`;
      cardClass += " ia-card-tags";
    } else if (kind === "palette") {
      body = `<div class="ia-palette">${renderPaletteSection(section)}</div>`;
      cardClass += " ia-card-palette";
    } else {
      body = renderProse(section.lines);
      if (kind === "description" || kind === "anomalies") {
        cardClass += " ia-card-wide";
      }
    }

    return `<div class="${cardClass}">${title}${body}</div>`;
  }

  function renderReportHtml(markdown, rawJsonText, imageMetadata) {
    const { sections } = parseReportSections(markdown);
    const stats = extractStatsFromRaw(rawJsonText);

    if (!sections.length) {
      const meta = renderReportMeta(stats, imageMetadata);
      return `<div class="ia-report ia-report-fallback">${meta}${simpleMarkdownToHtml(markdown)}</div>`;
    }

    const cards = sections.map((section) => renderSectionCard(section)).join("");

    return `
      <div class="ia-report">
        ${renderReportMeta(stats, imageMetadata)}
        <div class="ia-report-grid">${cards}</div>
      </div>
    `;
  }

  function simpleMarkdownToHtml(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let inOl = false;
    let inUl = false;

    function closeLists() {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        closeLists();
        continue;
      }

      if (trimmed.startsWith("### ")) {
        closeLists();
        out.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
        continue;
      }

      if (trimmed.startsWith("## ")) {
        closeLists();
        out.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
        continue;
      }

      if (trimmed.startsWith("# ")) {
        closeLists();
        out.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        if (inUl) {
          out.push("</ul>");
          inUl = false;
        }
        if (!inOl) {
          out.push("<ol>");
          inOl = true;
        }
        out.push(`<li>${inlineFormat(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
        continue;
      }

      if (/^-\s+/.test(trimmed) || /^\*\s+/.test(trimmed)) {
        if (inOl) {
          out.push("</ol>");
          inOl = false;
        }
        if (!inUl) {
          out.push("<ul>");
          inUl = true;
        }
        out.push(`<li>${inlineFormat(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
        continue;
      }

      closeLists();
      out.push(`<p>${inlineFormat(trimmed)}</p>`);
    }

    closeLists();
    return out.join("");
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
    imageBox = root.querySelector("#image-analyzer-image-url");
    imagePreviewWrap = root.querySelector("#ia-image-preview-wrap");
    imagePreview = root.querySelector("#ia-image-preview");
    spinner = root.querySelector("#image-analyzer-spinner");
    formattedBox = root.querySelector("#image-analyzer-formatted");
    rawBox = root.querySelector("#image-analyzer-raw");
    errorBox = root.querySelector("#image-analyzer-error");
    copyBtn = root.querySelector("#ia-copy-btn");
    actionStatus = root.querySelector("#ia-action-status");
    runBtn = root.querySelector("#ia-run-btn");
    tabFormatted = root.querySelector("#ia-tab-formatted");
    tabRaw = root.querySelector("#ia-tab-raw");
    versionEl = root.querySelector("#ia-extension-version");
    settingsBtn = root.querySelector("#ia-settings-btn");
    settingsPanel = root.querySelector("#ia-settings-panel");
    historyBtn = root.querySelector("#ia-history-btn");
    historyPanel = root.querySelector("#ia-history-panel");
    historyList = root.querySelector("#ia-history-list");
    historyEmpty = root.querySelector("#ia-history-empty");
    historyClearBtn = root.querySelector("#ia-history-clear-btn");
    configApiUrl = root.querySelector("#ia-config-api-url");
    configModel = root.querySelector("#ia-config-model");
    configAuthToken = root.querySelector("#ia-config-auth-token");
    configSaveBtn = root.querySelector("#ia-config-save-btn");
    configStatus = root.querySelector("#ia-config-status");
  }

  async function loadConfigIntoForm() {
    try {
      const response = await chrome.runtime.sendMessage({ action: "get-config" });
      if (response?.ok && response.config) {
        configApiUrl.value = response.config.apiUrl || "";
        configModel.value = response.config.model || "";
        configAuthToken.value = response.config.authToken || "";
      }
    } catch {
      // Settings unavailable — form stays empty
    }
  }

  async function saveConfig() {
    const config = {
      apiUrl: configApiUrl.value.trim(),
      model: configModel.value.trim(),
      authToken: configAuthToken.value.trim()
    };

    if (!config.apiUrl || !config.model) {
      configStatus.textContent = "API URL and model are required";
      return;
    }

    try {
      await chrome.runtime.sendMessage({ action: "save-config", config });
      configStatus.textContent = "Saved";
      setTimeout(() => {
        if (configStatus) configStatus.textContent = "";
      }, 1500);
    } catch {
      configStatus.textContent = "Save failed";
    }
  }

  function toggleSettingsPanel() {
    const isHidden = settingsPanel.classList.contains("ia-hidden");
    closeSidePanels();
    settingsPanel.classList.toggle("ia-hidden", !isHidden);
    if (isHidden) {
      loadConfigIntoForm();
    }
  }

  async function runAnalysis() {
    if (isRunning || !lastImageUrl) return;

    setRunningState(true);
    spinner.classList.remove("ia-hidden");
    formattedBox.innerHTML = "";
    rawBox.textContent = "";
    errorBox.innerHTML = "";
    errorBox.classList.add("ia-hidden");
    isErrorState = false;
    activateTab("formatted");

    try {
      const response = await chrome.runtime.sendMessage({
        action: "retry-analysis",
        imageUrl: lastImageUrl
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Could not start analysis");
      }
    } catch (error) {
      setRunningState(false);
      spinner.classList.add("ia-hidden");
      await window.__imageAnalyzerShowError(lastImageUrl, {
        title: "Could not run analysis",
        message: error?.message || "Failed to communicate with the extension background.",
        hint: "Try reloading the page and running the analysis again."
      });
    }
  }

  function attachModalEvents(root) {
    root.querySelector("#image-analyzer-close").addEventListener("click", closeModal);

    root.addEventListener("click", (e) => {
      if (e.target === root) {
        closeModal();
      }
    });

    tabFormatted.addEventListener("click", () => activateTab("formatted"));
    tabRaw.addEventListener("click", () => activateTab("raw"));
    copyBtn.addEventListener("click", copyRawJson);
    runBtn.addEventListener("click", runAnalysis);
    historyBtn.addEventListener("click", toggleHistoryPanel);
    historyClearBtn.addEventListener("click", clearHistory);
    settingsBtn.addEventListener("click", toggleSettingsPanel);
    configSaveBtn.addEventListener("click", saveConfig);

    historyList.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest(".ia-history-delete");
      if (deleteBtn?.dataset.id) {
        removeHistoryEntry(deleteBtn.dataset.id);
        return;
      }

      const restoreBtn = e.target.closest(".ia-history-restore");
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
    shadowHost.id = "image-analyzer-shadow-host";
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

  function resetToLoadingState(imageUrl) {
    isErrorState = false;
    activeHistoryId = null;
    lastImageUrl = imageUrl || "";
    currentRawJson = "";
    currentImageMetadata = null;

    imageBox.textContent = lastImageUrl;
    updateImagePreview(lastImageUrl);
    formattedBox.innerHTML = "";
    rawBox.textContent = "";
    errorBox.innerHTML = "";
    errorBox.classList.add("ia-hidden");
    actionStatus.textContent = "";
    spinner.classList.remove("ia-hidden");

    setRunningState(true);
    closeSidePanels();
    activateTab("formatted");
  }

  window.__imageAnalyzerShowLoading = async (imageUrl) => {
    await ensureModal();
    resetToLoadingState(imageUrl);
  };

  window.__imageAnalyzerShowResult = async (imageUrl, formattedText, rawJsonText, imageMetadata) => {
    await ensureModal();

    isErrorState = false;
    lastImageUrl = imageUrl || lastImageUrl;
    currentRawJson = typeof rawJsonText === "string" ? rawJsonText : "";
    currentImageMetadata = imageMetadata || null;

    imageBox.textContent = lastImageUrl;
    updateImagePreview(lastImageUrl);
    spinner.classList.add("ia-hidden");
    errorBox.innerHTML = "";
    errorBox.classList.add("ia-hidden");
    closeSidePanels();
    formattedBox.innerHTML = renderReportHtml(
      formattedText || "No result",
      currentRawJson,
      currentImageMetadata
    );
    rawBox.textContent = currentRawJson || "No raw JSON available";
    actionStatus.textContent = "";

    setRunningState(false);
    activateTab("formatted");

    await saveToHistory(lastImageUrl, formattedText, currentRawJson, currentImageMetadata);
  };

  window.__imageAnalyzerShowError = async (imageUrl, errorInfo) => {
    await ensureModal();

    isErrorState = true;
    lastImageUrl = imageUrl || lastImageUrl;

    const title = escapeHtml(errorInfo?.title || "Analysis failed");
    const message = escapeHtml(errorInfo?.message || "An unknown error occurred.");
    const hint = errorInfo?.hint ? escapeHtml(errorInfo.hint) : "";

    imageBox.textContent = lastImageUrl;
    updateImagePreview(lastImageUrl);
    spinner.classList.add("ia-hidden");
    formattedBox.innerHTML = "";
    rawBox.textContent = "";
    actionStatus.textContent = "";
    closeSidePanels();

    errorBox.innerHTML = `
      <div class="ia-error-title">${title}</div>
      <div class="ia-error-message">${message}</div>
      ${hint ? `<div class="ia-error-hint">${hint}</div>` : ""}
    `;

    currentRawJson = JSON.stringify(errorInfo, null, 2);
    rawBox.textContent = currentRawJson;

    setRunningState(false);
    activateTab("formatted");

    if (historyEntries.length) {
      historyPanel.classList.remove("ia-hidden");
      renderHistoryList();
    }
  };
})();
