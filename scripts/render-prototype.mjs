// PROTOTYPE — throwaway. Server-renders the three variants to HTML so the
// output can be checked without a browser. Plain node cannot load .jsx or
// the "@/" alias, and the app expects browser globals at module load, so
// stubs are installed first and everything else is dynamically imported.
//
//   npx esbuild scripts/render-prototype.mjs --bundle --platform=node \
//     --format=esm --jsx=automatic --alias:@=./src \
//     '--banner:js=import { createRequire } from "module"; const require = createRequire(import.meta.url);' \
//     --outfile=/tmp/render-prototype.mjs && node /tmp/render-prototype.mjs

// --- minimal browser stubs (must run before app modules evaluate) ---
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.location = {
  pathname: "/",
  search: "",
  href: "http://localhost/",
};
globalThis.document = {
  createElement: () => ({
    innerHTML: "",
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild() {},
    setAttribute() {},
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementsByTagName: () => [],
  createTextNode: (text) => ({ textContent: text }),
  cookie: "",
  head: { appendChild() {} },
  body: { appendChild() {} },
  documentElement: { style: {} },
};
// Node 22 already provides a read-only navigator — don't stub it.
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// --- dynamic imports so stubs land first ---
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: React } = await import("react");
// Bundled components reference the classic-runtime global.
globalThis.React = React;
const { MemoryRouter } = await import("react-router-dom");
const { collectInsights } = await import(
  "../src/components/Prototype/insights/collectInsights.js"
);
const { DEMO_ARTICLES, DEMO_FEEDS } = await import(
  "../src/components/Prototype/insights/demoData.js"
);
const { default: SidebarCleanup } = await import(
  "../src/components/Prototype/variants/SidebarCleanup.jsx"
);
const { ForYouView } = await import(
  "../src/components/Prototype/variants/ForYouPanel.jsx"
);
const { PersonalizedView } = await import(
  "../src/components/Prototype/variants/PersonalizedPanel.jsx"
);

const insights = collectInsights({ feeds: DEMO_FEEDS, articles: DEMO_ARTICLES });

const html = renderToStaticMarkup(
  React.createElement(
    MemoryRouter,
    null,
    React.createElement(
      "div",
      null,
      React.createElement(SidebarCleanup, { insights, demo: true }),
      React.createElement(ForYouView, { insights, articles: DEMO_ARTICLES }),
      React.createElement(PersonalizedView, { insights }),
    ),
  ),
);

console.log(html);
