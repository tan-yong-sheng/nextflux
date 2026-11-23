import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { db } from "@/db/database.js";
import { settingsState } from "@/stores/settingsStore.js";
import { filteredArticles } from "@/stores/articlesStore.js";
import {
  buildSignals,
  rankForYou,
} from "@/domain/personalization/personalization.js";
import ArticleCard from "@/components/ArticleList/components/ArticleCard.jsx";
import ReadingLayout from "@/components/ReadingLayout.jsx";
import ArticleView from "@/components/ArticleView/ArticleView.jsx";
import { ScrollArea } from "@/components/ui/scroll-area.jsx";
import { SidebarTrigger } from "@/components/ui/sidebar.jsx";
import { Spinner } from "@/components/ui/spinner.jsx";

const isVisibleFeed = (feed, showHiddenFeeds) =>
  showHiddenFeeds || !feed?.hide_globally;

function ForYouHeader({ count, hasSignal }) {
  const { t } = useTranslation();
  return (
    <div className="px-2 z-10">
      <div className="article-list-header w-full border-b py-2">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="rounded-full" />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{t("forYou.title")}</span>
            <span className="truncate text-xs text-muted-foreground opacity-60">
              {hasSignal
                ? t("forYou.summary", { count })
                : t("forYou.summaryWithoutSignal")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForYouReasons({ reasons }) {
  const { t } = useTranslation();
  if (!reasons?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
      <Sparkles className="size-3 text-muted-foreground opacity-60" />
      {reasons.map((reason) => (
        <span
          key={reason.type === "topic" ? reason.term : "feed"}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {reason.type === "topic"
            ? `#${reason.term}`
            : t("forYou.oftenRead")}
        </span>
      ))}
    </div>
  );
}

function ForYouEmpty() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Sparkles className="size-6 text-muted-foreground opacity-60" />
      <span className="text-sm text-muted-foreground">{t("forYou.empty")}</span>
    </div>
  );
}

function ForYouLoading() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Spinner className="size-5 text-muted-foreground opacity-60" />
    </div>
  );
}

export default function ForYouList() {
  const { articleId } = useParams();
  const { showHiddenFeeds } = useStore(settingsState);
  const articles = useLiveQuery(
    () => db.articles.where("status").equals("unread").toArray(),
    [],
  );
  const starred = useLiveQuery(
    () => db.articles.where("starred").equals(1).toArray(),
    [],
  );
  const read = useLiveQuery(
    () => db.articles.where("status").equals("read").toArray(),
    [],
  );
  const feeds = useLiveQuery(() => db.feeds.toArray(), []);
  const activeRef = useRef(null);
  const [items, setItems] = useState([]);
  const [hasSignal, setHasSignal] = useState(false);

  const visibleFeedIds = useMemo(() => {
    if (!feeds) return null;
    return new Set(
      feeds
        .filter((feed) => isVisibleFeed(feed, showHiddenFeeds))
        .map((feed) => feed.id),
    );
  }, [feeds, showHiddenFeeds]);

  const isLoading = !articles || !starred || !read || !visibleFeedIds;

  // Keep articles that were already ranked even after they are read: marking
  // an article read while scrolling would otherwise drop it from the list
  // under the cursor and break keyboard navigation.
  const rankedRef = useRef(new Map());

  useEffect(() => {
    if (isLoading) return;

    const scoped = articles.filter((article) =>
      visibleFeedIds.has(article.feedId),
    );
    // Starred and read overlap (a starred article is usually read too);
    // merge by id so a feed is not counted twice for the same article.
    const history = new Map();
    for (const article of [...starred, ...read]) {
      history.set(article.id, article);
    }
    const signals = buildSignals({ articles: [...history.values()] });
    const ranked = rankForYou({ articles: scoped, signals, limit: 50 });

    const merged = new Map();
    for (const item of ranked) merged.set(item.article.id, item);
    for (const [id, item] of rankedRef.current) {
      if (!merged.has(id)) merged.set(id, item);
    }
    rankedRef.current = merged;

    const ordered = [...merged.values()].sort(
      (a, b) =>
        b.score - a.score ||
        b.publishedAt - a.publishedAt ||
        b.article.id - a.article.id,
    );
    setItems(ordered);
    setHasSignal(Boolean(signals.hasSignal));
  }, [articles, starred, read, visibleFeedIds, isLoading]);

  // Keep the shared list in sync so keyboard navigation and the reader panel
  // follow the ranked order instead of the feed order.
  useEffect(() => {
    filteredArticles.set(items.map((item) => item.article));
  }, [items]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [articleId, items.length]);

  return (
    <ReadingLayout reader={<ArticleView />}>
      <div className="article-list-panel flex h-dvh w-full flex-col overflow-hidden">
        <ForYouHeader count={items.length} hasSignal={hasSignal} />
        <div className="min-h-0 flex-1 overflow-hidden">
          {isLoading ? (
            <ForYouLoading />
          ) : items.length === 0 ? (
            <ForYouEmpty />
          ) : (
            <ScrollArea className="h-full">
              <div className="mx-auto w-full max-w-[560px] px-2 pb-6">
                {items.map((item) => (
                  <div
                    key={item.article.id}
                    className="foryou-item"
                    ref={
                      String(item.article.id) === String(articleId)
                        ? activeRef
                        : undefined
                    }
                  >
                    <ArticleCard article={item.article} />
                    <ForYouReasons reasons={item.reasons} />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </ReadingLayout>
  );
}
