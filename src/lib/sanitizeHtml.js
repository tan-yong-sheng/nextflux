import createDOMPurify from "dompurify";

// Article HTML comes from remote feeds: untrusted. Keep the tags the article
// renderer needs (media, code, tables, iframes) and drop what can execute
// script or restyle the whole app. See modern-web-guidance sanitize-untrusted-html.
const ARTICLE_SANITIZE_CONFIG = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["allowfullscreen", "frameborder", "allow", "referrerpolicy"],
  FORBID_TAGS: ["style", "form", "input", "button", "select", "textarea"],
  FORBID_ATTR: ["style"],
};

// ADD_ATTR is global, not per-tag: keep these attributes on iframes only.
const IFRAME_ONLY_ATTRS = new Set([
  "allowfullscreen",
  "frameborder",
  "allow",
  "referrerpolicy",
]);

// The `allow` attribute delegates browser features to the embedded origin.
// Only the features the players need are allowed; camera, microphone,
// geolocation and the rest stay blocked.
const ALLOWED_IFRAME_FEATURES = new Set([
  "autoplay",
  "encrypted-media",
  "fullscreen",
  "picture-in-picture",
  "clipboard-write",
]);

function normalizeAllow(value) {
  return String(value)
    .split(";")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      const [feature, ...rest] = part.split(" ");
      const sources = rest.join(" ").split(" ").filter(Boolean);
      const allowedSources = sources.filter(
        (source) =>
          source === "'self'" ||
          source === "'none'" ||
          source === "*" ||
          source.startsWith("https://") ||
          source.startsWith("http://"),
      );
      if (!ALLOWED_IFRAME_FEATURES.has(feature)) return null;
      // A bare feature means "every origin" in the Permissions Policy syntax.
      if (!allowedSources.length) return `${feature} *`;
      return `${feature} ${allowedSources.join(" ")}`;
    })
    .filter(Boolean)
    .join("; ");
}

let purify = null;

// Created lazily so the sanitizer picks up the window that exists at call
// time (browser, or a jsdom window installed by the tests). An unsupported
// instance is not cached, so a window installed later is picked up.
function getPurify() {
  if (purify) return purify;
  const win = typeof window !== "undefined" ? window : undefined;
  if (!win) return null;
  const instance = createDOMPurify(win);
  if (!instance.isSupported) return null;
  instance.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.nodeName !== "IFRAME" && IFRAME_ONLY_ATTRS.has(data.attrName)) {
      data.keepAttr = false;
      return;
    }
    if (data.attrName === "allow" && node.nodeName === "IFRAME") {
      const allow = normalizeAllow(data.attrValue);
      if (!allow) {
        data.keepAttr = false;
        return;
      }
      data.attrValue = allow;
    }
  });
  purify = instance;
  return purify;
}

// Fallback for an environment without a DOM: drop the tags and the content
// of the elements that carry executable or style payloads, then the rest of
// the tags. The result is text, not markup.
function stripMarkup(html) {
  return String(html)
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*\/?>/gi, "")
    .replace(/<[^>]*>/g, "");
}

export function sanitizeArticleHtml(html) {
  if (!html) return "";
  const domPurify = getPurify();
  // Without a DOM the sanitizer cannot do its job. Returning the raw HTML
  // would hand untrusted markup straight to the renderer, so strip it all.
  if (!domPurify) return stripMarkup(html);
  return domPurify.sanitize(html, ARTICLE_SANITIZE_CONFIG);
}
