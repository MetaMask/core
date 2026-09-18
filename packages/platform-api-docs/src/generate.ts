import { directoryExists } from '@metamask/utils/node';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { Project } from 'ts-morph';

import { extractFromSourceFile } from './extraction.js';
import {
  generateIndexPage,
  generateNamespacePage,
  generateSidebars,
} from './markdown.js';
import type { RootCapabilitiesTypeReference } from './root-messenger-discovery.js';
import { discoverFromRootMessengerCapabilitiesTypes } from './root-messenger-discovery.js';
import { createProject } from './ts-project.js';
import type { MessengerCapabilityPacket, NamespaceGroup } from './types.js';

/** How many skipped capability types to name before summarizing the rest. */
const MAX_SKIPPED_SHOWN = 10;

/**
 * Options for the `scan` strategy, which reads every `*Messenger` type alias
 * in every file it can find. Used when no single messenger aggregates every
 * capability.
 */
type ScanStrategyOptions = {
  /** The selected strategy. */
  strategy: 'scan';
  /** Directories, relative to the project root, to scan. */
  scanDirs: string[];
};

/**
 * Options for the `root-messenger` strategy, which walks the types a
 * project declares for its root messenger capabilities instead of scanning the
 * entire repo. Used when one messenger carries every action and event.
 */
type RootMessengerStrategyOptions = {
  /** The selected strategy. */
  strategy: 'root-messenger';
  /** The root messenger actions type reference. */
  rootActions: RootCapabilitiesTypeReference;
  /** The root messenger events type reference. */
  rootEvents: RootCapabilitiesTypeReference;
};

/**
 * Options for the generate function.
 */
export type GenerateOptions = {
  /** Absolute path to the project to scan. */
  projectPath: string;
  /** Absolute path to the output directory for generated docs. */
  outputDir: string;
  /**
   * Short label identifying the project the docs were generated from (e.g.
   * "Core", "Extension"). Stamped in the index page title.
   */
  projectLabel?: string | null;
  /**
   * Git commit SHA the docs were generated from. Stamped in the index page
   * intro so engineers know how current the site is.
   */
  commitSha?: string | null;
} & (ScanStrategyOptions | RootMessengerStrategyOptions);

/**
 * Result returned by the generate function.
 */
export type GenerateResult = {
  namespaces: number;
  actions: number;
  events: number;
};

/**
 * The set of directories available to scan for messenger types, resolved from
 * the project's filesystem layout.
 */
type ScanSources = {
  /** User-configured scan dirs that exist on disk (relative to projectPath). */
  scanDirs: string[];
  /** Absolute path to `packages/` if it exists, otherwise null. */
  packagesDir: string | null;
  /** Absolute path to `node_modules/@metamask/` if it exists, otherwise null. */
  nodeModulesDir: string | null;
};

/**
 * Compute a deduplication score for a messenger item, preferring items with
 * JSDoc and from the "home" package whose name matches the namespace.
 *
 * @param item - The messenger item to score.
 * @returns A numeric score (higher is better).
 */
function deduplicationScore(item: MessengerCapabilityPacket): number {
  const jsDocScore = item.jsDoc ? 2 : 0;
  const namespacePrefix = item.typeString
    .split(':')[0]
    .replace(/(?:Controller|Service)$/u, '')
    .toLowerCase();
  const homeScore =
    namespacePrefix.length > 0 &&
    item.sourceFile.toLowerCase().includes(namespacePrefix)
      ? 1
      : 0;
  // A capability declared in a package's own source is usually also visible in
  // the `dist` built from it, and a cross-package import resolves to that
  // `dist` rather than to the sibling's source. Prefer the source, which is
  // what an engineer can actually read and edit. Projects that only ever see
  // published packages score every candidate the same way, so nothing changes
  // for them.
  const sourceScore = /[\\/]dist[\\/]/u.test(item.sourceFile) ? 0 : 1;
  return jsDocScore + homeScore + sourceScore;
}

const execFileAsync = promisify(execFile);

/**
 * Resolve the default branch of a project's `origin` remote by reading the
 * symbolic ref `refs/remotes/origin/HEAD`. Falls back to `main` if the
 * symbolic ref isn't set (e.g. in shallow CI clones).
 *
 * @param projectPath - Absolute path to the project root.
 * @returns The default branch name (e.g. "main", "master", "develop").
 */
async function resolveDefaultBranch(projectPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      { cwd: projectPath },
    );
    // stdout looks like "origin/main"; strip the leading "origin/".
    const trimmed = stdout.trim();
    const slash = trimmed.indexOf('/');
    return slash === -1
      ? // istanbul ignore next: defensive — `symbolic-ref --short` always
        // returns `origin/<branch>` when the symbolic ref is set; this
        // fallback only matters if git's output format ever changes.
        trimmed || 'main'
      : trimmed.slice(slash + 1);
  } catch {
    return 'main';
  }
}

