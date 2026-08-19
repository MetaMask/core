import * as path from 'node:path';
import type {
  InterfaceDeclaration,
  Project as TsMorphProject,
  Type,
  TypeAliasDeclaration,
} from 'ts-morph';
import { Node as NodeGuards, Project, ts } from 'ts-morph';

import {
  classifyMessengerCapabilityTypeDeclaration,
  extractFromMessengerCapabilityTypeDeclaration,
} from './extraction.js';
import type { MessengerCapabilityPacket } from './types.js';

// ---------------------------------------------------------------------------
// The `root-messenger` strategy: resolve the unions a project declares for its
// root messenger and let the type checker enumerate them. Going through the
// checker rather than the AST means a union works whether it is written by
// hand or computed (e.g. derived from a registry via `ReturnType<...>`). Each
// capability it reports is handed to the shared extractor in `extraction.ts`,
// so the output matches what the `scan` strategy produces.
// ---------------------------------------------------------------------------

/**
 * A reference to a type in a file, written as `<file>#<TypeName>`.
 */
export type RootTypeReference = {
  /** Path to the declaring file, relative to the project root. */
  filePath: string;
  /** Name of the type alias within that file. */
  typeName: string;
};

/**
 * Options for {@link discoverFromRootMessenger}.
 */
type RootMessengerDiscoveryOptions = {
  /** Absolute path to the project to scan. */
  projectPath: string;
  /** Type aliasing the union of every action on the root messenger. */
  actions: RootTypeReference;
  /** Type aliasing the union of every event on the root messenger. */
  events: RootTypeReference;
};

/**
 * Labels for capability types that were found but couldn't be documented,
 * grouped by why. Labels rather than counts, so warnings can name what to fix.
 */
type SkippedCapabilities = {
  /** Declared inline in the union, so there is no name or JSDoc to document. */
  unnamed: string[];
  /** Named, but of a shape the extractor rejects. */
  unextractable: string[];
};

/**
 * The result of {@link discoverFromRootMessenger}.
 */
type RootMessengerDiscoveryResult = {
  /** Every capability extracted, actions before events. */
  packets: MessengerCapabilityPacket[];
  /** Capabilities that couldn't be documented. */
  skipped: SkippedCapabilities;
};

/**
 * Split a `<file>#<TypeName>` reference into its parts, on the last `#` so
 * that paths containing a `#` still work.
 *
 * @param reference - The raw reference, e.g. `src/messenger.ts#RootActions`.
 * @returns The parsed reference.
 * @throws If the reference has no `#`, or either side of it is empty.
 */
export function parseRootTypeReference(reference: string): RootTypeReference {
  const separatorIndex = reference.lastIndexOf('#');
  if (separatorIndex === -1) {
    throw new Error(
      `Expected a reference of the form "<file>#<TypeName>", got "${reference}".`,
    );
  }

  const filePath = reference.slice(0, separatorIndex);
  const typeName = reference.slice(separatorIndex + 1);
  if (filePath.length === 0 || typeName.length === 0) {
    throw new Error(
      `Expected a reference of the form "<file>#<TypeName>", got "${reference}".`,
    );
  }

  return { filePath, typeName };
}

/**
 * Create a ts-morph Project for resolving root messenger types.
 *
 * No file list is loaded: this strategy opens only the entry files and lets
 * the checker pull in the rest.
 *
 * @returns A new ts-morph Project.
 */
