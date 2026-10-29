import { directoryExists } from '@metamask/node-utils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  Node as TsMorphNode,
  Project,
  SourceFile,
  TypeNode,
} from 'ts-morph';
import { Node as NodeGuards } from 'ts-morph';

import type { MessengerCapabilityTypeDeclaration } from '../capability-extraction.js';
import {
  classifyMessengerCapabilityTypeDeclaration,
  extractFromMessengerCapabilityTypeDeclaration,
} from '../capability-extraction.js';
import { createProject } from '../ts-project.js';
import type { MessengerCapabilityPacket } from '../types.js';

/**
 * Options for the `scan` strategy, which reads every `*Messenger` type alias
 * in every file it can find. Used when no single messenger aggregates every
 * capability.
 */
export type ScanStrategyOptions = {
  /** The selected strategy. */
  strategy: 'scan';
  /** Directories, relative to the project root, to scan. */
  scanDirs: string[];
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
  const sourceFiles = [];

  // NOTE: We are calling `addSourceFiles` for each kind of source instead of
  // calling it at the very end so that at each step we can make sure to exclude
  // `node_modules` and `dist`.
  for (const dir of sources.scanDirs) {
    const root = await toGlobPath(projectPath, dir);
    sourceFiles.push(
      ...addSourceFiles(project, [
        `${root}/**/*.ts`,
        ...buildTsSourceExclusions(root),
      ]),
    );
  }

  if (sources.packagesDir) {
    const root = await toGlobPath(sources.packagesDir);
    // Anchored at each package's `src`, not at `packages` itself, so a package
    // whose name collides with an exclusion (`test`, `dist`) isn't dropped.
    const contentRoot = `${root}/*/src`;
    sourceFiles.push(
      ...addSourceFiles(project, [
        `${contentRoot}/**/*.ts`,
        ...buildTsSourceExclusions(contentRoot),
      ]),
    );
  }

  if (sources.nodeModulesDir) {
    const root = await toGlobPath(sources.nodeModulesDir);
    sourceFiles.push(...addSourceFiles(project, [`${root}/*/dist/**/*.d.cts`]));
  }

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
 * Represents a type alias for a messenger. Only includes nodes representing the
 * `Actions` and `Events` type parameters.
 */
type ParsedMessengerTypeAlias = {
  actionsTypeParameter: TypeNode;
  eventsTypeParameter: TypeNode;
};

/**
 * Looks for Messenger types in the source file (that is, those that are type
 * aliases whose names end with "Messenger"), then extracts the `Actions` and
 * `Events` parameters from these types.
 *
 * @param sourceFile - The TypeScript source file to scan.
 * @returns A list of objects that represent messenger types.
 */
function findMessengerTypeAliases(
  sourceFile: SourceFile,
): ParsedMessengerTypeAlias[] {
  const parsedMessengerTypeAliases: ParsedMessengerTypeAlias[] = [];

  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (!typeAlias.getName().endsWith('Messenger')) {
      continue;
    }

    const body = typeAlias.getTypeNode();
    // Basic check
    if (!body || !NodeGuards.isTypeReference(body)) {
      continue;
    }

    const typeArgs = body.getTypeArguments();
    // Messenger types always have 3 type parameters
    // (e.g. `Messenger<'FooController', Actions, Events>`)
    if (typeArgs.length < 3) {
      continue;
    }

    parsedMessengerTypeAliases.push({
      actionsTypeParameter: typeArgs[1],
      eventsTypeParameter: typeArgs[2],
    });
  }

  return parsedMessengerTypeAliases;
}

/**
 * Walks the `Actions` and `Events` type parameters of the given messenger
 * types, extracted in a previous step, to find all type declarations (i.e.,
 * statements) that represent individual messenger actions or events.
 *
 * @param parsedMessengerTypeAliases - The list of objects representing
 * messenger types, parsed in a previous step.
 * @returns The list of type aliases that represent messenger capabilities among
 * the given messenger types.
 */