/**
 * Resolve the bare GitHub repository URL for a project by reading its
 * `origin` remote.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns A URL like "https://github.com/Owner/Repo" or null when the remote
 * isn't a GitHub URL or can't be read.
 */
export async function resolveRepoUrl(
  projectPath: string,
): Promise<string | null> {
  try {
    const { stdout: remoteRaw } = await execFileAsync(
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: projectPath },
    );

    const remote = remoteRaw.trim();

    // Parse owner/repo from SSH or HTTPS remote URLs
    // Handles aliases like github.com-Org used in SSH configs
    const match = remote.match(
      /github\.com[^:/]*[:/]([^/]+\/[^/]+?)(?:\.git)?$/u,
    );
    if (!match) {
      return null;
    }

    return `https://github.com/${match[1]}`;
  } catch {
    return null;
  }
}

/**
 * Resolve the GitHub blob base URL used for per-line source links.
 *
 * Prefers the documented commit SHA when one is available so the links point
 * at the exact revision the docs were generated from; falls back to the
 * default branch otherwise.
 *
 * @param projectPath - Absolute path to the project root.
 * @param commitSha - Optional commit SHA to use as the ref. When null, the
 * default branch is used instead.
 * @returns A base URL like "https://github.com/Owner/Repo/blob/<ref>/" or null.
 */
async function resolveRepoBaseUrl(
  projectPath: string,
  commitSha: string | null,
): Promise<string | null> {
  const repoUrl = await resolveRepoUrl(projectPath);
  if (!repoUrl) {
    return null;
  }
  const ref = commitSha ?? (await resolveDefaultBranch(projectPath));
  return `${repoUrl}/blob/${ref}/`;
}

/**
 * Discover which configured source locations actually exist on disk.
 *
 * @param projectPath - The project root path.
 * @param scanDirs - User-configured scan directories relative to projectPath.
 * @returns A ScanSources object describing the locations to scan.
 */
async function discoverScanSources(
  projectPath: string,
  scanDirs: string[],
): Promise<ScanSources> {
  const existingScanDirs: string[] = [];
  for (const dir of scanDirs) {
    if (await directoryExists(path.join(projectPath, dir))) {
      existingScanDirs.push(dir);
    }
  }

  const packagesDir = path.join(projectPath, 'packages');
  const nodeModulesDir = path.join(projectPath, 'node_modules', '@metamask');

  return {
    scanDirs: existingScanDirs,
    packagesDir: (await directoryExists(packagesDir)) ? packagesDir : null,
    nodeModulesDir: (await directoryExists(nodeModulesDir))
      ? nodeModulesDir
      : null,
  };
}

/**
 * Log a human-readable description of which source locations will be scanned.
 *
 * @param sources - The resolved scan sources.
 */
function logScanPlan(sources: ScanSources): void {
  const summary: string[] = [];
  for (const dir of sources.scanDirs) {
    summary.push(`${dir}/ (.ts)`);
  }
  if (sources.packagesDir) {
    summary.push('packages/*/src (.ts)');
  }
  if (sources.nodeModulesDir) {
    summary.push('node_modules/@metamask/*/dist (.d.cts)');
  }
  console.log(
    `Scanning ${summary.join(', ')} for Messenger action/event types...`,
  );
}

/**
 * Patterns excluded when scanning TypeScript sources: build output, tests, and
 * declaration files (which are only read under `node_modules/@metamask`, via
 * the separate set below).
 *
 * Every pattern is anchored to `root` rather than written as a bare
 * `!**‍/*.test.ts`. A matcher resolves an unanchored negation against the
 * process's working directory, not against the pattern it accompanies, so an
 * unanchored exclusion silently stops excluding anything the moment the scanned
 * path falls outside the working directory — which is the normal case, since
 * this runs from wherever the consumer invoked it.
 *
 * `contentRoot` must be the directory the matched *files* live under, not an
 * ancestor of it. Anchoring at `packages/` rather than `packages/*‍/src` would
 * make the first path segment a package name, so a workspace package called
 * `test` or `dist` would match `test/**` and be dropped whole.
 *
 * @param contentRoot - Resolved directory, or directory glob, that the matched
 * files live directly under.
 * @returns The exclusion patterns.
 */
