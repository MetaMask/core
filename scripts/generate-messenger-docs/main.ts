/* eslint-disable n/no-sync */

import * as fs from 'fs';
import * as path from 'path';

import { findDtsFiles, findTsFiles } from './discovery';
import { extractFromFile } from './extraction';
import {
  generateIndexPage,
  generateNamespacePage,
  generateSidebars,
} from './markdown';
import type { MessengerItemDoc, NamespaceGroup } from './types';

const ROOT = path.resolve(__dirname, '../..');

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
  const homeScore = item.sourceFile.includes(namespacePrefix) ? 1 : 0;
  return jsDocScore + homeScore;
}

/**
 * Main entry point: scans packages, extracts messenger types, and generates docs.
 */
export function main(): void {
  // Parse --client flag
  const clientIdx = process.argv.indexOf('--client');
  const clientPath = clientIdx === -1 ? undefined : process.argv[clientIdx + 1];
  const clientMode = Boolean(clientPath);
  const clientName = clientPath ? path.basename(clientPath) : undefined;

  const allItems: MessengerItemDoc[] = [];

  if (clientMode) {
    console.log(
      `Scanning ${clientName} dependencies for Messenger action/event types...`,
    );

    const nmDir = path.join(clientPath as string, 'node_modules', '@metamask');
    if (!fs.existsSync(nmDir)) {
      throw new Error(`${nmDir} does not exist.`);
    }

    // Find @metamask packages that contain "controller" or "service" in name
    const pkgDirs = fs
      .readdirSync(nmDir, { withFileTypes: true })
      .filter(
        (dirent) =>
          dirent.isDirectory() &&
          (dirent.name.includes('controller') ||
            dirent.name.includes('service')),
      )
      .map((dirent) => path.join(nmDir, dirent.name, 'dist'));

    for (const distDir of pkgDirs) {
      if (!fs.existsSync(distDir)) {
        continue;
      }

      const dtsFiles = findDtsFiles(distDir);
      for (const file of dtsFiles) {
        try {
          const items = extractFromFile(file, clientPath as string);
          allItems.push(...items);
        } catch (error) {
          console.warn(
            `Warning: failed to parse ${path.relative(clientPath as string, file)}: ${String(error)}`,
          );
        }
      }
    }
  } else {
    console.log('Scanning packages for Messenger action/event types...');

    const packagesDir = path.join(ROOT, 'packages');
    const packageDirs = fs
      .readdirSync(packagesDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => path.join(packagesDir, dirent.name, 'src'));

    for (const srcDir of packageDirs) {
      if (!fs.existsSync(srcDir)) {
        continue;
      }

      const tsFiles = findTsFiles(srcDir);
      for (const file of tsFiles) {
        try {
          const items = extractFromFile(file, ROOT);
          allItems.push(...items);
        } catch (error) {
          console.warn(
            `Warning: failed to parse ${path.relative(ROOT, file)}: ${String(error)}`,
          );
        }
      }
    }
  }

  console.log(`Found ${allItems.length} messenger items total.`);

  // Group by namespace (part before the colon), deduplicating by typeString.
  // When duplicates exist, prefer the one with JSDoc, or from the package
  // whose name matches the namespace.
  const byNamespace = new Map<string, NamespaceGroup>();
  const seen = new Map<string, MessengerItemDoc>(); // key: typeString

  for (const item of allItems) {
    const existing = seen.get(item.typeString);
    if (existing) {
      // Prefer item with JSDoc, or from the "home" package
      const existingScore = deduplicationScore(existing);
      const newScore = deduplicationScore(item);
      if (newScore <= existingScore) {
        continue;
      }
      // Replace existing with better item
      const ns = item.typeString.split(':')[0];
      const group = byNamespace.get(ns);
      if (group) {
        const list = item.kind === 'action' ? group.actions : group.events;
        const idx = list.indexOf(existing);
        if (idx !== -1) {
          list[idx] = item;
        }
      }
      seen.set(item.typeString, item);
      continue;
    }

    seen.set(item.typeString, item);
    const ns = item.typeString.split(':')[0];
    if (!byNamespace.has(ns)) {
      byNamespace.set(ns, { namespace: ns, actions: [], events: [] });
    }
    const group = byNamespace.get(ns);
    if (group) {
      if (item.kind === 'action') {
        group.actions.push(item);
      } else {
        group.events.push(item);
      }
    }
  }

  // Sort namespaces alphabetically, sort items within each namespace
  const namespaces = Array.from(byNamespace.values()).sort((a, b) =>
    a.namespace.localeCompare(b.namespace),
  );

  for (const ns of namespaces) {
    ns.actions.sort((a, b) => a.typeString.localeCompare(b.typeString));
    ns.events.sort((a, b) => a.typeString.localeCompare(b.typeString));
  }

  // Write output
  const docsDir = path.join(ROOT, 'docs-site', 'docs');

  // Clean existing generated docs
  if (fs.existsSync(docsDir)) {
    fs.rmSync(docsDir, { recursive: true });
  }
  fs.mkdirSync(docsDir, { recursive: true });

  // Generate namespace pages
  for (const ns of namespaces) {
    const nsDir = path.join(docsDir, ns.namespace);
    fs.mkdirSync(nsDir, { recursive: true });

    if (ns.actions.length > 0) {
      fs.writeFileSync(
        path.join(nsDir, 'actions.md'),
        generateNamespacePage(ns, 'action', clientMode),
      );
    }

    if (ns.events.length > 0) {
      fs.writeFileSync(
        path.join(nsDir, 'events.md'),
        generateNamespacePage(ns, 'event', clientMode),
      );
    }
  }

  // Generate index page
  fs.writeFileSync(
    path.join(docsDir, 'index.md'),
    generateIndexPage(namespaces, clientName),
  );

  // Generate sidebars
  fs.writeFileSync(
    path.join(ROOT, 'docs-site', 'sidebars.ts'),
    generateSidebars(namespaces),
  );

  console.log(`Generated docs for ${namespaces.length} namespaces.`);
  console.log(
    `  Actions: ${namespaces.reduce((sum, ns) => sum + ns.actions.length, 0)}`,
  );
  console.log(
    `  Events: ${namespaces.reduce((sum, ns) => sum + ns.events.length, 0)}`,
  );
  console.log(`Output: ${path.relative(ROOT, docsDir)}/`);
}
