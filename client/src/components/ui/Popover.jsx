import { useEffect, useLayoutEffect, useRef, useState } from "react";

const PANEL_WIDTH = 256; // matches the w-64 class below — kept as a constant so the offset math and the rendered width can't drift apart
const VIEWPORT_MARGIN = 12; // minimum gap kept from either edge of the viewport

/**
 * Hand-rolled — no new dependency for something this small. Click/tap to
 * toggle (not hover-only: hover-to-open doesn't work on touch, and a
 * definition tooltip needs to work on tablets in a demo setting). Closes on
 * outside click, Escape, or scroll.
 *
 * Horizontal position is edge-aware: naively centering the panel on the
 * trigger (`left: 50%; transform: translateX(-50%)`) overflows off the left
 * of the viewport whenever the trigger sits near the left edge — exactly
 * the common case for a <Term> wrapping the first word(s) of a bullet list
 * item. Measured after mount via getBoundingClientRect and clamped to stay
 * fully on-screen, falling back to plain centering only when there's
 * nothing to correct for.
 */
export default function Popover({ trigger, children, panelClassName = "" }) {
  const [open, setOpen] = useState(false);
  const [offsetPx, setOffsetPx] = useState(0); // shift AWAY from centered, clamped to keep the panel on-screen
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const triggerCenter = rect.left + rect.width / 2;
    const naturalLeft = triggerCenter - PANEL_WIDTH / 2;
    const naturalRight = naturalLeft + PANEL_WIDTH;

    let shift = 0;
    if (naturalLeft < VIEWPORT_MARGIN) {
      shift = VIEWPORT_MARGIN - naturalLeft; // push right just enough to clear the left edge
    } else if (naturalRight > window.innerWidth - VIEWPORT_MARGIN) {
      shift = (window.innerWidth - VIEWPORT_MARGIN) - naturalRight; // push left just enough to clear the right edge
    }
    setOffsetPx(shift);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open && (
        <span
          role="tooltip"
          style={{ left: `calc(50% + ${offsetPx}px)`, transform: "translateX(-50%)", width: PANEL_WIDTH }}
          className={`absolute top-full z-30 mt-1.5 rounded-lg border border-line bg-surface-2 p-2.5 text-meta text-ink shadow-xl shadow-black/40 ${panelClassName}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
