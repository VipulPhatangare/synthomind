import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEvaluation, getShowcase, getEmployee } from "../api/client.js";
import VerdictChip from "../components/VerdictChip.jsx";
import TrajectoryChart from "../components/TrajectoryChart.jsx";
import ShowcaseCards from "../components/ShowcaseCards.jsx";
import SectionCard from "../components/ui/SectionCard.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import Skeleton from "../components/ui/Skeleton.jsx";
import Term from "../components/ui/Term.jsx";

const VERDICT_EXPLAIN = [
  { verdict: "improving", text: "confidently trending up — the posterior puts enough probability mass past the real-change threshold" },
  { verdict: "declining", text: "confidently trending down — same test, opposite direction" },
  { verdict: "stagnating", text: "confidently flat — enough evidence to say the trend is within noise of zero, not just an absence of evidence" },
  { verdict: "insufficient_evidence", text: "not enough evidence to call it either way — a real answer, not a failure" },
];

export default function Overview() {
  const [evaluation, setEvaluation] = useState(null);
  const [example, setExample] = useState(null); // { employee, verdict, competencyName }

  useEffect(() => {
    getEvaluation().then(setEvaluation).catch(() => setEvaluation(false));
    getShowcase().then(async (d) => {
      const worked = d.showcases.find((s) => s.key === "time_travel") || d.showcases[0];
      if (!worked) return;
      const detail = await getEmployee(worked.employee_id);
      const comp = detail.competencies.find((c) => c.competency_id === worked.competency_id);
      if (comp?.verdict) setExample({ employee: detail.employee, verdict: comp.verdict, competencyName: comp.name, showcase: worked });
    });
  }, []);

  return (
    <div>
      {/* Hero — prose stays at a readable line length even though the page doesn't */}
      <div className="mb-8">
        <h1 className="text-display max-w-4xl text-ink">
          Is this person improving, stagnating, or declining —
          <span className="text-brand"> per competency</span>, with the evidence to back it up?
        </h1>
        <p className="text-section mt-3 max-w-3xl text-ink-muted">
          TalentIQ combines assessments, training, project outcomes, and manager/peer feedback into one evidence
          stream, fits a continuous trajectory per competency, and calls it honestly — including when the honest
          answer is <Term term="abstention">we don't know yet</Term>.
          {" "}<Link to="/about" className="text-brand hover:text-brand-hover">How it works →</Link>
        </p>
      </div>

      {/* Headline model stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {evaluation === null && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        {evaluation === false && (
          <p className="text-meta col-span-full text-ink-muted">
            No evaluation report yet — run <code>npm run evaluate</code> on the server.
          </p>
        )}
        {evaluation && (
          <>
            <StatTile label="Accuracy" value={`${(evaluation.raw_accuracy * 100).toFixed(0)}%`} href="/model-quality" />
            <StatTile label="Macro-F1" value={evaluation.macro_f1.toFixed(2)} href="/model-quality" />
            <StatTile label="Calibration (ECE)" value={evaluation.calibration.ece.toFixed(3)} sub="lower is better" href="/model-quality" />
            <StatTile
              label="Dangerous errors"
              value={evaluation.abstention_quality.n_dangerous}
              sub={`of ${evaluation.abstention_quality.n_total} pairs`}
              tone="good"
              href="/model-quality"
            />
          </>
        )}
      </div>

      {/* The four verdicts, explained */}
      <SectionCard title="Four verdicts, not one score" className="mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VERDICT_EXPLAIN.map((v) => (
            <div key={v.verdict} className="flex items-start gap-2.5">
              <VerdictChip verdict={v.verdict} size="sm" />
              <p className="text-meta mt-0.5 text-ink-muted">{v.text}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Why abstention is a feature — the most counterintuitive design choice, preempted */}
      <SectionCard title="Why we sometimes say “we don't know”" className="mb-6 border-insufficient/30 bg-insufficient/5">
        <p className="text-section text-ink">
          {evaluation
            ? `On this dataset, the system abstained on ${((1 - evaluation.abstention_quality.coverage) * 100).toFixed(0)}% of pairs — and when it DID commit to a direction, it was never confidently wrong about which way things were moving.`
            : evaluation === false
              ? "This gets more concrete once an evaluation report exists — see the note above."
              : "Loading…"}
        </p>
        <p className="text-meta mt-2 text-ink-muted">
          A verdict built on thin, stale, or single-source evidence is gated to <Term term="abstention">insufficient_evidence</Term> regardless
          of how confident the underlying math looks — because a tight-looking posterior built on bad evidence is still bad evidence.
          Every abstention ships with a concrete counterfactual: exactly what evidence would resolve it, sized (e.g. "2 more ratings from raters
          not already represented"). See the <Link to="/model-quality" className="text-brand hover:text-brand-hover">full evaluation</Link> for the numbers behind this.
        </p>
      </SectionCard>

      {/* Live worked example */}
      <SectionCard title="One real trajectory, read end to end" className="mb-8">
        {!example && <Skeleton className="h-56 w-full rounded-lg" />}
        {example && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] xl:grid-cols-[3fr_1fr]">
            <div>
              <p className="text-meta mb-2 text-ink-muted">
                {example.employee.name} · {example.competencyName}
              </p>
              <TrajectoryChart history={example.verdict.level_history} roleTargetLevel={example.verdict.role_target_level} verdict={example.verdict.verdict} />
              <div className="mt-2 flex items-center gap-2">
                <VerdictChip verdict={example.verdict.verdict} confidence={example.verdict.confidence} />
                <Link to={`/employees/${example.employee.employee_id}?competency=${example.showcase.competency_id}&why=1`} className="text-meta text-brand hover:text-brand-hover">
                  open full profile →
                </Link>
              </div>
            </div>
            <div className="text-meta space-y-2 text-ink-muted">
              <p><span className="text-ink">Dots</span> — individual evidence observations (assessments, feedback, KPIs, …), each weighted by source reliability and rater <Term term="calibration">calibration</Term>.</p>
              <p><span className="text-ink">Line</span> — the model's estimated level over time (the <Term term="posterior">posterior</Term>), not a literal average of the dots.</p>
              <p><span className="text-ink">Shaded band</span> — uncertainty around that estimate. Narrower where evidence is dense and recent.</p>
              <p><span className="text-ink">Dashed gold line</span> — the role's target level for this competency.</p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Showcase grid */}
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-title text-ink">Start here</h2>
          <p className="text-meta text-ink-muted">Six deliberately-built cases, each demonstrating one capability directly.</p>
        </div>
        <Link to="/employees" className="text-meta text-ink-muted hover:text-brand">browse all 500 →</Link>
      </div>
      <ShowcaseCards />
    </div>
  );
}
