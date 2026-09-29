/**
 * Phase 9: the real evaluation — macro-F1, calibration (ECE), and
 * abstention/risk-coverage quality against the generator's ground truth,
 * plus a per-archetype breakdown. This replaces Phase 3's inline sanity
 * check with the actual eval the plan promised.
 *
 *   npm run evaluate
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/db/connection.js";

const VERDICTS = ["improving", "declining", "stagnating", "insufficient_evidence"];
const DIRECTIONAL = new Set(["improving", "declining"]);

function confusionMatrix(pairs) {
  const m = {};
  for (const a of VERDICTS) { m[a] = {}; for (const b of VERDICTS) m[a][b] = 0; }
  for (const p of pairs) m[p.expected][p.actual] += 1;
  return m;
}

function macroF1(matrix) {
  const perClass = {};
  let f1Sum = 0;
  for (const cls of VERDICTS) {
    const tp = matrix[cls][cls];
    const fp = VERDICTS.reduce((s, other) => (other === cls ? s : s + matrix[other][cls]), 0);
    const fn = VERDICTS.reduce((s, other) => (other === cls ? s : s + matrix[cls][other]), 0);
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    perClass[cls] = { precision: round(precision), recall: round(recall), f1: round(f1), support: VERDICTS.reduce((s, o) => s + matrix[cls][o], 0) };
    f1Sum += f1;
  }
  return { macroF1: round(f1Sum / VERDICTS.length), perClass };
}

function round(x, d = 3) { const m = 10 ** d; return Math.round(x * m) / m; }

function calibration(pairs, nBins = 10) {
  const bins = Array.from({ length: nBins }, () => ({ n: 0, confSum: 0, correct: 0 }));
  for (const p of pairs) {
    const idx = Math.min(nBins - 1, Math.floor(p.confidence * nBins));
    bins[idx].n += 1;
    bins[idx].confSum += p.confidence;
    if (p.actual === p.expected) bins[idx].correct += 1;
  }
  const total = pairs.length;
  let ece = 0;
  const table = bins.map((b, i) => {
    if (b.n === 0) return { range: `${(i / nBins).toFixed(1)}-${((i + 1) / nBins).toFixed(1)}`, n: 0, avgConfidence: null, accuracy: null };
    const avgConfidence = b.confSum / b.n;
    const accuracy = b.correct / b.n;
    ece += (b.n / total) * Math.abs(accuracy - avgConfidence);
    return { range: `${(i / nBins).toFixed(1)}-${((i + 1) / nBins).toFixed(1)}`, n: b.n, avgConfidence: round(avgConfidence), accuracy: round(accuracy) };
  });
  return { ece: round(ece), bins: table.filter((b) => b.n > 0) };
}

/**
 * The metric that actually matters more than raw accuracy: when the system
 * commits to a directional verdict, how often is it DANGEROUSLY wrong
 * (opposite direction) vs. just off by one adjacent class vs. correctly
 * abstaining instead of guessing?
 */
function abstentionQuality(pairs) {
  const total = pairs.length;
  const covered = pairs.filter((p) => p.actual !== "insufficient_evidence");
  const coverage = covered.length / total;

  let dangerous = 0, boundary = 0, correct = 0;
  for (const p of covered) {
    if (p.actual === p.expected) { correct += 1; continue; }
    const bothDirectional = DIRECTIONAL.has(p.actual) && DIRECTIONAL.has(p.expected);
    if (bothDirectional && p.actual !== p.expected) dangerous += 1;
    else boundary += 1;
  }
  const safeAbstains = pairs.filter((p) => p.actual === "insufficient_evidence" && p.expected !== "insufficient_evidence").length;
  const trueAbstains = pairs.filter((p) => p.actual === "insufficient_evidence" && p.expected === "insufficient_evidence").length;

  return {
    coverage: round(coverage),
    risk_given_covered: round(1 - correct / covered.length),
    dangerous_error_rate: round(dangerous / total),       // confidently claimed the OPPOSITE direction
    boundary_error_rate: round(boundary / total),          // adjacent-class miss (e.g. stagnating vs improving)
    safe_abstentions: safeAbstains,                          // retreated to insufficient_evidence rather than guess wrong
    true_abstentions: trueAbstains,                           // correctly recognized genuinely insufficient evidence
    n_dangerous: dangerous, n_boundary: boundary, n_covered: covered.length, n_total: total,
  };
}

