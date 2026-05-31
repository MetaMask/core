/* eslint-disable no-restricted-globals */
/**
 * Recipe v1 — standalone headless runner.
 *
 * This is the ADR-58 non-UI verification example for MetaMask core. It executes
 * a Recipe v1 workflow graph that wraps the perps-controller `e2e/` scripts and
 * emits the standard Recipe v1 artifact package (recipe.json / summary.json /
 * trace.json / artifact-manifest.json).
 *
 * ZERO dependencies: only Node built-ins (`node:child_process`, `node:fs`,
 * `node:path`) + TypeScript. No Farmslot, no UI, no controller logic — the
 * controller behaviour is verified by the existing `e2e/` scripts; this runner
 * only orchestrates and packages their result as portable evidence.
 *
 * Usage:
 *   npx tsx recipe-v1/runner.ts [recipe-path]
 *
 * Default recipe-path: recipe-v1/recipes/market-data.recipe.json
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const HARNESS_NAME = '@metamask/perps-recipe-runner';
const HARNESS_VERSION = '0.1.0';
const SOURCE_PACKAGE = '@metamask/perps-controller';
const MAX_OUTPUT_BYTES = 4096;

/** The perps-controller package root — all `e2e/` commands run from here. */
const PROJECT_ROOT = resolve(__dirname, '..');
/** This runner's own directory (`recipe-v1/`). */
const RECIPE_V1_DIR = __dirname;

type RunStatus = 'pass' | 'fail';

type CommandNode = {
  action: 'command';
  cmd: string;
  timeout_ms?: number;
  next?: string;
  proofTarget?: string;
};

type AssertExitCodeNode = {
  action: 'assert_exit_code';
  source: string;
  equals: number;
  next?: string;
};

type AssertOutputNode = {
  action: 'assert_output';
  source: string;
  stream?: 'stdout' | 'stderr';
  contains: string;
  next?: string;
};

type EndNode = {
  action: 'end';
  status: RunStatus;
};

type WorkflowNode =
  | CommandNode
  | AssertExitCodeNode
  | AssertOutputNode
  | EndNode;

type Recipe = {
  schema_version: number;
  title: string;
  description?: string;
  proofTargets?: { id: string; claim: string }[];
  validate: {
    workflow: {
      entry: string;
      nodes: Record<string, WorkflowNode>;
    };
  };
};

type Manifest = {
  runner_protocol_version: number;
  action_registry_version: number;
  supported_official_actions: string[];
};

/** Output captured from a `command` node, referenced by later assert nodes. */
type CommandOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type TraceEntry = {
  nodeId: string;
  action: WorkflowNode['action'];
  ok: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  output?: CommandOutput;
  error?: string;
};

/**
 * Truncate a string to roughly `MAX_OUTPUT_BYTES`, appending a marker so the
 * artifact reader knows the value was clipped.
 *
 * @param value - The raw stream contents.
 * @returns The original string, or a truncated copy with a marker appended.
 */
function truncate(value: string): string {
  if (Buffer.byteLength(value, 'utf8') <= MAX_OUTPUT_BYTES) {
    return value;
  }
  return `${value.slice(0, MAX_OUTPUT_BYTES)}\n…[truncated]`;
}

/**
 * Derive a filesystem-friendly slug from a recipe title.
 *
 * @param title - The recipe title.
 * @returns A lowercase, hyphenated slug.
 */
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 60) || 'recipe'
  );
}

/**
 * Resolve the current git ref of the source package, falling back to `'local'`
 * when git is unavailable (e.g. exported tarball).
 *
 * @returns The HEAD commit hash, or `'local'`.
 */
function resolveGitRef(): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  if (result.status === 0 && typeof result.stdout === 'string') {
    return result.stdout.trim() || 'local';
  }
  return 'local';
}

/**
 * Read and parse a JSON file from disk.
 *
 * @param filePath - Absolute path to the JSON file.
 * @returns The parsed value, typed as `Type`.
 */
function readJson<Type>(filePath: string): Type {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Type;
}

/**
 * Execute a `command` node by spawning its shell command from the project root.
 *
 * @param node - The command node to run.
 * @returns The captured stdout/stderr and exit code.
 */