function buildTsSourceExclusions(contentRoot: string): string[] {
  return [
    'node_modules/**',
    'dist/**',
    '__tests__/**',
    'tests/**',
    'test/**',
    '__mocks__/**',
    '*.test.ts',
    '*.test-d.ts',
    '*.spec.ts',
    '*.d.ts',
  ].map((pattern) => `!${contentRoot}/**/${pattern}`);
}

/**
 * Add every file matching a set of glob patterns to the project, in a stable
 * order.
 *
 * ts-morph promises nothing about the order it returns matches in, and
 * deduplication downstream keeps the first of two equally-scored items, so an
 * unsorted list would let the filesystem decide which source link a capability
 * gets.
 *
 * Ordering is by code unit rather than `localeCompare`, which collates
 * differently depending on the locale the process happens to run under.
 *
 * @param project - The shared ts-morph project.
 * @param patterns - Glob patterns to match, including `!` exclusions.
 * @returns The added source files, sorted by path.
 */
function addSourceFiles(
  project: Project,
  patterns: string[],
): ReturnType<Project['addSourceFilesAtPaths']> {
  return project.addSourceFilesAtPaths(patterns).sort(
    (fileA, fileB) =>
      // Subtracting the two comparisons keeps this branchless, so it reads
      // the same whichever order the matcher happened to return.
      Number(fileA.getFilePath() > fileB.getFilePath()) -
      Number(fileA.getFilePath() < fileB.getFilePath()),
  );
}

/**
 * Build a glob pattern from a directory path.
 *
 * Two things have to be true of the result. Glob syntax is always
 * forward-slashed, including on Windows, where `path.join` would produce
 * backslashes that a matcher reads as escapes. And the path must be fully
 * resolved: the matcher does not follow a symlinked *ancestor* of the pattern,
 * so a project under `/tmp` or `/var` on macOS (both symlinks) would match
 * nothing at all.
 *
 * @param segments - Path segments to join.
 * @returns The joined, resolved path with forward slashes.
 */
async function toGlobPath(...segments: string[]): Promise<string> {
  // Safe to resolve without a fallback: `discoverScanSources` has already
  // confirmed every directory reaching this point exists.
  const resolved = await fs.realpath(path.join(...segments));
  return resolved.replace(/\\/gu, '/');
}

/**
 * Scan every source location described by `sources` (scan directories first,
 * then workspace packages, then published declaration files) and return all
 * extracted messenger items.
 *
 * A single ts-morph Project is shared across every file so the type checker can
 * resolve cross-file references (e.g. a `*Messenger` declaration in one file
 * walking through an imported umbrella union into an auto-generated
 * `*-method-action-types.ts` sibling).
 *
 * @param projectPath - The project root path.
 * @param sources - The set of source locations to scan.
 * @returns A flat list of all extracted messenger items.
 */
async function scanSources(
  projectPath: string,
  sources: ScanSources,
): Promise<MessengerCapabilityPacket[]> {
  const project = createProject();
  const patterns: string[] = [];

  for (const dir of sources.scanDirs) {
    const root = await toGlobPath(projectPath, dir);
    patterns.push(`${root}/**/*.ts`, ...buildTsSourceExclusions(root));
  }

  if (sources.packagesDir) {
    const root = await toGlobPath(sources.packagesDir);
    // Anchored at each package's `src`, not at `packages` itself, so a package
    // whose name collides with an exclusion (`test`, `dist`) isn't dropped.
    const contentRoot = `${root}/*/src`;
    patterns.push(
      `${contentRoot}/**/*.ts`,
      ...buildTsSourceExclusions(contentRoot),
    );
  }

  if (sources.nodeModulesDir) {
    const root = await toGlobPath(sources.nodeModulesDir);
    patterns.push(`${root}/*/dist/**/*.d.cts`);
  }

  const sourceFiles = addSourceFiles(project, patterns);

  // Matched paths are fully resolved, so the root they are made relative to
  // has to be resolved the same way or every source link becomes a `../..`
  // walk out of the project.
  const resolvedProjectPath = await fs.realpath(projectPath);

  const allItems: MessengerCapabilityPacket[] = [];
  for (const sourceFile of sourceFiles) {
    allItems.push(...extractFromSourceFile(sourceFile, resolvedProjectPath));
  }
  return allItems;
}

/**
 * Replace a previously-seen item in its existing namespace group with a
 * higher-scoring duplicate. Handles the case where the duplicate is a
 * different kind (action vs event) by moving it between lists.
 *
 * @param byNamespace - Map of namespace to its group.
 * @param previous - The previously stored item.
 * @param replacement - The new item to replace it with.
 */
