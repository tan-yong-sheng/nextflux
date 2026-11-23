// PROTOTYPE — throwaway. Variant C: one "Personalized" dashboard panel —
// topics you read, feeds you under-use, and search made obvious.
import { Link } from "react-router-dom";
import { Search, Sparkles, TriangleAlert, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import FeedIcon from "@/components/ui/FeedIcon.jsx";
import { searchDialogOpen } from "@/stores/modalStore.js";

export default function PersonalizedPanel({ insights }) {
  const { topics, lowActivity, broken, topStarredFeeds } = insights;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-6">
      <section className="rounded-xl border border-border/60 bg-card/40 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" /> Your reading, summarised
        </h2>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[
            ["Feeds", insights.totals.feeds],
            ["Unread", insights.totals.unread],
            ["Read", insights.totals.read],
            ["Starred", insights.totals.starred],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/40 py-3">
              <div className="text-lg font-semibold">{value}</div>
              <div className="text-[11px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card/40 p-4">
        <h3 className="mb-3 text-sm font-semibold">Topics you star</h3>
        {topics.length ? (
          <div className="flex flex-wrap gap-2">
            {topics.map(({ term, count }) => (
              <span
                key={term}
                className="rounded-full bg-muted px-3 py-1 text-xs"
              >
                {term}
                <span className="ml-1.5 text-muted-foreground">{count}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Star a few articles and your topics show up here.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border/60 bg-card/40 p-4">
        <h3 className="mb-3 text-sm font-semibold">Feeds going quiet</h3>
        {lowActivity.length ? (
          <ul className="space-y-2">
            {lowActivity.slice(0, 6).map((feed) => (
              <li key={feed.id} className="flex items-center gap-2 text-sm">
                <FeedIcon feedId={feed.id} />
                <Link
                  to={`/feed/${feed.id}`}
                  className="min-w-0 flex-1 truncate"
                >
                  {feed.title}
                </Link>
                <span className="text-[11px] text-muted-foreground">
                  {feed.daysIdle === null
                    ? "no new items"
                    : `${feed.daysIdle}d quiet`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Everything you follow is still publishing.
          </p>
        )}
      </section>

      {broken.length > 0 && (
        <section className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4" /> Broken feeds
          </h3>
          <ul className="space-y-2">
            {broken.slice(0, 5).map((feed) => (
              <li key={feed.id} className="flex items-center gap-2 text-sm">
                <FeedIcon feedId={feed.id} />
                <span className="min-w-0 flex-1 truncate">{feed.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {feed.parsingErrorCount} errors
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-border/60 bg-card/40 p-4">
        <h3 className="mb-3 text-sm font-semibold">Find anything, any feed</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Search spans every feed you follow, not just the one you are looking at.
        </p>
        <Button
          variant="secondary"
          onClick={() => searchDialogOpen.set(true)}
        >
          <Search className="size-4" /> Search all feeds
        </Button>
      </section>

      {topStarredFeeds.length > 0 && (
        <section className="rounded-xl border border-border/60 bg-card/40 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Moon className="size-4" /> Most starred
          </h3>
          <ul className="space-y-2">
            {topStarredFeeds.map((feed) => (
              <li key={feed.id} className="flex items-center gap-2 text-sm">
                <FeedIcon feedId={feed.id} />
                <Link
                  to={`/feed/${feed.id}`}
                  className="min-w-0 flex-1 truncate"
                >
                  {feed.title}
                </Link>
                <span className="text-[11px] text-muted-foreground">
                  {feed.starred} starred
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
