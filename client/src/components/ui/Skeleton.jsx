/**
 * Layout-matching loading placeholder, replacing bare "Loading…" text across
 * 8 pages/components. `lines` renders stacked text-line bars (for card
 * bodies); pass `className` directly for a single custom-shaped block
 * (chart area, table row, avatar).
 */
export default function Skeleton({ className = "h-4 w-full", lines }) {
  const shimmer =
    "relative overflow-hidden bg-surface-2 before:absolute before:inset-0 before:-translate-x-full " +
    "before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent " +
    "before:via-line/60 before:to-transparent";

  if (lines) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`h-3.5 rounded ${shimmer}`}
            style={{ width: i === lines - 1 ? "60%" : "100%" }}
          />
        ))}
      </div>
    );
  }

  return <div role="status" aria-label="Loading" className={`rounded ${shimmer} ${className}`} />;
}

/** Pre-shaped skeleton for a table row matching EmployeeList's columns. */
export function TableRowSkeleton({ cols = 4 }) {
  return (
    <tr className="border-t border-line">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-3/4" />
        </td>
      ))}
    </tr>
  );
}

/** Pre-shaped skeleton for a card matching the competency card layout. */
export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-lg" />
      <div className="mt-3">
        <Skeleton lines={2} />
      </div>
    </div>
  );
}
