import * as path from 'node:path';
import type {
  InterfaceDeclaration,
  Project as TsMorphProject,
  Type,
  TypeAliasDeclaration,
} from 'ts-morph';
import { Node as NodeGuards } from 'ts-morph';

import {
  classifyMessengerCapabilityTypeDeclaration,
  extractFromMessengerCapabilityTypeDeclaration,
} from './extraction.js';
import { createProject } from './ts-project.js';
import type { MessengerCapabilityPacket } from './types.js';

// ---------------------------------------------------------------------------
// The `root-messenger` strategy: resolve the types a project declares for its
// collection of root messenger actions and events and let TypeScript walk them.
// Each capability type found is handed to the shared extractor in
// `extraction.ts`, so the output matches what the `scan` strategy produces.
// ---------------------------------------------------------------------------

/**
 * A reference to a type declared in a file, written as `<file>#<TypeName>`.
 *
 * The `root-messenger` strategy takes two of these on the command line — one
 * naming a collection of messenger action types, one naming a collection of
 * messenger event types  — and uses them to locate the type declarations to
 * enumerate.
 */
export type RootCapabilitiesTypeReference = {
  /** Path to the declaring file, relative to the project root. */
  filePath: string;
  /** Name of the type alias within that file. */
  typeName: string;
};

/**
 * Labels for capability types that were found but couldn't be documented,
 * grouped by why. Labels rather than counts, so warnings can name what to fix.
 */
type SkippedCapabilities = {
  /**
   * Capabilities declared inline in the capability collection type, so there is
   * no name or JSDoc to document.
   */
  unnamedCapabilities: string[];
  /*
   * Capabilities that are named, but of a shape the extractor rejects.
   */
  unextractableCapabilities: string[];
};

/**
 * Split a `<file>#<TypeName>` reference into its parts, on the last `#` so
 * that paths containing a `#` still work.
 *
 * @param reference - The raw reference, e.g. `src/messenger.ts#RootActions`.
 * @returns The parsed reference.
 * @throws If the reference has no `#`, or either side of it is empty.
 */
export function parseRootCapabilitiesTypeReference(
  reference: string,
): RootCapabilitiesTypeReference {
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
 * A `<file>#<TypeName>` string, passed from the command line, refers to an
 * messenger actions or events collection type. This function reads the file and
 * looks up the matching type alias.
 *
 * @param args - The arguments to this function.
 * @param args.project - The ts-morph project to load the file into.
 * @param args.projectPath - Absolute path to the project root.
 * @param args.reference - The root capability collection type reference to
 * resolve.
 * @param args.commandLineOptionName - The command-line option the reference
 * came from, used in errors.
 * @returns The type alias declaration the reference names.
 * @throws If the file can't be read or declares no such type alias.
 */
function resolveMessengerCapabilitiesTypeReference({
  project,
  projectPath,
  reference,
  commandLineOptionName,
}: {
  project: TsMorphProject;
  projectPath: string;
  reference: RootCapabilitiesTypeReference;
  commandLineOptionName: string;
}): TypeAliasDeclaration {
  const absolutePath = path.resolve(projectPath, reference.filePath);

  // `addSourceFileAtPath` is idempotent: the two references often name the same
  // file, and the second call returns the source file added by the first.
  let sourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(absolutePath);
  } catch {
    throw new Error(
      `Could not read ${absolutePath}, which was named by ${commandLineOptionName}.`,
    );
  }

  // EXAMPLES:
  //   type RootMessengerActions = ...
  //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //   type RootMessengerEvents = ...
  //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  const declaration = sourceFile.getTypeAlias(reference.typeName);
  if (!declaration) {
    throw new Error(
      `No type alias named "${reference.typeName}" in ${reference.filePath}, which was named by ${commandLineOptionName}.`,
    );
  }

  return declaration;
}

