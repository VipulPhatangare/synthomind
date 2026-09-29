import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { getEvaluation } from "../api/client.js";
import StatTile from "../components/ui/StatTile.jsx";
import SectionCard from "../components/ui/SectionCard.jsx";
import Skeleton from "../components/ui/Skeleton.jsx";
import Term from "../components/ui/Term.jsx";
import CalibrationChart from "../components/CalibrationChart.jsx";
import ConfusionMatrix from "../components/ConfusionMatrix.jsx";

// Plain-English label for what each generator archetype actually tests —
// "true_stagnator" means nothing to a reader who hasn't read data_gen/.
const ARCHETYPE_LABEL = {
  true_stagnator: "Genuinely flat",
  steady_improver: "Clean improvement",
  noisy_flat: "Flat but noisy",
  late_bloomer: "Flat, then improving",
  decliner: "Clean decline",
  unobserved_true: "Evidence stopped mid-way",
  stale_true: "Evidence went stale",
  sparse_true: "Almost no evidence",
  role_switch_up: "Role switch — up",
  role_switch_down: "Role switch — down",
  biased_rater_true: "Manager swap, skill flat",
};

export default function ModelQuality() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getEvaluation().then(setData).catch((e) => setError(e.response?.data?.error || "Failed to load"));
  }, []);

  if (error) {
    return (
      <SectionCard title="Can you trust this?">
        <p className="text-meta text-declining">{error} — run <code>npm run evaluate</code> on the server.</p>
      </SectionCard>
    );
  }

  if (!data) {
    return (
      <div>
        <Skeleton className="mb-6 h-6 w-64" />
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const archetypeData = [...data.per_archetype]
    .filter((a) => a.n >= 5) // drop the 1-2 sample showcase-only archetypes, they're not a meaningful rate
    .sort((a, b) => b.n - a.n)
    .map((a) => ({ ...a, label: ARCHETYPE_LABEL[a.archetype] || a.archetype }));

  return (
    <div>
      <h1 className="text-title text-ink">Can you trust this?</h1>
      <p className="text-meta mb-1 mt-1 max-w-3xl text-ink-muted">
        Scored against the synthetic generator's own ground truth — a self-consistency check, not external
        validation. {data.n_pairs_evaluated} employee × competency pairs.
      </p>
      {data.stale && (
        <p className="text-meta mb-4 rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-gold">
          ⚠ This report predates the most recent verdict recompute — numbers below may not reflect what's live.
        </p>
      )}

      <div className="mb-6 mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Raw accuracy" value={`${(data.raw_accuracy * 100).toFixed(1)}%`} />
        <StatTile label="Macro-F1" value={data.macro_f1.toFixed(3)} />
        <StatTile label="Calibration (ECE)" value={data.calibration.ece.toFixed(3)} sub="lower is better" />
        <StatTile
          label="Dangerous errors"
          value={`${data.abstention_quality.n_dangerous} / ${data.abstention_quality.n_total}`}
          sub="confidently called the wrong direction"
          tone="good"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Calibration — does confidence mean what it says?">
          <CalibrationChart bins={data.calibration.bins} />
          <p className="text-meta mt-2 text-ink-muted">
            Points on the diagonal are perfectly calibrated — a bin predicted at 90% confidence was right ~90% of
            the time. Circle size = number of pairs in that bin.
          </p>
        </SectionCard>

        <SectionCard title="Confusion matrix">
          <ConfusionMatrix matrix={data.confusion_matrix} />
        </SectionCard>
      </div>

      <SectionCard title="Abstention & risk-coverage" className="mb-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="Coverage"
            value={`${(data.abstention_quality.coverage * 100).toFixed(0)}%`}
            sub={<><Term term="abstention">committed</Term> to a directional/stagnating answer</>}
          />
          <StatTile
            label="Risk given covered"
            value={`${(data.abstention_quality.risk_given_covered * 100).toFixed(1)}%`}
            sub="wrong when it DID answer"
          />
          <StatTile label="Boundary errors" value={data.abstention_quality.n_boundary} sub="adjacent-class miss, not opposite" />
          <StatTile label="Safe abstentions" value={data.abstention_quality.safe_abstentions} sub="retreated rather than guessed wrong" tone="good" />
        </div>
      </SectionCard>

      <SectionCard title="Accuracy by archetype" className="mb-6">
        <p className="text-meta mb-3 text-ink-muted">
          Each archetype is a deliberately different failure mode the synthetic generator builds — not a random sample.
        </p>
        <ResponsiveContainer width="100%" height={Math.max(220, archetypeData.length * 32)}>
          <BarChart data={archetypeData} layout="vertical" margin={{ left: 12, right: 40 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} />
            <YAxis dataKey="label" type="category" stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} width={150} />
            <Tooltip
              contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
              formatter={(v, n, props) => [`${(v * 100).toFixed(1)}% (n=${props.payload.n})`, "accuracy"]}
            />
            <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
              {archetypeData.map((a) => (
                <Cell key={a.archetype} fill={a.accuracy >= 0.8 ? "var(--color-improving)" : a.accuracy >= 0.6 ? "var(--color-gold)" : "var(--color-declining)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <p className="text-meta pb-4 text-ink-muted">
        Full per-class precision/recall/F1 and the raw report are available via <code>GET /api/evaluation</code> or
        <code> server/data_gen/eval_report.json</code>.
      </p>
    </div>
  );
}
