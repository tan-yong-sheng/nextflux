import DOMPurify from "dompurify";

// Article HTML comes from remote feeds: untrusted. Keep the tags the article
// renderer needs (media, code, tables, iframes) and drop what can execute
// script or restyle the whole app. See modern-web-guidance sanitize-untrusted-html.
const ARTICLE_SANITIZE_CONFIG = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["allowfullscreen", "frameborder", "allow", "referrerpolicy"],
  FORBID_TAGS: ["style", "form", "input", "button", "select", "textarea"],
};

export function sanitizeArticleHtml(html) {
  if (!html) return "";
  return DOMPurify.sanitize(html, ARTICLE_SANITIZE_CONFIG);
}
