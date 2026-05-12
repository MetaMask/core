import { directoryExists } from '@metamask/utils/node';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { findDtsFiles, findTsFiles } from './discovery';
import { extractFromFile } from './extraction';
import {
  generateIndexPage,
  generateNamespacePage,
  generateSidebars,
} from './markdown';
import type { MessengerItemDoc, NamespaceGroup } from './types';

/**
 * Compute a deduplication score for a messenger item, preferring items with
 * JSDoc and from the "home" package whose name matches the namespace.
 *
 * @param item - The messenger item to score.
 * @returns A numeric score (higher is better).
 */
function deduplicationScore(item: MessengerItemDoc): number {
  const jsDocScore = item.jsDoc ? 2 : 0;
  const namespacePrefix = item.typeString
    .split(':')[0]
    .replace(/Controller|Service/u, '')
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
 * Resolve the GitHub blob base URL for a project by reading its git remote.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns A base URL like "https://github.com/Owner/Repo/blob/main/" or null.
 */
async function resolveRepoBaseUrl(projectPath: string): Promise<string | null> {
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

    return `https://github.com/${match[1]}/blob/main/`;
  } catch {
    return null;
  }
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
 * swallowing per-file failures.
 *
 * @param directory - The directory to scan.
 * @param projectPath - The project root, used for relative path display.
 * @param findFiles - The function used to enumerate files in the directory.
 * @returns The list of extracted messenger items.
 */
async function extractFromDirectory(
  directory: string,
  projectPath: string,
  findFiles: (dir: string) => Promise<string[]>,
): Promise<MessengerItemDoc[]> {
  const items: MessengerItemDoc[] = [];
  const files = await findFiles(directory);
  for (const file of files) {
    try {
      items.push(...(await extractFromFile(file, projectPath)));
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
 * messenger items.
 *
 * @param projectPath - The project root path.
 * @param sources - The set of source locations to scan.
 * @returns A flat list of all extracted messenger items.
 */
async function scanSources(
  projectPath: string,
  sources: ScanSources,
): Promise<MessengerItemDoc[]> {
  const allItems: MessengerItemDoc[] = [];

  for (const dir of sources.scanDirs) {
    allItems.push(
      ...(await extractFromDirectory(
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
        ...(await extractFromDirectory(srcDir, projectPath, findTsFiles)),
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
        ...(await extractFromDirectory(distDir, projectPath, findDtsFiles)),
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
  previous: MessengerItemDoc,
  replacement: MessengerItemDoc,
): void {
  const namespace = replacement.typeString.split(':')[0];
  const group = byNamespace.get(namespace);
  if (!group) {
    return;
  }
  const previousList =
    previous.kind === 'action' ? group.actions : group.events;
  const index = previousList.indexOf(previous);
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
function groupByNamespace(items: MessengerItemDoc[]): NamespaceGroup[] {
  const byNamespace = new Map<string, NamespaceGroup>();
  const seen = new Map<string, MessengerItemDoc>();

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
 * @returns Promise that resolves once all files are written.
 */
async function writeOutput(
  namespaces: NamespaceGroup[],
  outputDir: string,
  repoBaseUrl: string | null,
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
    generateIndexPage(namespaces),
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
  const { projectPath, outputDir, scanDirs } = options;

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
  const repoBaseUrl = await resolveRepoBaseUrl(projectPath);

  await writeOutput(namespaces, outputDir, repoBaseUrl);

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
