import { directoryExists } from '@metamask/utils/node';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { Project } from 'ts-morph';

import { findDtsFiles, findTsFiles } from './discovery';
import { createExtractionProject, extractFromSourceFile } from './extraction';
import {
  generateIndexPage,
  generateNamespacePage,
  generateSidebars,
} from './markdown';
import type { MessengerCapabilityPacket, NamespaceGroup } from './types';

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
  return jsDocScore + homeScore;
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
 * Options for the generate function.
 */
export type GenerateOptions = {
  /** Absolute path to the project to scan. */
  projectPath: string;
  /** Absolute path to the output directory for generated docs. */
  outputDir: string;
  /** Directories (relative to projectPath) to scan for .ts source files. */
  scanDirs: string[];
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
};

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
 * Run extraction against every file in a single directory, logging and
 * swallowing per-file failures. All files are added to the shared `project`
 * up front so the type checker can resolve cross-file references when the
 * walker descends into imported types.
 *
 * @param project - The shared ts-morph project.
 * @param directory - The directory to scan.
 * @param projectPath - The project root, used for relative path display.
 * @param findFiles - The function used to enumerate files in the directory.
 * @returns The list of extracted messenger items.
 */
async function extractFromDirectory(
  project: Project,
  directory: string,
  projectPath: string,
  findFiles: (dir: string) => Promise<string[]>,
): Promise<MessengerCapabilityPacket[]> {
  const items: MessengerCapabilityPacket[] = [];
  const files = await findFiles(directory);
  for (const file of files) {
    try {
      const sourceFile =
        project.getSourceFile(file) ?? project.addSourceFileAtPath(file);
      items.push(...extractFromSourceFile(sourceFile, projectPath));
    } catch (error) {
      console.warn(
        `Warning: failed to parse ${path.relative(projectPath, file)}`,
      );
      console.warn(error);
    }
  }
  return items;
}

/**
 * Enumerate the subdirectories of a parent directory that match the expected
 * layout (e.g., `packages/*‍/src` or `node_modules/@metamask/*‍/dist`), keeping
 * only those that actually exist.
 *
 * @param parentDir - The parent directory to enumerate.
 * @param subPath - The trailing path component appended to each entry.
 * @param includeSymlinks - Whether to include symbolic links (true for
 * node_modules where workspaces are symlinked).
 * @returns The list of absolute paths to existing target subdirectories.
 */
async function listTargetSubdirectories(
  parentDir: string,
  subPath: string,
  includeSymlinks: boolean,
): Promise<string[]> {
  const entries = await fs.readdir(parentDir, { withFileTypes: true });
  const candidates = entries
    .filter(
      (entry) =>
        entry.isDirectory() || (includeSymlinks && entry.isSymbolicLink()),
    )
    .map((entry) => path.join(parentDir, entry.name, subPath));

  const existing: string[] = [];
  for (const candidate of candidates) {
    if (await directoryExists(candidate)) {
      existing.push(candidate);
    }
  }
  return existing;
}

/**
 * Scan every source location described by `sources` and return all extracted
 * messenger items. A single ts-morph Project is shared across every file so
 * the type checker can resolve cross-file references (e.g. a `*Messenger`
 * declaration in one file walking through an imported umbrella union into
 * an auto-generated `*-method-action-types.ts` sibling).
 *
 * @param projectPath - The project root path.
 * @param sources - The set of source locations to scan.
 * @returns A flat list of all extracted messenger items.
 */
async function scanSources(
  projectPath: string,
  sources: ScanSources,
): Promise<MessengerCapabilityPacket[]> {
  const project = createExtractionProject();
  const allItems: MessengerCapabilityPacket[] = [];

  for (const dir of sources.scanDirs) {
    allItems.push(
      ...(await extractFromDirectory(
        project,
        path.join(projectPath, dir),
        projectPath,
        findTsFiles,
      )),
    );
  }

  if (sources.packagesDir) {
    const srcDirs = await listTargetSubdirectories(
      sources.packagesDir,
      'src',
      false,
    );
    for (const srcDir of srcDirs) {
      allItems.push(
        ...(await extractFromDirectory(
          project,
          srcDir,
          projectPath,
          findTsFiles,
        )),
      );
    }
  }

  if (sources.nodeModulesDir) {
    const distDirs = await listTargetSubdirectories(
      sources.nodeModulesDir,
      'dist',
      true,
    );
    for (const distDir of distDirs) {
      allItems.push(
        ...(await extractFromDirectory(
          project,
          distDir,
          projectPath,
          findDtsFiles,
        )),
      );
    }
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
 * Scan a project for messenger action/event types and generate documentation.
 *
 * @param options - Generation options.
 * @returns A promise resolving to counts of generated namespaces, actions, and events.
 */
export async function generate(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { projectPath, outputDir, scanDirs, projectLabel, commitSha } = options;

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

  const allItems = await scanSources(projectPath, sources);
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
