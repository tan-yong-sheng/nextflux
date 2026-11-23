// PROTOTYPE — throwaway. Server-renders the three variants to HTML so the
// output can be checked without a browser. Run: node scripts/render-prototype.mjs
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { collectInsights } from "../src/components/Prototype/insights/collectInsights.js";
import { DEMO_ARTICLES, DEMO_FEEDS } from "../src/components/Prototype/insights/demoData.js";
import SidebarCleanup from "../src/components/Prototype/variants/SidebarCleanup.jsx";
import ForYouPanel from "../src/components/Prototype/variants/ForYouPanel.jsx";
import PersonalizedPanel from "../src/components/Prototype/variants/PersonalizedPanel.jsx";

const insights = collectInsights({ feeds: DEMO_FEEDS, articles: DEMO_ARTICLES });

const html = renderToStaticMarkup(
  React.createElement(
    MemoryRouter,
    null,
    React.createElement(
      "div",
      null,
      React.createElement(SidebarCleanup, { insights }),
      React.createElement(ForYouPanel, { insights, articles: DEMO_ARTICLES }),
      React.createElement(PersonalizedPanel, { insights }),
    ),
  ),
);

console.log(html);
