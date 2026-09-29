import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getShowcase } from "../api/client.js";
import Skeleton from "./ui/Skeleton.jsx";

/**
 * Curated entry points into the six deliberately-constructed demo cases the
 * generator builds (data_gen/generate.js's showcase employees). Without
 * this, a viewer lands on 500 mostly-average rows and has to get lucky to
 * find the interesting behavior — this is the guided tour instead.
 * Manifest is generator-emitted (never hardcoded IDs here — see
 * data_gen/showcase.json / GET /api/meta/showcase for why).
 */
export default function ShowcaseCards() {
  const [showcases, setShowcases] = useState(null);

  useEffect(() => { getShowcase().then((d) => setShowcases(d.showcases)); }, []);

  if (showcases === null) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  if (showcases.length === 0) {
    return <p className="text-meta text-ink-muted">No showcase manifest yet — run npm run generate-data.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {showcases.map((s) => (
        <Link
          key={s.key}
          to={`/employees/${s.employee_id}?competency=${s.competency_id}&why=1`}
          className="group flex flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand"
        >
          <span className="text-meta mb-1.5 w-fit rounded-full bg-brand/15 px-2 py-0.5 font-medium text-brand">
            {s.capability}
          </span>
          <h3 className="text-section text-ink">{s.headline}</h3>
          <p className="text-meta mt-1.5 flex-1 text-ink-muted">{s.blurb}</p>
          <p className="text-meta mt-3 text-ink-muted">
            {s.employee_name} · {s.competency_name}
            <span className="ml-1 text-brand opacity-0 transition-opacity group-hover:opacity-100">→</span>
          </p>
        </Link>
      ))}
    </div>
  );
}
