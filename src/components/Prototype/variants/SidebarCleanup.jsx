// PROTOTYPE — throwaway. Variant A: a compact "cleanup" section in the
// sidebar, using counters the app already fetches.
import { Link } from "react-router-dom";
import FeedIcon from "@/components/ui/FeedIcon.jsx";
import { Trash2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { handleMarkAllRead } from "@/handlers/articleHandlers.js";
import {
  currentFeedId,
  unsubscribeModalOpen,
} from "@/stores/modalStore.js";

const REASON = {
  idle: (s) => `quiet for ${s.daysIdle ?? "a while"} days`,
  backlog: (s) => `${s.unread} unread piling up`,
};

export default function SidebarCleanup({ insights, demo = false }) {
  // A feed can qualify as both "quiet" and "backlog" — list it once.
  const candidates = [
    ...new Map(
      [
        ...insights.lowActivity
          .filter((s) => s.unread > 0)
          .slice(0, 5)
          .map((s) => ({ feed: s, reason: REASON.idle(s) })),
        ...insights.backlog.slice(0, 3).map((s) => ({
          feed: s,
          reason: REASON.backlog(s),
        })),
      ].map((candidate) => [candidate.feed.id, candidate]),
    ).values(),
  ].slice(0, 6);

  if (!candidates.length) return null;

  return (
    <div className="px-2 py-2">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Worth a look
        </span>
        <span className="text-[10px] text-muted-foreground">
          {candidates.length}
        </span>
      </div>
      <ul className="space-y-1">
        {candidates.map(({ feed, reason }) => (
          <li
            key={feed.id}
            className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sidebar-accent"
          >
            <FeedIcon feedId={feed.id} />
            <Link
              to={`/feed/${feed.id}`}
              className="min-w-0 flex-1 leading-tight"
            >
              <span className="block truncate text-sm">{feed.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {reason}
              </span>
            </Link>
            {/* Demo mode (/prototype) gets fake feed ids — no real actions. */}
            {!demo && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Mark all read"
                  onClick={() => handleMarkAllRead("feed", feed.id)}
                >
                  <Inbox className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Unsubscribe"
                  onClick={() => {
                    currentFeedId.set(feed.id.toString());
                    unsubscribeModalOpen.set(true);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
