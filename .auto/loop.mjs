#!/usr/bin/env node
// Faithful CLI emulation of the pi-autoresearch extension tools
// (init_experiment / run_experiment / log_experiment), which are not exposed
// as tools in this session. Matches the extension's .auto/log.jsonl format,
// MAD-based confidence scoring, and keep/discard git semantics.
//
// Usage:
//   node .auto/loop.mjs init <name> <metricName> <metricUnit> <lower|higher>
//   node .auto/loop.mjs run <cmd...>            # time it, parse METRIC lines, run checks.sh on pass
//   node .auto/loop.mjs log <status> <metric> <desc> [metricsJSON] [asiJSON]
//     status: keep | discard | crash | checks_failed
//     keep       -> git add -A + git -c commit.gpgsign=false commit "<desc>\n\nResult: {json}"
//     non-keep   -> revert production changes, preserve .auto/
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const JSONL = path.join(here, 'log.jsonl');
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', timeout: 600000, ...opts });

function readState() {
  const lines = fs.readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const configs = lines.filter((l) => l.type === 'config');
  const cfg = configs[configs.length - 1];
  const results = lines.filter((l) => typeof l.run === 'number');
  return { cfg, results, segment: configs.length };
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[(s.length - 1) >> 1]; }

function computeConfidence(results, segment, direction) {
  const cur = results.filter((r) => r.segment === segment && r.metric > 0);
  if (cur.length < 3) return null;
  const values = cur.map((r) => r.metric);
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  if (mad === 0) return null;
  const baseline = cur[0].metric; // first run in segment
  let bestKept = null;
  for (const r of cur) {
    if (r.status === 'keep' && r.metric > 0) {
      if (bestKept === null || (direction === 'lower' ? r.metric < bestKept : r.metric > bestKept)) {
        bestKept = r.metric;
      }
    }
  }
  if (bestKept === null || bestKept === baseline) return null;
  return Math.abs(bestKept - baseline) / mad;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'init') {
  const [name, metricName, metricUnit, bestDirection] = args;
  const entry = JSON.stringify({ type: 'config', name, metricName, metricUnit, bestDirection });
  fs.appendFileSync(JSONL, entry + '\n');
  console.log('initialized: ' + entry);
} else if (cmd === 'run') {
  const runCmd = args.join(' ');
  const t0 = Date.now();
  let out = '';
  let code = 0;
  try { out = sh(runCmd, { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
  const duration = ((Date.now() - t0) / 1000).toFixed(2);
  const metrics = {};
  for (const m of out.matchAll(/^METRIC (\w+)=(\S+)$/gm)) metrics[m[1]] = Number(m[2]);
  let checksPass = null, checksOut = '';
  if (code === 0 && Object.keys(metrics).length > 0 && fs.existsSync(path.join(here, 'checks.sh'))) {
    try { checksOut = sh('bash .auto/checks.sh', { stdio: ['ignore', 'pipe', 'pipe'] }); checksPass = true; }
    catch (e) { checksPass = false; checksOut = (e.stdout || '') + (e.stderr || ''); }
  }
  console.log('exit=' + code + ' duration=' + duration + 's checks=' +
    (checksPass === null ? 'not-run' : checksPass ? 'pass' : 'FAIL'));
  console.log('metrics ' + JSON.stringify(metrics));
  if (code !== 0 || checksPass === false) console.log(out.split('\n').slice(-40).join('\n'));
  fs.writeFileSync(path.join(here, 'last_run.json'), JSON.stringify({
    command: runCmd, exitCode: code, durationSeconds: Number(duration),
    metrics, checksPass, checksTail: checksOut.split('\n').slice(-80).join('\n'),
  }, null, 2));
} else if (cmd === 'log') {
  const [status, metricStr, desc, metricsJSON, asiJSON] = args;
  const { cfg, results, segment } = readState();
  const metric = Number(metricStr);
  const metrics = metricsJSON ? JSON.parse(metricsJSON) : {};
  const asi = asiJSON ? JSON.parse(asiJSON) : undefined;
  const entry = {
    run: results.length + 1,
    commit: sh('git rev-parse --short=7 HEAD').trim(),
    metric, metrics, status, description: desc,
    timestamp: Date.now(), segment, confidence: null,
  };
  if (asi) entry.asi = asi;
  const allResults = [...results, entry];
  entry.confidence = computeConfidence(allResults, segment, cfg.bestDirection);
  fs.appendFileSync(JSONL, JSON.stringify(entry) + '\n');

  const state = readState();
  const cur = state.results.filter((r) => r.segment === segment);
  const baseline = cur[0].metric;
  console.log('Logged #' + entry.run + ': ' + status + ' — ' + desc);
  console.log('Baseline ' + cfg.metricName + ': ' + baseline + cfg.metricUnit +
    ' | this: ' + metric + ' (' + (((metric - baseline) / baseline) * 100).toFixed(1) + '%)');
  if (entry.confidence !== null) console.log('Confidence: ' + entry.confidence.toFixed(1) + 'x noise floor');
  console.log('Runs this segment: ' + cur.length + '/' + 25);

  if (status === 'keep') {
    sh('git add -A');
    const resultData = JSON.stringify({ status, [cfg.metricName || 'metric']: metric, ...metrics });
    const out = execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-m',
      desc + '\n\nResult: ' + resultData],
      { cwd: root, encoding: 'utf8' });
    console.log('Git: committed — ' + out.split('\n')[0]);
  } else {
    sh(`git checkout -- . ':(exclude,glob)**/.auto' ':(exclude,glob)**/.auto/**'`);
    try { sh(`git clean -fd -e '.auto' -e '**/.auto/**' 2>/dev/null || true`); } catch { /* ignore */ }
    console.log('Git: reverted production changes (.auto preserved)');
  }
} else {
  console.error('usage: loop.mjs init|run|log ...');
  process.exit(2);
}
