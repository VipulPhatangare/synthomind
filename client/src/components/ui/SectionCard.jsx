/**
 * Standardizes the `rounded-xl border border-line bg-surface p-4` pattern
 * repeated across every page — a visual tweak (radius, padding, shadow)
 * now happens in one place instead of a find-and-replace across 10 files.
 */
export default function SectionCard({ title, action, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-section text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