function replaceDuplicateInGroup(
  byNamespace: Map<string, NamespaceGroup>,
  previous: MessengerCapabilityPacket,
  replacement: MessengerCapabilityPacket,
): void {
  const namespace = replacement.typeString.split(':')[0];
  const group = byNamespace.get(namespace);
  // istanbul ignore next: `previous` and `replacement` have the same
  // typeString, so they share a namespace, and we always insert the
  // namespace into `byNamespace` before recording the original entry.
  if (!group) {
    return;
  }
  const previousList =
    previous.kind === 'action' ? group.actions : group.events;
  const index = previousList.indexOf(previous);
  // istanbul ignore next: `previous` was added to its kind's list by
  // `groupByNamespace` before being recorded in `seen`, so it is always
  // present when we look it up here.
  if (index === -1) {
    return;
  }
  if (previous.kind === replacement.kind) {
    previousList[index] = replacement;
  } else {
    previousList.splice(index, 1);
    const newList =
      replacement.kind === 'action' ? group.actions : group.events;
    newList.push(replacement);
  }
}

/**
 * Group items by namespace, deduplicating duplicate typeStrings using
 * `deduplicationScore`. Returns groups sorted alphabetically by namespace,
 * with each group's items sorted alphabetically by typeString.
 *
 * @param items - The full list of extracted items.
 * @returns The deduplicated and sorted namespace groups.
 */
function groupByNamespace(
  items: MessengerCapabilityPacket[],
): NamespaceGroup[] {
  const byNamespace = new Map<string, NamespaceGroup>();
  const seen = new Map<string, MessengerCapabilityPacket>();

  for (const item of items) {
    const existing = seen.get(item.typeString);
    if (existing) {
      if (deduplicationScore(item) <= deduplicationScore(existing)) {
        continue;
      }
      replaceDuplicateInGroup(byNamespace, existing, item);
      seen.set(item.typeString, item);
      continue;
    }

    seen.set(item.typeString, item);
    const namespace = item.typeString.split(':')[0];
    let group = byNamespace.get(namespace);
    if (!group) {
      group = { namespace, actions: [], events: [] };
      byNamespace.set(namespace, group);
    }
    if (item.kind === 'action') {
      group.actions.push(item);
    } else {
      group.events.push(item);
    }
  }

  const namespaces = Array.from(byNamespace.values()).sort((a, b) =>
    a.namespace.localeCompare(b.namespace),
  );

  for (const ns of namespaces) {
    ns.actions.sort((a, b) => a.typeString.localeCompare(b.typeString));
    ns.events.sort((a, b) => a.typeString.localeCompare(b.typeString));
  }

  return namespaces;
}

/**
 * Write generated docs (namespace pages, index page, sidebars) to disk,
 * replacing any existing `docs/` directory.
 *
 * @param namespaces - The grouped namespaces to render.
 * @param outputDir - The root output directory.
 * @param repoBaseUrl - GitHub blob base URL for source links, or null.
 * @param indexOptions - Options stamped on the index page header.
 * @param indexOptions.projectLabel - Short label identifying the project.
 * @param indexOptions.commitSha - Git commit SHA the docs were generated from.
 * @returns Promise that resolves once all files are written.
 */
async function writeOutput(
  namespaces: NamespaceGroup[],
  outputDir: string,
  repoBaseUrl: string | null,
  indexOptions: {
    projectLabel?: string | null;
    commitSha?: string | null;
  },
): Promise<void> {
  const docsDir = path.join(outputDir, 'docs');

  if (await directoryExists(docsDir)) {
    await fs.rm(docsDir, { recursive: true });
  }
  await fs.mkdir(docsDir, { recursive: true });

  for (const ns of namespaces) {
    const nsDir = path.join(docsDir, ns.namespace);
    await fs.mkdir(nsDir, { recursive: true });

    if (ns.actions.length > 0) {
      await fs.writeFile(
        path.join(nsDir, 'actions.md'),
        generateNamespacePage(ns, 'action', repoBaseUrl),
      );
    }

    if (ns.events.length > 0) {
      await fs.writeFile(
        path.join(nsDir, 'events.md'),
        generateNamespacePage(ns, 'event', repoBaseUrl),
      );
    }
  }

  await fs.writeFile(
    path.join(docsDir, 'index.md'),
    generateIndexPage(namespaces, indexOptions),
  );

  await fs.writeFile(
    path.join(outputDir, 'sidebars.ts'),
    generateSidebars(namespaces),
  );
}

/**
 * Collect capabilities by scanning the project's files.
 *
 * @param projectPath - The project root path.
 * @param scanDirs - Directories (relative to projectPath) to scan.
 * @returns The extracted capabilities.
 * @throws If the project has no scannable directories at all.
 */
