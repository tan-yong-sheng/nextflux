import DOMPurify from "dompurify";

// Article HTML comes from remote feeds: untrusted. Keep the tags the article
// renderer needs (media, code, tables, iframes) and drop what can execute
// script or restyle the whole app. See modern-web-guidance sanitize-untrusted-html.
const ARTICLE_SANITIZE_CONFIG = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["allowfullscreen", "frameborder", "allow", "referrerpolicy"],
  FORBID_TAGS: ["style", "form", "input", "button", "select", "textarea"],
};

// ADD_ATTR is global, not per-tag: keep these attributes on iframes only.
const IFRAME_ONLY_ATTRS = new Set([
  "allowfullscreen",
  "frameborder",
  "allow",
  "referrerpolicy",
]);
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  if (
    node.nodeName !== "IFRAME" &&
    IFRAME_ONLY_ATTRS.has(data.attrName)
  ) {
    data.keepAttr = false;
  }
});

export function sanitizeArticleHtml(html) {
  if (!html) return "";
  return DOMPurify.sanitize(html, ARTICLE_SANITIZE_CONFIG);
}
