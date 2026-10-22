#!/usr/bin/env node
// .auto/log.jsonl writer/reader — dashboard-compatible entries:
// {"run":N,"commit":sha|null,"metric":X,"metrics":{...},"status":"keep|discard|crash|checks_failed",
//  "description":"...","timestamp":ms,"segment":1,"confidence":null,"asi":{...}}
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LOG = path.join(ROOT, '.auto/log.jsonl');

function readEntries() {
  if (!fs.existsSync(LOG)) return [];
  return fs
    .readFileSync(LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeEntry(entry) {
  fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
}

const command = process.argv[2];

if (command === 'init') {
  // name, metricName, metricUnit, bestDirection from argv
  const [, , , name, metricName, metricUnit, bestDirection] = process.argv;
  if (fs.existsSync(LOG)) {
    throw new Error('.auto/log.jsonl already exists');
  }
  writeEntry({
    type: 'config',
    name,
    metricName,
    metricUnit,
    bestDirection,
  });
  console.log(
    `init: ${name} / ${metricName} (${metricUnit}, ${bestDirection})`,
  );
} else if (command === 'best') {
  const runs = readEntries().filter(
    (e) => e.run !== undefined && e.status === 'keep',
  );
  if (runs.length === 0) {
    console.log('null');
  } else {
    let best = runs[0];
    for (const r of runs) {
      if (r.metric < best.metric) best = r;
    }
    console.log(
      JSON.stringify({
        run: best.run,
        metric: best.metric,
        description: best.description,
      }),
    );
  }
} else if (command === 'append') {
  const args = process.argv.slice(3);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const entry = {
    run: Number(get('--run')),
    commit: get('--commit') ?? null,
    metric: Number(get('--metric')),
    metrics: JSON.parse(get('--metrics') ?? '{}'),
    status: get('--status'),
    description: get('--desc') ?? '',
    timestamp: Date.now(),
    segment: 1,
    confidence: null,
    asi: JSON.parse(get('--asi') ?? '{}'),
  };
  writeEntry(entry);
  console.log(
    `log: run ${entry.run} ${entry.status} metric=${entry.metric} (desc: ${entry.description})`,
  );
} else {
  console.log(
    'usage: logrun.mjs init <name> <metricName> <unit> <direction> | best | append --run N --status S --desc D --metric M [--metrics JSON] [--asi JSON] [--commit SHA]',
  );
}
