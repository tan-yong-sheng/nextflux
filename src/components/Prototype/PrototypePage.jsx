// PROTOTYPE — throwaway. A single page that shows the three candidate
// surfaces side by side, using in-memory demo data so it works without a
// Miniflux account. Open /prototype (no login required).
import { useState } from "react";
import { collectInsights } from "./insights/collectInsights.js";
import { rankForYou } from "./insights/rankArticles.js";
import { DEMO_ARTICLES, DEMO_FEEDS } from "./insights/demoData.js";
import SidebarCleanup from "./variants/SidebarCleanup.jsx";
import { ForYouView } from "./variants/ForYouPanel.jsx";
import { PersonalizedView } from "./variants/PersonalizedPanel.jsx";

const VIEWS = [
  { key: "A", name: "A · Sidebar cleanup" },
  { key: "B", name: "B · For You tab" },
  { key: "C", name: "C · Personalized panel" },
];

export default function PrototypePage() {
  const [view, setView] = useState("A");
  const insights = collectInsights({
    feeds: DEMO_FEEDS,
    articles: DEMO_ARTICLES,
  });
  const ranked = rankForYou(DEMO_ARTICLES, insights);

  return (
    <div className="min-h-dvh bg-background p-6 text-foreground">
      <div className="mx-auto max-w-[900px]">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Prototype · demo data
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          Cheap “personalized” surfaces for Nextflux
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No ranking model. Everything below comes from counters the app already
          stores locally: unread counts, starred items, last activity, feed
          errors.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={
                view === v.key
                  ? "rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground"
                  : "rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              }
            >
              {v.name}
            </button>
          ))}
        </div>

        {/* Demo feeds have fake ids — pointer-events-none keeps demo clicks
            (mark read, unsubscribe, cards) away from real account actions. */}
        <div className="pointer-events-none mt-6 rounded-xl border border-border/60 bg-card/30 p-4">
          {view === "A" && (
            <div className="max-w-[320px] rounded-lg border border-border/60 bg-sidebar p-2">
              <p className="px-2 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                Sidebar (variant A)
              </p>
              <SidebarCleanup insights={insights} demo />
            </div>
          )}
          {view === "B" && (
            <div className="max-w-[560px]">
              <ForYouView insights={insights} articles={DEMO_ARTICLES} />
            </div>
          )}
          {view === "C" && <PersonalizedView insights={insights} />}
        </div>

        <details className="mt-6 rounded-xl border border-border/60 p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Why there is no “recommend feeds to follow” here
          </summary>
          <p className="mt-2 text-muted-foreground">
            Recommending <em>new</em> feeds needs a catalog of feeds to
            recommend from. Miniflux has no feed directory or discovery API, and
            shipping one means licensing and curating a dataset — that is a
            separate project, not a tab in this app. What is shown here only
            re-ranks what you already follow, using signals the app already has.
          </p>
          <p className="mt-2 text-muted-foreground">
            For You (B) scores {ranked.length} unread articles. It is a
            heuristic, not a model: shared terms with starred titles plus a
            boost for feeds you already read often.
          </p>
        </details>
      </div>
    </div>
  );
}