function findAllMessengerCapabilityTypeDeclarations(
  parsedMessengerTypeAliases: ParsedMessengerTypeAlias[],
): MessengerCapabilityTypeDeclaration[] {
  const allCapabilityTypeDeclarations: MessengerCapabilityTypeDeclaration[] =
    [];
  let allVisitedTypeDeclarations: Set<TsMorphNode> = new Set();

  for (const {
    actionsTypeParameter,
    eventsTypeParameter,
  } of parsedMessengerTypeAliases) {
    for (const [typeParameter, kind] of [
      [actionsTypeParameter, 'action'],
      [eventsTypeParameter, 'event'],
    ] as const) {
      const result = recursivelyFindMessengerCapabilityTypeDeclarations(
        typeParameter,
        kind,
        allVisitedTypeDeclarations,
      );
      allCapabilityTypeDeclarations.push(...result.capabilityTypeDeclarations);
      allVisitedTypeDeclarations = result.visitedTypeDeclarations;
    }
  }

  return allCapabilityTypeDeclarations;
}

/**
 * Recursively walks a `ts-morph` AST node — at first the `Actions` or `Events`
 * type parameter of a messenger type, and then a node within that parameter —
 * to find all type aliases that represent individual messenger actions or
 * events, no matter how deeply the type aliases exist in the tree or in which
 * file they are located.
 *
 * @param node - The `ts-morph` AST node to walk.
 * @param kind - Whether to tag found type aliases as 'action' or 'event'.
 * @param visitedTypeDeclarations - A variable that tracks visited type aliases
 * and prevents duplicates.
 * @returns The list of extracted messenger capability type aliases as well as
 * an updated version of `visitedTypeDeclarations`.
 */
