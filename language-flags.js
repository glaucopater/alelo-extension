if (!globalThis.__aleloLanguageFlagsLoaded) {
  globalThis.__aleloLanguageFlagsLoaded = true;

  var FLAG_CDN_BASE = "https://flagcdn.com";

  var LANGUAGE_FLAG_COUNTRIES = {
    sq: "al",
    hy: "am",
    az: "az",
    eu: "es",
    be: "by",
    bs: "ba",
    bg: "bg",
    ca: "es",
    hr: "hr",
    cs: "cz",
    da: "dk",
    nl: "nl",
    en: "gb",
    et: "ee",
    fi: "fi",
    fr: "fr",
    gl: "es",
    ka: "ge",
    de: "de",
    el: "gr",
    hu: "hu",
    is: "is",
    ga: "ie",
    it: "it",
    lv: "lv",
    lt: "lt",
    lb: "lu",
    mk: "mk",
    mt: "mt",
    cnr: "me",
    nb: "no",
    nn: "no",
    pl: "pl",
    pt: "pt",
    "pt-PT": "pt",
    "pt-BR": "br",
    ro: "ro",
    ru: "ru",
    gd: "gb-sct",
    sr: "rs",
    sk: "sk",
    sl: "si",
    es: "es",
    sv: "se",
    tr: "tr",
    uk: "ua",
    cy: "gb-wls"
  };

  globalThis.normalizeLangCodeForFlag = function normalizeLangCodeForFlag(code) {
    return String(code || "")
      .trim()
      .replace(/_/g, "-")
      .split("-")
      .map((part, index) => (index === 0 ? part.toLowerCase() : part.toUpperCase()))
      .join("-");
  };

  globalThis.resolveLanguageFlagCountry = function resolveLanguageFlagCountry(langCode) {
    const code = normalizeLangCodeForFlag(langCode);
    if (!code) return null;

    if (LANGUAGE_FLAG_COUNTRIES[code]) {
      return LANGUAGE_FLAG_COUNTRIES[code];
    }

    if (code.includes("-")) {
      const region = code.split("-")[1].toLowerCase();
      if (region.length === 2) {
        return region;
      }
    }

    const base = code.split("-")[0];
    if (LANGUAGE_FLAG_COUNTRIES[base]) {
      return LANGUAGE_FLAG_COUNTRIES[base];
    }

    return null;
  };

  var FLAG_CDN_WIDTHS = [20, 40, 80, 160, 320, 640, 1280];

  globalThis.snapFlagCdnWidth = function snapFlagCdnWidth(width) {
    const requested = Math.max(1, Number(width) || 20);
    return FLAG_CDN_WIDTHS.find((size) => size >= requested) || FLAG_CDN_WIDTHS[FLAG_CDN_WIDTHS.length - 1];
  };

  globalThis.getLanguageFlagUrl = function getLanguageFlagUrl(langCode, width = 20) {
    const country = resolveLanguageFlagCountry(langCode);
    if (!country) return null;
    const cdnWidth = snapFlagCdnWidth(width);
    return `${FLAG_CDN_BASE}/w${cdnWidth}/${country}.png`;
  };
}