function perArchetype(pairs) {
  const byArchetype = new Map();
  for (const p of pairs) {
    if (!byArchetype.has(p.archetype)) byArchetype.set(p.archetype, []);
    byArchetype.get(p.archetype).push(p);
  }
  const rows = [];
  for (const [archetype, group] of byArchetype.entries()) {
    const correct = group.filter((p) => p.actual === p.expected).length;
    const dist = {};
    for (const p of group) dist[p.actual] = (dist[p.actual] || 0) + 1;
    rows.push({ archetype, n: group.length, accuracy: round(correct / group.length), distribution: dist });
  }
  rows.sort((a, b) => b.n - a.n);
  return rows;
}

async function main() {
  const gtPath = path.resolve("data_gen", "ground_truth.json");
  if (!fs.existsSync(gtPath)) {
    console.error(`Ground truth not found at ${gtPath} — run 'npm run generate-data' first.`);
    process.exit(1);
  }
  const groundTruth = JSON.parse(fs.readFileSync(gtPath, "utf8"));

  await connectDb();
  const db = mongoose.connection.db;
  const verdicts = await db.collection("verdicts").find({}).toArray();
  const vMap = new Map(verdicts.map((v) => [`${v.employee_id}::${v.competency_id}`, v]));

  const pairs = [];
  for (const g of groundTruth) {
    const v = vMap.get(`${g.employee_id}::${g.competency_id}`);
    if (!v) continue;
    pairs.push({
      employee_id: g.employee_id, competency_id: g.competency_id, archetype: g.archetype,
      expected: g.expected_verdict, actual: v.verdict, confidence: v.confidence,
    });
  }

  const matrix = confusionMatrix(pairs);
  const { macroF1: f1, perClass } = macroF1(matrix);
  // Calibration is only meaningful over answers the system actually committed
  // to — an insufficient_evidence "confidence" is the runner-up probability
  // that FAILED to cross threshold, not a claim of correctness, so including
  // it here would score honest abstention as miscalibration.
  const committed = pairs.filter((p) => p.actual !== "insufficient_evidence");
  const cal = calibration(committed);
  const abstention = abstentionQuality(pairs);
  const archetypeBreakdown = perArchetype(pairs);

  const report = {
    n_pairs_evaluated: pairs.length,
    raw_accuracy: round(pairs.filter((p) => p.actual === p.expected).length / pairs.length),
    macro_f1: f1,
    per_class: perClass,
    confusion_matrix: matrix,
    calibration: cal,
    abstention_quality: abstention,
    per_archetype: archetypeBreakdown,
    generated_at: new Date().toISOString(),
  };

  const outPath = path.resolve("data_gen", "eval_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // --- console report ---
  console.log(`\n=== TalentIQ Evaluation — ${pairs.length} employee×competency pairs ===\n`);
  console.log(`Raw accuracy: ${(report.raw_accuracy * 100).toFixed(1)}%`);
  console.log(`Macro-F1:     ${f1}\n`);

  console.log("Per-class precision / recall / F1:");
  for (const [cls, m] of Object.entries(perClass)) {
    console.log(`  ${cls.padEnd(22)} P=${m.precision}  R=${m.recall}  F1=${m.f1}  (n=${m.support})`);
  }

  console.log(`\nCalibration (over the ${committed.length} pairs where the system committed to an answer) — ECE: ${cal.ece}`);
  console.log("  confidence bin -> avg confidence vs actual accuracy in that bin:");
  for (const b of cal.bins) {
    console.log(`  ${b.range}  n=${String(b.n).padEnd(5)} conf=${b.avgConfidence}  acc=${b.accuracy}`);
  }

  console.log("\nAbstention / risk-coverage quality:");
  console.log(`  coverage (gave a directional/stagnating answer): ${(abstention.coverage * 100).toFixed(1)}%`);
  console.log(`  risk given covered (wrong when it did answer):   ${(abstention.risk_given_covered * 100).toFixed(1)}%`);
  console.log(`  DANGEROUS errors (opposite direction, confident): ${abstention.n_dangerous}/${abstention.n_total} = ${(abstention.dangerous_error_rate * 100).toFixed(2)}%`);
  console.log(`  boundary errors (adjacent class):                 ${abstention.n_boundary}/${abstention.n_total} = ${(abstention.boundary_error_rate * 100).toFixed(2)}%`);
  console.log(`  safe abstentions (retreated instead of guessing): ${abstention.safe_abstentions}`);
  console.log(`  true abstentions (genuinely insufficient evidence, correctly caught): ${abstention.true_abstentions}`);

  console.log("\nPer-archetype accuracy:");
  for (const row of archetypeBreakdown) {
    console.log(`  ${row.archetype.padEnd(20)} n=${String(row.n).padEnd(5)} acc=${(row.accuracy * 100).toFixed(1)}%  dist=${JSON.stringify(row.distribution)}`);
  }

  console.log(`\nFull report written to ${outPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
