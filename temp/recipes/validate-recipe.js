#!/usr/bin/env node
/**
 * Headless recipe runner for core-farm.
 * Walks a validate.workflow graph executing `command`, `assert_stdout`, and `end` actions.
 * Produces summary.json, trace.json, and artifact-manifest.json per RECIPE-RUNNER-PROTOCOL.md.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = parseArgs(process.argv.slice(2));
const recipePath = args['--recipe'];
const artifactsDir = args['--artifacts-dir'];
const dryRun = args['--dry-run'] !== undefined;

if (!recipePath) {
  console.error('Usage: validate-recipe.js --recipe <path> [--artifacts-dir <dir>] [--dry-run]');
  process.exit(1);
}

const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
const workflow = recipe.validate?.workflow;
if (!workflow?.entry || !workflow?.nodes) {
  console.error('Invalid recipe: missing validate.workflow.entry or validate.workflow.nodes');
  process.exit(1);
}

const outDir = artifactsDir || path.join(path.dirname(recipePath), 'artifacts');
fs.mkdirSync(path.join(outDir, 'logs'), { recursive: true });

const trace = [];
const artifacts = [];
const stdout_cache = {};
const startedAt = new Date().toISOString();
let passed = 0;
let failed = 0;

if (dryRun) {
  console.log(`[dry-run] Recipe: ${recipe.title || recipePath}`);
  console.log(`[dry-run] Entry: ${workflow.entry}`);
  const visited = new Set();
  let nodeId = workflow.entry;
  while (nodeId && !visited.has(nodeId)) {
    visited.add(nodeId);
    const node = workflow.nodes[nodeId];
    if (!node) { console.error(`[dry-run] MISSING node: ${nodeId}`); process.exit(1); }
    console.log(`[dry-run] ${nodeId}: action=${node.action}${node.cmd ? ' cmd=' + node.cmd : ''}`);
    if (node.action === 'end') break;
    nodeId = node.next;
  }
  console.log('[dry-run] Graph OK');
  process.exit(0);
}

console.log(`[runner] Recipe: ${recipe.title || recipePath}`);
console.log(`[runner] Artifacts: ${outDir}`);

let currentNode = workflow.entry;
while (currentNode) {
  const node = workflow.nodes[currentNode];
  if (!node) {
    console.error(`[runner] Unknown node: ${currentNode}`);
    failed++;
    break;
  }

  const nodeStart = Date.now();
  const entry = { id: currentNode, action: node.action, ok: false, durationMs: 0, artifacts: [] };

  if (node.description) entry.description = node.description;

  try {
    switch (node.action) {
      case 'command': {
        console.log(`[runner] ${currentNode}: ${node.cmd}`);
        const result = runCommand(node.cmd, currentNode, outDir);
        stdout_cache[currentNode] = result.stdout;
        entry.ok = true;
        entry.artifacts.push(`logs/${currentNode}.stdout.log`);
        if (result.stderr) entry.artifacts.push(`logs/${currentNode}.stderr.log`);
        artifacts.push({
          path: `logs/${currentNode}.stdout.log`,
          type: 'log',
          label: node.description || `stdout: ${currentNode}`,
          nodeId: currentNode,
          mimeType: 'text/plain',
        });
        passed++;
        break;
      }

      case 'assert_stdout': {
        const source = node.source;
        if (!source) throw new Error('assert_stdout requires "source" field');
        const logFile = path.join(outDir, 'logs', `${source}.stdout.log`);
        const output = stdout_cache[source] || (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '');
        if (!output) throw new Error(`No stdout captured for source "${source}"`);

        let assertOk = true;
        const reasons = [];

        if (node.contains) {
          const re = new RegExp(node.contains);
          if (!re.test(output)) {
            assertOk = false;
            reasons.push(`contains "${node.contains}" not matched`);
          }
        }

        if (node.not_contains) {
          const re = new RegExp(node.not_contains);
          if (re.test(output)) {
            assertOk = false;
            reasons.push(`not_contains "${node.not_contains}" was found`);
          }
        }

        if (node.json_path && node.expected !== undefined) {
          try {
            const parsed = JSON.parse(output);
            const value = jsonPathGet(parsed, node.json_path);
            if (String(value) !== String(node.expected)) {
              assertOk = false;
              reasons.push(`json_path "${node.json_path}" = ${JSON.stringify(value)}, expected ${JSON.stringify(node.expected)}`);
            }
          } catch (e) {
            assertOk = false;
            reasons.push(`json parse/path error: ${e.message}`);
          }
        }

        if (assertOk) {
          console.log(`[runner] ${currentNode}: assert_stdout PASS`);
          entry.ok = true;
          passed++;
        } else {
          console.error(`[runner] ${currentNode}: assert_stdout FAIL — ${reasons.join('; ')}`);
          entry.ok = false;
          entry.error = reasons.join('; ');
          failed++;
        }
        break;
      }

      case 'end': {
        entry.ok = true;
        entry.description = `Terminal: ${node.status || 'pass'}`;
        console.log(`[runner] ${currentNode}: end (${node.status || 'pass'})`);
        if (node.status === 'fail') failed++;
        else passed++;
        break;
      }

      case 'wait': {
        const ms = node.ms || node.duration_ms || 1000;
        console.log(`[runner] ${currentNode}: wait ${ms}ms`);
        sleepSync(ms);
        entry.ok = true;
        passed++;
        break;
      }

      case 'log': {
        console.log(`[runner] ${currentNode}: ${node.message || ''}`);
        entry.ok = true;
        passed++;
        break;
      }

      default:
        console.error(`[runner] ${currentNode}: unknown action "${node.action}"`);
        entry.error = `unknown action: ${node.action}`;
        failed++;
    }
  } catch (err) {
    entry.ok = false;
    entry.error = err.message;
    console.error(`[runner] ${currentNode}: ERROR — ${err.message}`);
    failed++;
  }

  entry.durationMs = Date.now() - nodeStart;
  trace.push(entry);

  if (!entry.ok) break;
  if (node.action === 'end') break;
  currentNode = node.next || null;
}

const completedAt = new Date().toISOString();
const status = failed > 0 ? 'fail' : 'pass';
const durationMs = new Date(completedAt) - new Date(startedAt);

const summary = { status, startedAt, completedAt, durationMs, passed, failed, error: null };
const manifest = { version: 1, runStatus: status, artifacts };

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, 'trace.json'), JSON.stringify(trace, null, 2));
fs.writeFileSync(path.join(outDir, 'artifact-manifest.json'), JSON.stringify(manifest, null, 2));
fs.copyFileSync(recipePath, path.join(outDir, 'recipe.json'));

console.log(`[runner] ${status.toUpperCase()} — ${passed} passed, ${failed} failed (${durationMs}ms)`);
process.exit(failed > 0 ? 1 : 0);

// --- helpers ---

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i];
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        result[key] = argv[++i];
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

function runCommand(cmd, nodeId, outDir) {
  let stdout = '', stderr = '';
  try {
    stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    fs.writeFileSync(path.join(outDir, 'logs', `${nodeId}.stdout.log`), stdout);
    fs.writeFileSync(path.join(outDir, 'logs', `${nodeId}.stderr.log`), stderr);
    throw new Error(`command exited ${err.status}: ${stderr.slice(0, 500)}`);
  }
  fs.writeFileSync(path.join(outDir, 'logs', `${nodeId}.stdout.log`), stdout);
  if (stderr) fs.writeFileSync(path.join(outDir, 'logs', `${nodeId}.stderr.log`), stderr);
  return { stdout, stderr };
}

function jsonPathGet(obj, pathStr) {
  const parts = pathStr.replace(/^\$\.?/, '').split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    const arrMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrMatch) {
      current = current[arrMatch[1]];
      if (Array.isArray(current)) current = current[parseInt(arrMatch[2])];
      else return undefined;
    } else {
      current = current[part];
    }
  }
  return current;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