function createRootMessengerProject(): TsMorphProject {
  return new Project({
    compilerOptions: {
      noEmit: true,
      // We need symbol resolution, not full typechecking, so a project's own
      // strictness settings shouldn't be able to fail the docs build.
      strict: false,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
  });
}

/**
 * Resolve the type alias a reference names.
 *
 * @param project - The ts-morph project to load the file into.
 * @param projectPath - Absolute path to the project root.
 * @param reference - The reference to resolve.
 * @param flagName - The CLI flag the reference came from, used in errors.
 * @returns The type alias declaration.
 * @throws If the file can't be read or declares no such type alias.
 */
function resolveRootDeclaration(
  project: TsMorphProject,
  projectPath: string,
  reference: RootTypeReference,
  flagName: string,
): TypeAliasDeclaration {
  const absolutePath = path.resolve(projectPath, reference.filePath);

  let sourceFile;
  try {
    sourceFile =
      project.getSourceFile(absolutePath) ??
      project.addSourceFileAtPath(absolutePath);
  } catch {
    throw new Error(
      `Could not read ${absolutePath}, which was named by ${flagName}.`,
    );
  }

  const declaration = sourceFile.getTypeAlias(reference.typeName);
  if (!declaration) {
    throw new Error(
      `No type alias named "${reference.typeName}" in ${reference.filePath}, which was named by ${flagName}.`,
    );
  }

  return declaration;
}

/**
 * Find the named declaration behind a union constituent.
 *
 * @param constituent - The resolved constituent type.
 * @param rootDeclaration - The root union's own declaration.
 * @param isLoneConstituent - Whether this is the root's only constituent.
 * @returns The declaration, or undefined when the constituent is anonymous.
 */
function findCapabilityDeclaration(
  constituent: Type,
  rootDeclaration: TypeAliasDeclaration,
  isLoneConstituent: boolean,
): TypeAliasDeclaration | InterfaceDeclaration | undefined {
  // Prefer the alias symbol: for a type alias it carries the name and JSDoc,
  // where the plain symbol points at the anonymous object type. Skip an alias
  // resolving back to the root union itself, which is what the checker reports
  // for a lone generic instantiation such as `type Actions = Foo<Bar>`.
  const aliasDeclarations = (
    constituent.getAliasSymbol()?.getDeclarations() ?? []
  ).filter((node) => node !== rootDeclaration);

  // An interface has no alias symbol, being its own declaration.
  const declarations =
    aliasDeclarations.length > 0
      ? aliasDeclarations
      : (constituent.getSymbol()?.getDeclarations() ?? []);

  const found = declarations.find(
    (node): node is TypeAliasDeclaration | InterfaceDeclaration =>
      NodeGuards.isTypeAliasDeclaration(node) ||
      NodeGuards.isInterfaceDeclaration(node),
  );
  if (found) {
    return found;
  }

  // Nothing named behind the type itself. When the root aliases a single
  // generic instantiation, the declaration we want is the one its type node
  // references — `Foo` in `type Actions = Foo<Bar>`. Only when it is the lone
  // constituent, though: in a union, an anonymous member is genuinely
  // anonymous, and attributing it to the wrapper would mislabel it.
  return isLoneConstituent
    ? findDeclarationFromRootTypeNode(rootDeclaration)
    : undefined;
}

/**
 * Resolve the declaration referenced by a root alias's type node.
 *
 * @param rootDeclaration - The root union's own declaration.
 * @returns The referenced declaration, or undefined.
 */
function findDeclarationFromRootTypeNode(
  rootDeclaration: TypeAliasDeclaration,
): TypeAliasDeclaration | InterfaceDeclaration | undefined {
  const typeNode = rootDeclaration.getTypeNode();
  if (!typeNode || !NodeGuards.isTypeReference(typeNode)) {
    return undefined;
  }

  const localSymbol = typeNode.getTypeName().getSymbol();
  const symbol = localSymbol?.getAliasedSymbol() ?? localSymbol;
  return symbol
    ?.getDeclarations()
    .find(
      (node): node is TypeAliasDeclaration | InterfaceDeclaration =>
        NodeGuards.isTypeAliasDeclaration(node) ||
        NodeGuards.isInterfaceDeclaration(node),
    );
}

/**
 * Render a short, single-line label for an anonymous type.
 *
 * @param type - The type to describe.
 * @param enclosingNode - Node to render the type relative to, so an aliased
 * type reads as its name rather than `import("<absolute path>").Name`.
 * @returns The label.
 */
function summarizeType(type: Type, enclosingNode: TypeAliasDeclaration): string {
  const text = type.getText(enclosingNode).replace(/\s+/gu, ' ');
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/**
 * Extract every documentable capability from one root union.
 *
 * @param rootDeclaration - The root union's declaration.
 * @param kind - Whether these are actions or events.
 * @param projectPath - Absolute path to the project root.
 * @param skipped - Labels collected as undocumentable constituents are found.
 * @param reference - The reference that named this type, used in errors.
 * @param flagName - The CLI flag the reference came from, used in errors.
 * @returns The extracted capabilities.
 * @throws If the union resolved to `any` or `unknown`.
 */
function extractFromRootType(
  rootDeclaration: TypeAliasDeclaration,
  kind: 'action' | 'event',
  projectPath: string,
  skipped: SkippedCapabilities,
  reference: RootTypeReference,
  flagName: string,
): MessengerCapabilityPacket[] {
  const rootType = rootDeclaration.getTypeNodeOrThrow().getType();

  // TypeScript absorbs `any | T` into `any` and `unknown | T` into `unknown`,
  // so a single member the checker can't resolve — typically a failed import —
  // erases every other capability in the union. Fail instead of emitting a
  // catalog that looks complete but silently isn't.
  if (rootType.isAny() || rootType.isUnknown()) {
    throw new Error(
      `${reference.filePath}#${reference.typeName}, named by ${flagName}, ` +
        `resolved to \`${rootType.getText()}\` rather than a union of ` +
        `capabilities. This usually means an import in that file could not be ` +
        `resolved; because TypeScript absorbs the rest of a union into ` +
        `\`any\`, every other capability in it would be missing.`,
    );
  }

  // A project with no capabilities of this kind aliases the union to `never`.
  if (rootType.isNever()) {
    return [];
  }

  const constituents = rootType.isUnion()
    ? rootType.getUnionTypes()
    : [rootType];
  const packets: MessengerCapabilityPacket[] = [];

  for (const constituent of constituents) {
    const declaration = findCapabilityDeclaration(
      constituent,
      rootDeclaration,
      constituents.length === 1,
    );
    if (!declaration) {
      skipped.unnamed.push(summarizeType(constituent, rootDeclaration));
      continue;
    }

    const classified = classifyMessengerCapabilityTypeDeclaration(
      declaration,
      kind,
    );
    const packet =
      classified &&
      extractFromMessengerCapabilityTypeDeclaration(classified, projectPath);
    if (!packet) {
      const sourceFile = declaration.getSourceFile().getFilePath();
      skipped.unextractable.push(
        `${declaration.getName()} (${path.relative(projectPath, sourceFile)}:${declaration.getStartLineNumber()})`,
      );
      continue;
    }

    packets.push(packet);
  }

  return packets;
}

/**
 * Enumerate every action and event reachable from a project's root messenger.
 *
 * @param options - Discovery options.
 * @returns The extracted capabilities plus anything skipped.
 */
export function discoverFromRootMessenger(
  options: RootMessengerDiscoveryOptions,
): RootMessengerDiscoveryResult {
  const { projectPath, actions, events } = options;
  const project = createRootMessengerProject();
  const skipped: SkippedCapabilities = { unnamed: [], unextractable: [] };
  const packets: MessengerCapabilityPacket[] = [];

  for (const [reference, kind, flagName] of [
    [actions, 'action', '--root-actions'],
    [events, 'event', '--root-events'],
  ] as const) {
    const rootDeclaration = resolveRootDeclaration(
      project,
      projectPath,
      reference,
      flagName,
    );
    packets.push(
      ...extractFromRootType(
        rootDeclaration,
        kind,
        projectPath,
        skipped,
        reference,
        flagName,
      ),
    );
  }

  return { packets, skipped };
}
