/**
 * Minimal OPML reader for Miniflux exports.
 *
 * The parser only needs the subscription list, so it walks `outline` tags
 * instead of building a full DOM. Categories are the `outline` elements
 * without an `xmlUrl`; feeds are the ones with one.
 */

const OUTLINE_TAG = /<(\/?)outline\b([^>]*?)(\/?)>/gi;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*"([^"]*)"/g;

function parseAttributes(source) {
  const attributes = {};
  ATTRIBUTE.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE.exec(source)) !== null) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2]);
  }
  return attributes;
}

function decodeEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * @param {string} xml OPML document
 * @returns {{ feeds: { url: string, title: string, category: string | null }[] }}
 */
export function parseOPML(xml) {
  const text = typeof xml === "string" ? xml : "";
  const feeds = [];
  const stack = [];
  let match;

  OUTLINE_TAG.lastIndex = 0;
  while ((match = OUTLINE_TAG.exec(text)) !== null) {
    const isClosing = match[1] === "/";
    const selfClosing = match[3] === "/";
    if (isClosing) {
      stack.pop();
      continue;
    }
    const attributes = parseAttributes(match[2]);
    const url = attributes.xmlurl;
    if (url) {
      feeds.push({
        url,
        title: attributes.title || attributes.text || "",
        category: stack.length ? stack[stack.length - 1] : null,
      });
      if (!selfClosing) stack.push(null);
      continue;
    }
    const category = attributes.title || attributes.text || "";
    if (selfClosing) continue;
    stack.push(category);
  }

  return { feeds };
}

/**
 * Compare an OPML subscription list against the feeds already on the server.
 *
 * Restores are additive: existing feeds are never removed, so the diff only
 * reports what an import would actually add.
 *
 * @param {{ feeds: { url: string, title: string, category: string | null }[] }} opml
 * @param {string[]} existingUrls feed URLs already present on the server
 */
export function diffFeeds(opml, existingUrls = []) {
  const existing = new Set(existingUrls);
  const added = [];
  const present = [];
  const seen = new Set();

  for (const feed of opml?.feeds ?? []) {
    if (seen.has(feed.url)) continue;
    seen.add(feed.url);
    if (existing.has(feed.url)) present.push(feed);
    else added.push(feed);
  }

  return { added, present, total: added.length + present.length };
}

function hostOf(serverUrl) {
  try {
    // The hostname without the port: it identifies the server without
    // exposing a port or credentials.
    return new URL(serverUrl).hostname;
  } catch {
    return "";
  }
}

export function buildBackupMeta({ account, exportedAt, feedCount }) {
  return {
    version: 1,
    app: "nextflux",
    // Only the hostname is stored: the full URL can carry credentials or a
    // private host name that does not belong in a repository.
    host: hostOf(account?.serverUrl),
    username: account?.username || "",
    userId: account?.userId ?? "",
    exportedAt,
    feedCount,
  };
}
