// PROTOTYPE — throwaway. ?variant= gate + floating switcher (UI prototype
// skill, sub-shape A: variants live on an existing route).
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PROTOTYPE_VARIANTS = [
  { key: "A", name: "Sidebar cleanup" },
  { key: "B", name: "For You tab" },
  { key: "C", name: "Personalized panel" },
];

export function usePrototypeVariant() {
  const [params, setParams] = useSearchParams();
  const variant = params.get("variant") ?? PROTOTYPE_VARIANTS[0].key;
  const setVariant = useCallback(
    (next) => {
      const updated = new URLSearchParams(params);
      updated.set("variant", next);
      setParams(updated, { replace: true });
    },
    [params, setParams],
  );
  return { variant, setVariant };
}

export function PrototypeSwitcher({ current, onChange }) {
  const index = PROTOTYPE_VARIANTS.findIndex((v) => v.key === current);
  const active = PROTOTYPE_VARIANTS[index] ?? PROTOTYPE_VARIANTS[0];

  const cycle = useCallback(
    (direction) => {
      const next =
        (index + direction + PROTOTYPE_VARIANTS.length) %
        PROTOTYPE_VARIANTS.length;
      onChange(PROTOTYPE_VARIANTS[next].key);
    },
    [index, onChange],
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      event.preventDefault();
      cycle(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-white/20 bg-neutral-900/95 px-2 py-1 text-neutral-100 shadow-2xl">
        <button
          type="button"
          aria-label="Previous variant"
          className="rounded-full p-1 hover:bg-white/10"
          onClick={() => cycle(-1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 text-xs font-medium tracking-wide">
          {active.key} · {active.name}
        </span>
        <button
          type="button"
          aria-label="Next variant"
          className="rounded-full p-1 hover:bg-white/10"
          onClick={() => cycle(1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
