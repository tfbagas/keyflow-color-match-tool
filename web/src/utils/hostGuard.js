export function checkAllowedHost() {
  const host = (
    typeof self !== "undefined" && self.location && self.location.hostname
      ? self.location.hostname
      : typeof window !== "undefined" && window.location && window.location.hostname
      ? window.location.hostname
      : ""
  ).toLowerCase();

  if (!host) return true;
  return (
    host === "keyflow-color-match-tool.pages.dev" ||
    host.endsWith(".keyflow-color-match-tool.pages.dev") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

export function sanitizeMetadataText(raw, fallback = "", maxLen = 160) {
  if (typeof raw !== "string") return fallback;
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    const ch = raw[i];
    if (code <= 0x1f || code === 0x7f) continue;
    if (ch === "<" || ch === ">" || ch === '"') continue;
    out += ch;
  }
  const trimmed = out.trim().slice(0, maxLen);
  return trimmed || fallback;
}
