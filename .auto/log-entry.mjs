#!/usr/bin/env node
// Appends an experiment entry to .auto/log.jsonl in the pi-autoresearch
// extension's format, computing the session confidence score with the same
// MAD-based formula the extension uses (best kept improvement over the
// baseline divided by the median absolute deviation of all metric values in
// the current segment).
import fs from 'node:fs';

const logPath = new URL('./log.jsonl', import.meta.url);

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: log-entry.mjs <status> <description> [asi-json] [metric] [metrics-json] [commit]');
  process.exit(1);
}
const [status, description, asiJson, metricArg, metricsJson, commitArg] = args;

const lines = fs.existsSync(logPath)
  ? fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
  : [];
const entries = lines.map((l) => JSON.parse(l));
const config = entries.filter((e) => e.type === 'config');
const segment = config.length;
const runs = entries.filter((e) => e.run !== undefined);

let metric = Number(metricArg);
let metrics = {};
if (metricsJson) {
  try { metrics = JSON.parse(metricsJson); } catch { /* ignore */ }
}
if (!Number.isFinite(metric)) {
  // Pull from the most recent run's metrics if not provided.
  metric = NaN;
}
const commit = commitArg || 'HEAD';
const asi = asiJson ? JSON.parse(asiJson) : undefined;

const entry = {
  run: runs.length + 1,
  commit: String(commit).slice(0, 7),
  metric,
  metrics,
  status,
  description,
  timestamp: Date.now(),
  segment,
  confidence: null,
  asi,
};
entries.push(entry);

// Confidence (extension formula): MAD of all metric>0 values in the segment.
const cur = entries.filter((e) => e.run !== undefined && e.segment === segment && e.metric > 0);
let confidence = null;
if (cur.length >= 3) {
  const values = cur.map((e) => e.metric);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[(sorted.length - 1) >> 1];
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[(deviations.length - 1) >> 1];
  const baseline = cur[0].metric;
  const kept = cur.filter((e) => e.status === 'keep' && e.metric > 0).map((e) => e.metric);
  const bestKept = kept.length ? Math.min(...kept) : null;
  if (mad !== 0 && bestKept !== null && bestKept !== baseline) {
    confidence = Math.abs(bestKept - baseline) / mad;
    entry.confidence = Math.round(confidence * 100) / 100;
  }
}

fs.writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');

const best = cur.filter((e) => e.status === 'keep' && e.metric > 0).map((e) => e.metric);
console.log(
  JSON.stringify({
    run: entry.run,
    status,
    metric,
    confidence: entry.confidence,
    sessionBest: best.length ? Math.min(...best) : null,
    baseline: cur.length ? cur[0].metric : null,
  }),
);