function runCommand(node: CommandNode): CommandOutput {
  const result = spawnSync(node.cmd, {
    shell: true,
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: node.timeout_ms,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Execute the linear workflow graph, following each node's `next` pointer.
 *
 * Walks from `entry`, runs `command` nodes, evaluates `assert_*` nodes against
 * earlier command output, and stops at the first failing assert or the `end`
 * node. Returns the final run status and the full execution trace.
 *
 * @param recipe - The recipe whose workflow should be executed.
 * @returns The terminal run status and the ordered trace entries.
 */
function executeWorkflow(recipe: Recipe): {
  status: RunStatus;
  trace: TraceEntry[];
} {
  const { entry, nodes } = recipe.validate.workflow;
  const trace: TraceEntry[] = [];
  const outputs: Record<string, CommandOutput> = {};

  let currentId: string | undefined = entry;
  let status: RunStatus = 'fail';
  let failed = false;

  while (currentId) {
    const node: WorkflowNode | undefined = nodes[currentId];
    if (!node) {
      throw new Error(`Workflow references unknown node: ${currentId}`);
    }

    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    let ok = false;
    let output: CommandOutput | undefined;
    let error: string | undefined;
    let next: string | undefined;

    switch (node.action) {
      case 'command': {
        output = runCommand(node);
        outputs[currentId] = output;
        // A command node is "ok" simply because it executed; the assertions
        // that follow decide whether its result satisfies the proof target.
        ok = true;
        next = node.next;
        break;
      }

      case 'assert_exit_code': {
        const source = outputs[node.source];
        if (!source) {
          error = `assert_exit_code references node without output: ${node.source}`;
        } else {
          ok = source.exitCode === node.equals;
          if (!ok) {
            error = `expected exit code ${node.equals}, got ${source.exitCode}`;
          }
        }
        next = ok ? node.next : undefined;
        break;
      }

      case 'assert_output': {
        const source = outputs[node.source];
        const stream = node.stream ?? 'stdout';
        if (!source) {
          error = `assert_output references node without output: ${node.source}`;
        } else {
          ok = source[stream].includes(node.contains);
          if (!ok) {
            error = `expected ${stream} to contain ${JSON.stringify(
              node.contains,
            )}`;
          }
        }
        next = ok ? node.next : undefined;
        break;
      }

      case 'end': {
        ok = true;
        // The terminal status is the declared status only if no prior assert
        // failed; otherwise the run has already failed.
        status = failed ? 'fail' : node.status;
        next = undefined;
        break;
      }

      default: {
        // Exhaustive guard — unknown actions are a recipe authoring error.
        const unknown = node as { action: string };
        throw new Error(`Unsupported action: ${unknown.action}`);
      }
    }

    const endedAt = new Date().toISOString();
    trace.push({
      nodeId: currentId,
      action: node.action,
      ok,
      startedAt,
      endedAt,
      durationMs: Date.now() - startMs,
      ...(output
        ? {
            output: {
              exitCode: output.exitCode,
              stdout: truncate(output.stdout),
              stderr: truncate(output.stderr),
            },
          }
        : {}),
      ...(error ? { error } : {}),
    });

    if (!ok) {
      // Any failing assert (or missing-output error) fails the whole run.
      failed = true;
      status = 'fail';
      break;
    }

    currentId = next;
  }

  return { status, trace };
}

/**
 * Entry point: load the recipe + manifest, execute the workflow, and write the
 * Recipe v1 artifact package to `recipe-v1/runs/<slug>-<timestamp>/`.
 */
function main(): void {
  const recipeArg = process.argv[2] ?? 'recipe-v1/recipes/market-data.recipe.json';
  const recipePath = resolve(PROJECT_ROOT, recipeArg);
  if (!existsSync(recipePath)) {
    console.error(`[recipe] Recipe not found: ${recipePath}`);
    process.exit(1);
  }

  const manifestPath = join(
    RECIPE_V1_DIR,
    'manifests',
    'perps.action-manifest.json',
  );
  const recipe = readJson<Recipe>(recipePath);
  const manifest = readJson<Manifest>(manifestPath);

  console.error(`[recipe] Running: ${recipe.title}`);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const { status, trace } = executeWorkflow(recipe);
  const endedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const gitRef = resolveGitRef();
  const passed = trace.filter((entry) => entry.ok).length;
  const failedCount = trace.filter((entry) => !entry.ok).length;

  const runDir = join(
    RECIPE_V1_DIR,
    'runs',
    `${slugify(recipe.title)}-${new Date().toISOString().replace(/[:.]/gu, '-')}`,
  );
  mkdirSync(runDir, { recursive: true });

  const summary = {
    status,
    total: trace.length,
    passed,
    failed: failedCount,
    startedAt,
    endedAt,
    durationMs,
    harness: {
      name: HARNESS_NAME,
      version: HARNESS_VERSION,
      runner_protocol_version: manifest.runner_protocol_version,
      action_registry_version: manifest.action_registry_version,
    },
    runner: {
      source: SOURCE_PACKAGE,
      git_ref: gitRef,
      name: SOURCE_PACKAGE,
    },
  };

  const artifactManifest = {
    version: 1,
    runStatus: status,
    provenance: { runner: { source: SOURCE_PACKAGE, git_ref: gitRef } },
    artifacts: [
      {
        path: 'recipe.json',
        type: 'recipe',
        label: 'Executed recipe',
        category: 'system',
      },
      {
        path: 'summary.json',
        type: 'summary',
        label: 'Run summary',
        category: 'system',
      },
      {
        path: 'trace.json',
        type: 'trace',
        label: 'Execution trace',
        category: 'system',
      },
    ],
  };

  writeFileSync(
    join(runDir, 'recipe.json'),
    `${JSON.stringify(recipe, null, 2)}\n`,
  );
  writeFileSync(
    join(runDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  writeFileSync(
    join(runDir, 'trace.json'),
    `${JSON.stringify(trace, null, 2)}\n`,
  );
  writeFileSync(
    join(runDir, 'artifact-manifest.json'),
    `${JSON.stringify(artifactManifest, null, 2)}\n`,
  );

  console.error(`[recipe] Artifacts written to: ${runDir}`);
  console.error(
    `[recipe] Status: ${status} (${passed}/${trace.length} steps ok)`,
  );

  process.exit(status === 'pass' ? 0 : 1);
}

main();