/**
 * Given the type of a messenger capability (e.g.
 * `NetworkControllerAddNetworkAction`) as obtained from a collection of
 * capability types (e.g. `RootMessengerActions` or `RootMessengerEvents`),
 * locate the type declaration for that capability type.
 *
 * This is not as simple as following the type to its declaration, because both
 * a collection of capability types and the capability type itself can have
 * multiple representations. So there are three strategies for finding the type:
 *
 * 1. If the capability type was declared as a type alias (e.g. `type
 *    FooControllerSomeAction = { ... }`), then we need to use the symbol to
 *    find the declaration.
 * 2. If the capability type was declared as an interface (e.g. `interface
 *    FooControllerSomeAction { ... }`), we don't need to do this; interfaces
 *    are their own declaration.
 * 3. If the capability *collection* type is not a union but merely a type alias
 *    (e.g. `type RootMessengerActions = NetworkControllerAddNetworkAction`)
 *    then we follow the right-hand side of the type alias.
 *
 * When none of these find a type declaration, the capability is anonymous
 * (e.g. an inline object type with no name to document) and `undefined` is
 * returned, so the caller can record it as skipped rather than document it.
 *
 * @param capabilityType - The type of the individual capability to find the
 * declaration for.
 * @param capabilityCollectionTypeDeclaration - The declaration of the whole
 * collection the capability came from (e.g. `type RootMessengerActions = ...`).
 * @param isLoneConstituent - Whether the capability collection only includes
 * one capability type.
 * @returns The type alias or interface declaration for the capability, or
 * `undefined` when the capability is anonymous.
 */
function findMessengerCapabilityTypeDeclaration(
  capabilityType: Type,
  capabilityCollectionTypeDeclaration: TypeAliasDeclaration,
  isLoneConstituent: boolean,
): TypeAliasDeclaration | InterfaceDeclaration | undefined {
  // If we have a type alias, look for its symbol.
  //
  // EXAMPLE:
  //   type FooControllerSomeAction = { type: '...'; handler: () => void };
  //        ^^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //        the alias symbol names    the plain symbol points at this anonymous
  //        this declaration          object
  //
  // But skip an alias that resolves back to the capability collection itself,
  // which is what TypeScript reports for a lone generic instantiation.
  //
  // EXAMPLE:
  //   Here the alias symbol of the sole member is `Actions`, i.e.
  //   `capabilityCollectionTypeDeclaration`, which is not the capability we
  //   want to document:
  //
  //   type Actions = Foo<Bar>;
  //        ^^^^^^^ capabilityCollectionTypeDeclaration
  const typeAliasDeclarations = (
    capabilityType.getAliasSymbol()?.getDeclarations() ?? []
  ).filter((node) => node !== capabilityCollectionTypeDeclaration);

  // An interface has no alias symbol, being its own declaration, so fall back
  // to the plain symbol to reach it.
  // EXAMPLE:
  //   interface FooControllerSomeAction { type: '...'; handler: () => void }
  //             ^^^^^^^^^^^^^^^^^^^^^^^ reached via the plain symbol
  const typeDeclarations =
    typeAliasDeclarations.length > 0
      ? typeAliasDeclarations
      : (capabilityType.getSymbol()?.getDeclarations() ?? []);

  // Of the declarations behind whichever symbol we used, pick the type alias or
  // interface.
  // EXAMPLES:
  //   type FooControllerSomeAction = { ... }
  //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //   interface FooControllerSomeAction { ... }
  //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  const foundTypeDeclaration = typeDeclarations.find(
    (node): node is TypeAliasDeclaration | InterfaceDeclaration =>
      NodeGuards.isTypeAliasDeclaration(node) ||
      NodeGuards.isInterfaceDeclaration(node),
  );
  if (foundTypeDeclaration) {
    return foundTypeDeclaration;
  }

  // If the capability collection type has only one constituent, we can safely
  // assume it's a type alias. If, in this case, it's also generic, the
  // declaration we want is the one its type node references, so follow it.
  //
  // EXAMPLE:
  //   type Actions = Foo<Bar>;
  //                  ^^^ follow this reference to its declaration
  //
  if (isLoneConstituent) {
    return resolveGenericCapabilityCollectionTypeDeclaration(
      capabilityCollectionTypeDeclaration,
    );
  }

  // If, after all of this, the capability collection is a union with an
  // anonymous constituent, we ignore it:
  //
  // EXAMPLE:
  //   type Actions = FooControllerSomeAction | { type: '...'; handler: ... };
  //                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  return undefined;
}

/**
 * Given a messenger capability collection with one constituent which is a
 * generic capability type, follow that type to find its declaration.
 *
 * A type that is aliased to a generic type is a special case we need to handle,
 * because it won't have a direct alias symbol; we need to pick out the type
 * that acts as the "box" in the generic (e.g. the `Foo` in `type Actions =
 * Foo<Bar>`).
 *
 * @param capabilityCollectionTypeDeclaration - The declaration for a
 * collection of capability types (e.g. `type RootMessengerActions = ...`).
 * @returns The resolved sole capability type.
 */
