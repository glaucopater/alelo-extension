const CONFIG_STORAGE_KEY = "aleloConfig";
const HISTORY_STORAGE_KEY = "aleloHistory";
const MAX_HISTORY_ENTRIES = 30;

const CURRENT_CONFIG_VERSION = 5;
const DEFAULT_API_URL = "http://localhost:11434/api/chat";
const DEFAULT_MODEL = "gemma4:e2b";
const LEGACY_DEFAULT_MODELS = ["llama3.2", "qwen3.5:9b"];

const LANGUAGES_PRESET = [
  { code: "sq", label: "Albanian" },
  { code: "hy", label: "Armenian" },
  { code: "az", label: "Azerbaijani" },
  { code: "eu", label: "Basque" },
  { code: "be", label: "Belarusian" },
  { code: "bs", label: "Bosnian" },
  { code: "bg", label: "Bulgarian" },
  { code: "ca", label: "Catalan" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "gl", label: "Galician" },
  { code: "ka", label: "Georgian" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "hu", label: "Hungarian" },
  { code: "is", label: "Icelandic" },
  { code: "ga", label: "Irish" },
  { code: "it", label: "Italian" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "lb", label: "Luxembourgish" },
  { code: "mk", label: "Macedonian" },
  { code: "mt", label: "Maltese" },
  { code: "cnr", label: "Montenegrin" },
  { code: "nb", label: "Norwegian (Bokmål)" },
  { code: "nn", label: "Norwegian (Nynorsk)" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "pt-PT", label: "Portuguese (Portugal)" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "gd", label: "Scottish Gaelic" },
  { code: "sr", label: "Serbian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "cy", label: "Welsh" }
];

const DEFAULT_FAVORITE_LANGUAGES = [{ code: "en", label: "English" }];

const CONTEXT_MENU_PARENT_ID = "alelo-translate-parent";
const CONTEXT_MENU_LANG_PREFIX = "alelo-lang-";
const CONTEXT_MENU_ALL_FAVORITES_ID = "alelo-translate-all-favorites";
const CONTEXT_MENU_TITLE = "Translate with Alelo";
const CONTEXT_MENU_ALL_FAVORITES_TITLE = "All favorites (parallel)";

const SYSTEM_PROMPT =
  "You are a translation assistant. Translate accurately. Reply with ONLY the translated text, no explanation.";

const SOURCE_LANGUAGE_SYSTEM_PROMPT =
  'You identify the language of text. Reply with ONLY valid JSON: {"code":"bcp47","label":"English name"}. Use ISO 639-1 or BCP-47 codes (e.g. en, pt-BR). No markdown, no explanation.';

const MESSAGE_ACTION = {
  RETRY_TRANSLATION: "retry-translation",
  GET_CONFIG: "get-config",
  SAVE_CONFIG: "save-config",
  GET_HISTORY: "get-history",
  SAVE_HISTORY_ENTRY: "save-history-entry",
  CLEAR_HISTORY: "clear-history",
  REMOVE_HISTORY_ENTRY: "remove-history-entry",
  GET_FLAG_IMAGE: "get-flag-image"
};

const CONTENT_GLOBAL = {
  LOADED: "__aleloLoaded",
  HISTORY_SYNC: "__aleloHistorySync",
  SHOW_LOADING: "__aleloShowLoading",
  SHOW_PARTIAL: "__aleloShowPartial",
  SHOW_RESULT: "__aleloShowResult",
  SHOW_ERROR: "__aleloShowError",
  UPDATE_SOURCE_LANGUAGE: "__aleloUpdateSourceLanguage"
};

const UI_LIMIT = {
  SOURCE_TEXT_PREVIEW: 280,
  HISTORY_SNIPPET: 64,
  URL_TRUNCATE: 72,
  TEXT_TRUNCATE: 72
};
