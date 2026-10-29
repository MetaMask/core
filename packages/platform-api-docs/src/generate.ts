import { directoryExists } from '@metamask/node-utils';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import {
  generateIndexPage,
  generateNamespacePage,
  generateSidebars,
} from './markdown.js';
import type { RootMessengerStrategyOptions } from './strategies/root-messenger.js';
import { collectFromRootMessengerCapabilities } from './strategies/root-messenger.js';
import type { ScanStrategyOptions } from './strategies/scan.js';
import { collectByScanning } from './strategies/scan.js';
import type { MessengerCapabilityPacket, NamespaceGroup } from './types.js';

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