async function collectByScanning(
  projectPath: string,
  scanDirs: string[],
): Promise<MessengerCapabilityPacket[]> {
  const sources = await discoverScanSources(projectPath, scanDirs);

  if (
    sources.scanDirs.length === 0 &&
    !sources.packagesDir &&
    !sources.nodeModulesDir
  ) {
    throw new Error(
      `No scannable directories found in ${projectPath}. ` +
        `Looked for: ${scanDirs.join(', ')}, packages/, node_modules/@metamask/`,
    );
  }

  logScanPlan(sources);

  return await scanSources(projectPath, sources);
}

/**
 * Using the project's root messenger capability collection types as
 * entrypoints, collect the constituent individual capability types and package
 * them so that they can be displayed within the documentation site.
 *
 * @param projectPath - The project root path.
 * @param options - The root-messenger strategy options.
 * @returns The extracted capabilities.
 */
function collectFromRootMessengerCapabilities(
  projectPath: string,
  options: RootMessengerStrategyOptions,
): MessengerCapabilityPacket[] {
  const { rootActions, rootEvents } = options;

  console.log(
    `Resolving actions from ${rootActions.filePath}#${rootActions.typeName} ` +
      `and events from ${rootEvents.filePath}#${rootEvents.typeName}...`,
  );

  const { capabilityPackets, skippedCapabilities } =
    discoverFromRootMessengerCapabilitiesTypes({
      projectPath,
      rootActionsTypeReference: rootActions,
      rootEventsTypeReference: rootEvents,
    });

  // Report rather than drop silently: a jump in any of these usually means the
  // project changed how it declares its capabilities.
  warnSkipped(
    'declared inline, with no name to document',
    skippedCapabilities.unnamedCapabilities,
  );
  warnSkipped(
    'whose shape could not be read',
    skippedCapabilities.unextractableCapabilities,
  );

  // If both capability collection types resolve to nothing, it's always a
  // misconfiguration (a wrong type name, or imports that didn't resolve).
  // Failing here matters because generation would otherwise replace an existing
  // docs directory with an empty one and exit successfully.
  if (capabilityPackets.length === 0) {
    throw new Error(
      `No messenger actions or events found in ` +
        `${rootActions.filePath}#${rootActions.typeName} or ` +
        `${rootEvents.filePath}#${rootEvents.typeName}. ` +
        `Check that these types name the collections carrying every ` +
        `capability, and that their imports resolve.`,
    );
  }

  return capabilityPackets;
}

/**
 * Warn about capability types that couldn't be documented, naming them so the
 * warning is actionable.
 *
 * @param description - Why they were skipped, as a noun phrase.
 * @param labels - Labels identifying each skipped type.
 */
function warnSkipped(description: string, labels: string[]): void {
  if (labels.length === 0) {
    return;
  }

  const shown = labels.slice(0, MAX_SKIPPED_SHOWN);
  const remaining = labels.length - shown.length;
  console.warn(
    `Warning: skipped ${labels.length} capability ` +
      `${labels.length === 1 ? 'type' : 'types'} ${description}: ` +
      `${shown.join(', ')}${remaining > 0 ? `, and ${remaining} more` : ''}`,
  );
}

/**
 * Scan a project for messenger action/event types and generate documentation.
 *
 * @param options - Generation options.
 * @returns A promise resolving to counts of generated namespaces, actions, and events.
 */
export async function generate(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { projectPath, outputDir, projectLabel, commitSha } = options;

  const allItems =
    options.strategy === 'root-messenger'
      ? collectFromRootMessengerCapabilities(projectPath, options)
      : await collectByScanning(projectPath, options.scanDirs);

  console.log(
    `Found ${allItems.length} messenger ${allItems.length === 1 ? 'item' : 'items'} total.`,
  );

  const namespaces = groupByNamespace(allItems);
  const repoBaseUrl = await resolveRepoBaseUrl(projectPath, commitSha ?? null);

  await writeOutput(namespaces, outputDir, repoBaseUrl, {
    projectLabel,
    commitSha,
  });

  const totalActions = namespaces.reduce(
    (sum, ns) => sum + ns.actions.length,
    0,
  );
  const totalEvents = namespaces.reduce((sum, ns) => sum + ns.events.length, 0);

  console.log(
    `Generated docs for ${namespaces.length} ${namespaces.length === 1 ? 'namespace' : 'namespaces'}.`,
  );
  console.log(`  Actions: ${totalActions}`);
  console.log(`  Events: ${totalEvents}`);
  console.log(`Output: ${path.join(outputDir, 'docs')}/`);

  return {
    namespaces: namespaces.length,
    actions: totalActions,
    events: totalEvents,
  };
}
