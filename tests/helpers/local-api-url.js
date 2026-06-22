function resolveLocalApiUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return parsed.href;
    }
  } catch {
    // fall through
  }
  return String(url || "").trim();
}

function probeUrlVariants(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return [];
  const resolved = resolveLocalApiUrl(trimmed);
  return resolved === trimmed ? [trimmed] : [trimmed, resolved];
}

module.exports = { resolveLocalApiUrl, probeUrlVariants };
