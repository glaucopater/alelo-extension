importScripts("config.js");

const SYSTEM_PROMPT = "You are an Glowing Monocle. You receive an image and you need to analyze it in detail. \
You need to provide a detailed description of what is in the image, including objects, people, animals, and the environment. \
Reply in markdown format, with sections for description, categories/tags, color palette, and any anomalies or hallucinations. \
Be concise but thorough. If the image contains NSFW content, clearly indicate that in the response.";

const USER_PROMPT = "Describe what is in this image. Provide a list of categories and tags. \
Provide a list of palette used in the image in hexadecimal format. \
Verify if there are any anomalies or hallucinations. Tell me if the image is NSFW.";

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Failed to convert blob to base64"));
        return;
      }

      const parts = dataUrl.split(",");
      if (parts.length < 2) {
        reject(new Error("Invalid data URL"));
        return;
      }

      resolve(parts[1]);
    };

    reader.onerror = () => {
      reject(reader.error || new Error("FileReader error"));
    };

    reader.readAsDataURL(blob);
  });
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

function computeAspectRatio(width, height) {
  if (!width || !height) return null;
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

async function getImageMetadata(blob) {
  const metadata = {
    width: null,
    height: null,
    aspectRatio: null,
    fileSize: blob.size ?? null,
    mimeType: blob.type || null
  };

  try {
    const bitmap = await createImageBitmap(blob);
    metadata.width = bitmap.width;
    metadata.height = bitmap.height;
    metadata.aspectRatio = computeAspectRatio(bitmap.width, bitmap.height);
    if (typeof bitmap.close === "function") bitmap.close();
  } catch (error) {
    console.warn("Could not read image dimensions:", error);
  }

  return metadata;
}

function formatErrorMessage(error) {
  const msg = error?.message || String(error);

  if (msg === "Failed to fetch" || (error?.name === "TypeError" && /fetch/i.test(msg))) {
    return {
      title: "Cannot reach the API",
      message: "The analysis server did not respond. Check that it is running and that the API URL in Settings is correct.",
      hint: "For Ollama, start it with OLLAMA_ORIGINS=chrome-extension://* so the extension can connect."
    };
  }

  if (msg.startsWith("Image fetch failed")) {
    const status = msg.match(/HTTP (\d+)/)?.[1] || "unknown";
    return {
      title: "Could not load the image",
      message: `The image could not be downloaded (HTTP ${status}). Some sites block direct image access.`,
      hint: "Try opening the image in a new tab, then right-click and analyze it from there."
    };
  }

  if (msg.startsWith("Ollama error 404")) {
    return {
      title: "Model not found",
      message: "The API returned 404 — the model name may be wrong or not installed.",
      hint: "Open Settings and verify the model name matches one available on your server."
    };
  }

  if (msg.startsWith("Ollama error 401") || msg.startsWith("Ollama error 403")) {
    return {
      title: "Authentication failed",
      message: "The API rejected the request. Check your auth token in Settings.",
      hint: ""
    };
  }

  if (msg.startsWith("Ollama error 5")) {
    return {
      title: "Server error",
      message: "The analysis server returned an error. Check the server logs for details.",
      hint: msg
    };
  }

  if (msg.startsWith("Ollama error")) {
    return {
      title: "API error",
      message: msg,
      hint: ""
    };
  }

  return {
    title: "Analysis failed",
    message: msg,
    hint: ""
  };
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function showLoading(tabId, imageUrl) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (url) => {
      if (window.__imageAnalyzerShowLoading) {
        window.__imageAnalyzerShowLoading(url);
      }
    },
    args: [imageUrl]
  });
}

async function showResult(tabId, imageUrl, formattedText, rawJsonText, imageMetadata) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (url, formatted, raw, metadata) => {
      if (window.__imageAnalyzerShowResult) {
        window.__imageAnalyzerShowResult(url, formatted, raw, metadata);
      }
    },
    args: [imageUrl, formattedText, rawJsonText, imageMetadata]
  });
}

async function showError(tabId, imageUrl, errorInfo) {
  await injectContentScript(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (url, info) => {
      if (window.__imageAnalyzerShowError) {
        window.__imageAnalyzerShowError(url, info);
      }
    },
    args: [imageUrl, errorInfo]
  });
}

async function analyzeImage(tabId, imageUrl) {
  try {
    await showLoading(tabId, imageUrl);

    const config = await getStoredConfig();

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Image fetch failed: HTTP ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const [imageBase64, imageMetadata] = await Promise.all([
      blobToBase64(imageBlob),
      getImageMetadata(imageBlob)
    ]);

    const payload = {
      model: config.model,
      stream: false,
      messages: [
        {
          role: "user",
          content: SYSTEM_PROMPT + USER_PROMPT,
          images: [imageBase64]
        }
      ]
    };

    const headers = { "Content-Type": "application/json" };
    if (config.authToken) {
      headers.Authorization = `Bearer ${config.authToken}`;
    }

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(`Ollama error ${response.status}: ${raw || "No response body"}`);
    }

    let formattedText = raw;
    let rawJsonText = raw;

    try {
      const parsed = JSON.parse(raw);
      rawJsonText = JSON.stringify(parsed, null, 2);
      formattedText = parsed?.message?.content ?? raw;
    } catch {
      rawJsonText = raw;
      formattedText = raw;
    }

    await showResult(tabId, imageUrl, formattedText, rawJsonText, imageMetadata);
  } catch (error) {
    try {
      await showError(tabId, imageUrl, formatErrorMessage(error));
    } catch (innerError) {
      console.error("Failed to display error in modal:", innerError);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "glowing-monocle",
    title: "Glowing Monocle",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "glowing-monocle") return;
  if (!tab?.id) return;

  const imageUrl = info.srcUrl;
  if (!imageUrl) return;

  await analyzeImage(tab.id, imageUrl);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "retry-analysis") {
    const tabId = sender.tab?.id;
    const imageUrl = message.imageUrl;
    if (tabId && imageUrl) {
      analyzeImage(tabId, imageUrl);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "Missing tab or image URL" });
    }
    return true;
  }

  if (message.action === "get-config") {
    getStoredConfig().then((config) => sendResponse({ ok: true, config }));
    return true;
  }

  if (message.action === "save-config") {
    saveStoredConfig(message.config).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action === "get-history") {
    getStoredHistory().then((history) => sendResponse({ ok: true, history }));
    return true;
  }

  if (message.action === "save-history-entry") {
    addHistoryEntry(message.entry).then((history) => sendResponse({ ok: true, history }));
    return true;
  }

  if (message.action === "clear-history") {
    clearStoredHistory().then(() => sendResponse({ ok: true, history: [] }));
    return true;
  }

  if (message.action === "remove-history-entry") {
    getStoredHistory().then((history) => {
      const filtered = history.filter((item) => item.id !== message.id);
      return saveStoredHistory(filtered).then(() => sendResponse({ ok: true, history: filtered }));
    });
    return true;
  }

  return false;
});
