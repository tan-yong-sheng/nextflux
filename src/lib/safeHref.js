// Feed links are untrusted: only navigate to web/mail/tel targets or
// site-relative paths. Everything else (javascript:, data:, vbscript:) is dropped.
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

// Browsers strip tabs and newlines before parsing a URL, so "/\t/evil.com"
// becomes "//evil.com". Strip control characters before any check.
function normalizeHref(href) {
  return href.replace(/\p{Cc}/gu, "").trim();
}

function baseUrl() {
  if (typeof document !== "undefined" && document.baseURI) {
    return document.baseURI;
  }
  return "https://localhost/";
}

/**
 * True when the href may be followed: an absolute http(s)/mailto/tel URL, a
 * fragment, or a path/query relative link that resolves to http(s).
 */
export function isSafeHref(href) {
  if (typeof href !== "string" || !href) return false;
  const normalized = normalizeHref(href);
  if (!normalized) return false;

  // Scheme-relative and backslash URLs navigate to an arbitrary external host
  // (browsers normalize backslashes to slashes). Reject them outright.
  if (/^[/\\]{2}/.test(normalized)) return false;
  if (normalized.startsWith("#")) return true;

  let url;
  try {
    url = new URL(normalized, baseUrl());
  } catch {
    return false;
  }
  return SAFE_PROTOCOLS.has(url.protocol);
}

/**
 * Human-readable label for a link: the hostname for an absolute URL, or the
 * raw href when there is no host (mailto:, tel:, relative paths).
 */
export function getLinkLabel(href) {
  if (typeof href !== "string" || !href) return "";
  const normalized = normalizeHref(href);
  // Only an absolute URL has a hostname worth showing; a relative link would
  // resolve to our own host and label it wrongly.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return normalized;
  try {
    const hostname = new URL(normalized).hostname;
    if (hostname) return hostname;
  } catch {
    // fall through to the raw href
  }
  return normalized;
}