function recursivelyFindMessengerCapabilityTypeDeclarations(
  node: TsMorphNode,
  kind: 'action' | 'event',
  visitedTypeDeclarations: Set<TsMorphNode>,
): {
  capabilityTypeDeclarations: MessengerCapabilityTypeDeclaration[];
  visitedTypeDeclarations: Set<TsMorphNode>;
} {
  const result: {
    capabilityTypeDeclarations: MessengerCapabilityTypeDeclaration[];
    visitedTypeDeclarations: Set<TsMorphNode>;
  } = {
    capabilityTypeDeclarations: [],
    visitedTypeDeclarations: new Set([...visitedTypeDeclarations]),
  };

  // If `node` is a union type, walk each type within it.
  // EXAMPLES:
  //   type Actions = FooControllerSomeAction | FooControllerSomeOtherAction
  //                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //   type FooControllerActions = FooControllerSomeAction | FooControllerSomeOtherAction
  //                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  if (NodeGuards.isUnionTypeNode(node)) {
    for (const typeNode of node.getTypeNodes()) {
      const innerResult = recursivelyFindMessengerCapabilityTypeDeclarations(
        typeNode,
        kind,
        result.visitedTypeDeclarations,
      );
      result.capabilityTypeDeclarations.push(
        ...innerResult.capabilityTypeDeclarations,
      );
      for (const typeDeclaration of innerResult.visitedTypeDeclarations) {
        result.visitedTypeDeclarations.add(typeDeclaration);
      }
    }
    return result;
  }

  // If `node` is not a type reference, don't walk it.
  // EXAMPLE:
  //   // Bad
  //   type Actions = { ... }
  //                  ^^^^^^^
  //   // Good
  //   type Actions = FooControllerSomeAction;
  //                  ^^^^^^^^^^^^^^^^^^^^^^^
  //   // Good
  //   type Actions = ControllerGetStateAction<...>;
  //                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  if (!NodeGuards.isTypeReference(node)) {
    return result;
  }

  const nameNode = node.getTypeName();

  // Reject qualified-name type names, as we need a plain identifier to
  // resolve the symbol.
  // EXAMPLE:
  //   import * as somePackage from '....js';
  //   type Actions = somePackage.FooControllerSomeAction;
  //                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  if (!NodeGuards.isIdentifier(nameNode)) {
    return result;
  }

  // Since we know we have a type reference, we can assume that we have a symbol.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const localSymbol = nameNode.getSymbol()!;
  // If we have a type imported from another file, ensure that when we access
  // the declaration, it's the type declaration in the other file, not the
  // import declaration in this file.
  // EXAMPLE:
  //   import { FooControllerSomeAction } from '@metamask/foo-controller';
  //   type Actions = FooControllerSomeAction;
  //                  ^^^^^^^^^^^^^^^^^^^^^^^
  const symbol = localSymbol.getAliasedSymbol() ?? localSymbol;

  // At this point, we have a type *reference*, but we need to find the type
  // *declaration*.
  // For instance, if we have `FooControllerSomeAction`, we need to find
  // the full `type FooControllerSomeAction = ...` statement.
  for (const declaration of symbol.getDeclarations()) {
    // Prevent duplicates
    if (result.visitedTypeDeclarations.has(declaration)) {
      continue;
    }
    result.visitedTypeDeclarations.add(declaration);

    // If we have a type alias, then we have to handle a few scenarios.
    // EXAMPLES:
    //   type FooControllerMethodActions = ...
    //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //   type FooControllerSomeAction = ...
    //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    if (NodeGuards.isTypeAliasDeclaration(declaration)) {
      const body = declaration.getTypeNode();

      // If the body is a union type or a plain type reference (not a utility
      // type), walk it.
      // EXAMPLES:
      //   type FooControllerMethodActions = FooControllerSomeAction | FooControllerSomeOtherAction
      //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      //   type DelegationControllerMethodActions = DelegationControllerSignDelegationAction
      //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      if (
        body &&
        (NodeGuards.isUnionTypeNode(body) ||
          (NodeGuards.isTypeReference(body) &&
            body.getTypeArguments().length === 0))
      ) {
        const innerResult = recursivelyFindMessengerCapabilityTypeDeclarations(
          body,
          kind,
          result.visitedTypeDeclarations,
        );
        result.capabilityTypeDeclarations.push(
          ...innerResult.capabilityTypeDeclarations,
        );
        for (const typeDeclaration of innerResult.visitedTypeDeclarations) {
          result.visitedTypeDeclarations.add(typeDeclaration);
        }
        continue;
      }

      // Everything else is a leaf capability type — a capability-type-
      // constructor invocation (e.g. `ControllerGetStateAction<typeof name,
      // State>`) or a literal object type. Tag it so the matching extractor
      // can read it without re-checking its shape.
      // EXAMPLES:
      //   type FooControllerSomeAction = ControllerGetStateAction<...>
      //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      //   type FooControllerSomeAction = { ... }
      //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      const classified = classifyMessengerCapabilityTypeDeclaration(
        declaration,
        kind,
      );
      if (classified) {
        result.capabilityTypeDeclarations.push(classified);
      }
    }

    // Interfaces always carry their members directly — tag for the literal
    // extractor.
    // EXAMPLE:
    //   interface FooControllerSomeAction { ... }
    //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    else if (NodeGuards.isInterfaceDeclaration(declaration)) {
      result.capabilityTypeDeclarations.push({
        bodyShape: 'object',
        kind,
        declaration,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Extract information (action/event type string, handler/payload arguments and
 * return type, etc.) about every messenger action or event type which is
 * reachable through all of a source file's `*Messenger` type declarations.
 *
 * The caller is responsible for ensuring `sourceFile` (plus any files it
 * imports from) belongs to a `ts-morph` Project so cross-file symbol resolution
 * works.
 *
 * @param sourceFile - The TypeScript source file to extract from.
 * @param projectPath - Project root, used for computing relative source paths.
 * @returns The extracted information about actions and events.
 */
export function extractFromSourceFile(
  sourceFile: SourceFile,
  projectPath: string,
): MessengerCapabilityPacket[] {
  const messengerTypeAliases = findMessengerTypeAliases(sourceFile);

  const capabilityTypeDeclarations =
    findAllMessengerCapabilityTypeDeclarations(messengerTypeAliases);

  const messengerCapabilityPackets: MessengerCapabilityPacket[] = [];
  for (const capabilityTypeDeclaration of capabilityTypeDeclarations) {
    const messengerCapabilityPacket =
      extractFromMessengerCapabilityTypeDeclaration(
        capabilityTypeDeclaration,
        projectPath,
      );
    if (messengerCapabilityPacket) {
      messengerCapabilityPackets.push(messengerCapabilityPacket);
    }
  }
  return messengerCapabilityPackets;
}

/**
 * Collect capabilities by scanning the project's files.
 *
 * @param projectPath - The project root path.
 * @param scanDirs - Directories (relative to projectPath) to scan.
 * @returns The extracted capabilities.
 * @throws If the project has no scannable directories at all.
 */
export async function collectByScanning(
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
