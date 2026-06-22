if (!globalThis.__aleloConstantsLoaded) {
  globalThis.__aleloConstantsLoaded = true;

  var CONFIG_STORAGE_KEY = "aleloConfig";
  var HISTORY_STORAGE_KEY = "aleloHistory";
  var MAX_HISTORY_ENTRIES = 30;

  var CURRENT_CONFIG_VERSION = 10;

  var LLM_PROVIDER = {
    OLLAMA: "ollama",
    LLAMACPP: "llamacpp"
  };

  var DEFAULT_OLLAMA_API_URL = "http://127.0.0.1:11434/api/chat";
  var DEFAULT_LLAMACPP_API_URL = "http://127.0.0.1:8080/v1/completions";
  var DEFAULT_LLAMACPP_MODEL = "ggml-org/gemma-4-E2B-it-GGUF:Q8_0";
  var DEFAULT_API_URL = DEFAULT_OLLAMA_API_URL;
  var DEFAULT_MODEL = "gemma4:e2b";
  var LEGACY_DEFAULT_MODELS = ["llama3.2", "qwen3.5:9b"];
  var LLAMACPP_COMPLETION_MAX_TOKENS = 512;
  var DEFAULT_TEMPERATURE = 1;
  var MIN_TEMPERATURE = 0;
  var MAX_TEMPERATURE = 2;

  var PROVIDER_PRESETS = {
    [LLM_PROVIDER.OLLAMA]: {
      label: "Ollama",
      apiUrl: DEFAULT_OLLAMA_API_URL,
      defaultModel: DEFAULT_MODEL
    },
    [LLM_PROVIDER.LLAMACPP]: {
      label: "llama.cpp",
      apiUrl: DEFAULT_LLAMACPP_API_URL,
      defaultModel: DEFAULT_LLAMACPP_MODEL
    }
  };

  var LANGUAGES_PRESET = [
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

  var DEFAULT_FAVORITE_LANGUAGES = [{ code: "en", label: "English" }];

  var CONTEXT_MENU_PARENT_ID = "alelo-translate-parent";
  var CONTEXT_MENU_LANG_PREFIX = "alelo-lang-";
  var CONTEXT_MENU_ALL_FAVORITES_ID = "alelo-translate-all-favorites";
  var CONTEXT_MENU_TITLE = "Translate with Alelo";
  var CONTEXT_MENU_ALL_FAVORITES_TITLE = "All favorites (parallel)";

  var SYSTEM_PROMPT =
    "You are a translation assistant. Translate accurately. Reply with ONLY the translated text, no explanation.";

  var SOURCE_LANGUAGE_SYSTEM_PROMPT =
    'You identify the language of text. Reply with ONLY valid JSON: {"code":"bcp47","label":"English name"}. Use ISO 639-1 or BCP-47 codes (e.g. en, pt-BR). No markdown, no explanation.';

  var MESSAGE_ACTION = {
    RETRY_TRANSLATION: "retry-translation",
    GET_CONFIG: "get-config",
    SAVE_CONFIG: "save-config",
    GET_HISTORY: "get-history",
    SAVE_HISTORY_ENTRY: "save-history-entry",
    CLEAR_HISTORY: "clear-history",
    REMOVE_HISTORY_ENTRY: "remove-history-entry",
    GET_FLAG_IMAGE: "get-flag-image",
    FETCH_MODELS: "fetch-models"
  };

  var CONTENT_GLOBAL = {
    LOADED: "__aleloLoaded",
    HISTORY_SYNC: "__aleloHistorySync",
    SHOW_LOADING: "__aleloShowLoading",
    SHOW_PARTIAL: "__aleloShowPartial",
    SHOW_RESULT: "__aleloShowResult",
    SHOW_ERROR: "__aleloShowError",
    SHOW_COMPOSER: "__aleloShowComposer",
    UPDATE_SOURCE_LANGUAGE: "__aleloUpdateSourceLanguage"
  };

  var UI_LIMIT = {
    SOURCE_TEXT_PREVIEW: 280,
    HISTORY_SNIPPET: 64,
    URL_TRUNCATE: 72,
    TEXT_TRUNCATE: 72
  };
}