function resolveGenericCapabilityCollectionTypeDeclaration(
  capabilityCollectionTypeDeclaration: TypeAliasDeclaration,
): TypeAliasDeclaration | InterfaceDeclaration | undefined {
  // The root alias must reference another type by name for there to be a
  // declaration to follow.
  // EXAMPLE:
  //   type Actions = Foo<Bar>;
  //                  ^^^^^^^^
  const typeNode = capabilityCollectionTypeDeclaration.getTypeNode();
  if (!typeNode || !NodeGuards.isTypeReference(typeNode)) {
    return undefined;
  }

  // Resolve the referenced name (e.g. `Foo` in `Foo<Bar>`) to its symbol.
  const localSymbol = typeNode.getTypeName().getSymbol();
  // If the type is imported from another file, ensure that when we access the
  // declaration, it's the type declaration in the other file, not the import
  // declaration in this file.
  // EXAMPLE:
  //   import { Foo } from '@metamask/foo';
  //   type Actions = Foo<Bar>;
  //                  ^^^
  const symbol = localSymbol?.getAliasedSymbol() ?? localSymbol;

  // Follow the reference to the type alias or interface it names.
  // EXAMPLES:
  //   type Foo<T> = { ... }
  //   ^^^^^^^^^^^^^^^^^^^^
  //   interface Foo<T> { ... }
  //   ^^^^^^^^^^^^^^^^^^^^^^^
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
function summarizeType(
  type: Type,
  enclosingNode: TypeAliasDeclaration,
): string {
  const text = type.getText(enclosingNode).replace(/\s+/gu, ' ');
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/**
 * Walk a messenger capability collection type (e.g. `RootMessengerActions` or
 * `RootMessengerEvents`) to gather all of the consitutent capability types
 * (e.g. `NetworkControllerAddNetworkAction`), then package them so that they
 * can be displayed within the documentation.
 *
 * Messenger capabilities that cannot be extracted for some reason are captured
 * separately.
 *
 * @param args - The arguments to this function.
 * @param args.projectPath - Absolute path to the project root.
 * @param args.capabilityKind - Whether these are actions or events.
 * @param args.capabilityCollectionTypeReference - A reference to a messenger
 * capability collection type within the project, in `<file>#<TypeName>` format.
 * @param args.capabilityCollectionTypeDeclaration - The type declaration
 * representing a collection of messenger capabilities.
 * @param args.commandLineOptionName - The command-line option the reference
 * came from, used in errors.
 * @returns The extracted capabilities along with skipped capabilities.
 * @throws If the capability collection type resolved to `any` or `unknown`.
 */
function extractFromMessengerCapabilitiesUnionTypeDeclaration({
  projectPath,
  capabilityKind,
  capabilityCollectionTypeReference,
  capabilityCollectionTypeDeclaration,
  commandLineOptionName,
}: {
  projectPath: string;
  capabilityKind: 'action' | 'event';
  capabilityCollectionTypeReference: RootCapabilitiesTypeReference;
  capabilityCollectionTypeDeclaration: TypeAliasDeclaration;
  commandLineOptionName: string;
}): {
  capabilityPackets: MessengerCapabilityPacket[];
  skippedCapabilities: SkippedCapabilities;
} {
  const capabilityCollectionType = capabilityCollectionTypeDeclaration
    .getTypeNodeOrThrow()
    .getType();

  // If one or more of the constituent capabilities in the collection is `any`
  // or `unknown` — e.g. its import failed — then the type of the whole
  // collection will also be `any` or `unknown`. Fail instead of emitting a
  // catalog that looks complete but silently isn't.
  if (
    capabilityCollectionType.isAny() ||
    capabilityCollectionType.isUnknown()
  ) {
    throw new Error(
      `${capabilityCollectionTypeReference.filePath}#${capabilityCollectionTypeReference.typeName}, named by ${commandLineOptionName}, ` +
        `resolved to \`${capabilityCollectionType.getText()}\`. ` +
        `It's likely that an individual action or event type is also \`${capabilityCollectionType.getText()}\`, ` +
        `which may be due to a failed import. ` +
        `You will need to fix this first before generating docs for this project.`,
    );
  }

  const skippedCapabilities: SkippedCapabilities = {
    unnamedCapabilities: [],
    unextractableCapabilities: [],
  };

  // A project with no capabilities of this kind aliases the union to `never`.
  if (capabilityCollectionType.isNever()) {
    return {
      capabilityPackets: [],
      skippedCapabilities,
    };
  }

  const individualCapabilityTypes = capabilityCollectionType.isUnion()
    ? capabilityCollectionType.getUnionTypes()
    : [capabilityCollectionType];
  const capabilityPackets: MessengerCapabilityPacket[] = [];

  for (const capabilityType of individualCapabilityTypes) {
    const capabilityTypeDeclaration = findMessengerCapabilityTypeDeclaration(
      capabilityType,
      capabilityCollectionTypeDeclaration,
      individualCapabilityTypes.length === 1,
    );
    if (!capabilityTypeDeclaration) {
      skippedCapabilities.unnamedCapabilities.push(
        summarizeType(capabilityType, capabilityCollectionTypeDeclaration),
      );
      continue;
    }

    const classifiedTypeDeclaration =
      classifyMessengerCapabilityTypeDeclaration(
        capabilityTypeDeclaration,
        capabilityKind,
      );
    const capabilityPacket =
      classifiedTypeDeclaration &&
      extractFromMessengerCapabilityTypeDeclaration(
        classifiedTypeDeclaration,
        projectPath,
      );
    if (!capabilityPacket) {
      const sourceFile = capabilityTypeDeclaration
        .getSourceFile()
        .getFilePath();
      skippedCapabilities.unextractableCapabilities.push(
        `${capabilityTypeDeclaration.getName()} (${path.relative(projectPath, sourceFile)}:${capabilityTypeDeclaration.getStartLineNumber()})`,
      );
      continue;
    }

    capabilityPackets.push(capabilityPacket);
  }

  return { capabilityPackets, skippedCapabilities };
}

/**
 * Resolves `<file>#<TypeName>` references to messenger actions and events
 * collection types within the given project (e.g. `RootMessengerActions` or
 * `RootMessengerEvents`), walks the collection to gather all of the containing
 * capability types (e.g. `NetworkControllerAddNetworkAction`), then packages
 * them so that they can be displayed within the documentation site.
 *
 * @param args - The arguments to this function.
 * @param args.projectPath -Absolute path to the project to scan.
 * @param args.rootActionsTypeReference - A reference to a messenger
 * actions collection type within the project, in `<file>#<TypeName>` format.
 * @param args.rootEventsTypeReference - A reference to a messenger events
 * collection type within the project, in `<file>#<TypeName>` format.
 * @returns The extracted capabilities plus any capabilities that were skipped.
 */
export function discoverFromRootMessengerCapabilitiesTypes({
  projectPath,
  rootActionsTypeReference,
  rootEventsTypeReference,
}: {
  projectPath: string;
  rootActionsTypeReference: RootCapabilitiesTypeReference;
  rootEventsTypeReference: RootCapabilitiesTypeReference;
}): {
  capabilityPackets: MessengerCapabilityPacket[];
  skippedCapabilities: SkippedCapabilities;
} {
  const project = createProject();
  const capabilityPacketCollections = [
    [rootActionsTypeReference, 'action', '--root-actions'],
    [rootEventsTypeReference, 'event', '--root-events'],
  ] as const;
  const allCapabilityPackets: MessengerCapabilityPacket[] = [];
  const allSkippedCapabilities: SkippedCapabilities = {
    unnamedCapabilities: [],
    unextractableCapabilities: [],
  };

  for (const [
    capabilitiesCollectionTypeReference,
    kind,
    commandLineOptionName,
  ] of capabilityPacketCollections) {
    const capabilitiesCollectionTypeDeclaration =
      resolveMessengerCapabilitiesTypeReference({
        project,
        projectPath,
        reference: capabilitiesCollectionTypeReference,
        commandLineOptionName,
      });
    const { capabilityPackets, skippedCapabilities } =
      extractFromMessengerCapabilitiesUnionTypeDeclaration({
        projectPath,
        capabilityKind: kind,
        capabilityCollectionTypeReference: capabilitiesCollectionTypeReference,
        capabilityCollectionTypeDeclaration:
          capabilitiesCollectionTypeDeclaration,
        commandLineOptionName,
      });
    allCapabilityPackets.push(...capabilityPackets);
    allSkippedCapabilities.unnamedCapabilities.push(
      ...skippedCapabilities.unnamedCapabilities,
    );
    allSkippedCapabilities.unextractableCapabilities.push(
      ...skippedCapabilities.unextractableCapabilities,
    );
  }

  return {
    capabilityPackets: allCapabilityPackets,
    skippedCapabilities: allSkippedCapabilities,
  };
}
