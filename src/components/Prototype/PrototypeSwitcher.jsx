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
  const raw = params.get("variant");
  // No variant means "off" — the prototype must never appear by accident,
  // including in production builds.
  const variant = PROTOTYPE_VARIANTS.some((v) => v.key === raw) ? raw : null;
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
  const active = index === -1 ? null : PROTOTYPE_VARIANTS[index];

  const cycle = useCallback(
    (direction) => {
      if (index === -1) {
        onChange(PROTOTYPE_VARIANTS[0].key);
        return;
      }
      const next =
        (index + direction + PROTOTYPE_VARIANTS.length) %
        PROTOTYPE_VARIANTS.length;
      onChange(PROTOTYPE_VARIANTS[next].key);
    },
    [index, onChange],
  );

  // Arrow keys drive the switcher only while a variant is active, and never
  // in production — otherwise they would hijack normal page navigation.
  useEffect(() => {
    if (import.meta.env.PROD || index === -1) return;
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
  }, [cycle, index]);

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
          {active ? `${active.key} · ${active.name}` : "prototype off"}
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
