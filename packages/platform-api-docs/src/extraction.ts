import * as path from 'node:path';
import type {
  Identifier,
  InterfaceDeclaration,
  JSDocableNode,
  JSDocTag,
  MethodDeclaration,
  Node as TsMorphNode,
  PropertySignature,
  SourceFile,
  TypeAliasDeclaration,
  TypeElementTypes,
  TypeNode,
  TypeReferenceNode,
} from 'ts-morph';
import { Node as NodeGuards, Project, ts } from 'ts-morph';

import type { MessengerCapabilityPacket, DocumentedParameter } from './types';

// ---------------------------------------------------------------------------
// NOTE: `ts-morph` is used heavily in this file to parse and extract
// information from TypeScript files. Although this library is not well
// documented, it wraps the TypeScript AST fairly well, and you can get a good
// sense of the AST by using this website: <https://ts-ast-viewer.com>
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// JSDoc utilities
// ---------------------------------------------------------------------------

/**
 * Convert `{@link X}` references inside a JSDoc comment string to plain
 * backtick code spans and escape any remaining (out-of-backtick) curly braces.
 * This way the output is safe to render in a MDX document.
 *
 * @param text - The raw text to normalize.
 * @returns The text with `@link` resolved and stray braces escaped.
 */
function escapeJsDocTextForMdx(text: string): string {
  const withLinksResolved = text.replace(/\{@link\s+([^}]+)\}/gu, '`$1`');
  return withLinksResolved.replace(
    /`[^`]*`|(\{)|(\})/gu,
    (match, open: string | undefined, close: string | undefined) => {
      if (open) {
        return '\\{';
      }
      if (close) {
        return '\\}';
      }
      return match;
    },
  );
}

/**
 * Extract the comment text of a JSDoc tag — the part that comes after the tag
 * and any identifier, e.g. "Some param" in "@param foo Some param" —
 * normalizing whitespace to a single space so we can better control how it's
 * rendered within the site.
 *
 * @param tag - The JSDoc tag.
 * @returns The flattened comment text.
 */
function extractJsDocTagComment(tag: JSDocTag): string {
  return (tag.getCommentText() ?? '').replace(/\s+/gu, ' ').trim();
}

/**
 * Strip the conventional `- ` separator from the start of a `@param` tag's
 * comment.
 *
 * @param comment - The flattened comment text from a `@param` tag.
 * @returns The comment with any leading `- ` (or `– `, `— `) removed.
 */
function stripJsDocParamSeparator(comment: string): string {
  return comment.replace(/^[-–—]\s*/u, '');
}

/**
 * Extract JSDoc from a TypeScript AST node and decompose it into the parts we
 * need to render docs:
 *
 * - `description` — the body above the first tag, with `@deprecated` comments
 *   appended as `**Deprecated:** <comment>` lines and normalized for MDX
 *   (curly braces escaped, `{@link}` resolved),
 * - `params` — every `@param` tag in source order, with name and description,
 * - `returns` — the `@returns` tag's comment, or empty string if absent.
 *
 * Other tags (`@see`, `@throws`, `@template`, `@example`) are dropped.
 *
 * @param node - The AST node to extract JSDoc from (e.g. a type or a method).
 * @returns The decomposed JSDoc; empty strings/arrays when the node has no JSDoc.
 */
function extractJsDoc(node: JSDocableNode): {
  description: string;
  params: DocumentedParameter[];
  returns: string;
} {
  const jsDocs = node.getJsDocs();
  if (jsDocs.length === 0) {
    return { description: '', params: [], returns: '' };
  }

  const jsDoc = jsDocs[0];
  const descriptionBody = jsDoc.getDescription().trim();

  const deprecatedLines: string[] = [];
  const params: DocumentedParameter[] = [];
  let returns = '';

  for (const tag of jsDoc.getTags()) {
    const tagName = tag.getTagName();
    if (tagName === 'deprecated') {
      const comment = extractJsDocTagComment(tag);
      deprecatedLines.push(
        comment ? `**Deprecated:** ${comment}` : '**Deprecated:**',
      );
    } else if (tagName === 'param' && NodeGuards.isJSDocParameterTag(tag)) {
      const nameNode = tag.getNameNode();
      const paramName = nameNode.getText();
      if (!paramName) {
        continue;
      }
      const comment = extractJsDocTagComment(tag);
      params.push({
        name: paramName,
        description: escapeJsDocTextForMdx(stripJsDocParamSeparator(comment)),
      });
    } else if (tagName === 'returns' || tagName === 'return') {
      const comment = extractJsDocTagComment(tag);
      returns = escapeJsDocTextForMdx(comment);
    }
  }

  const description = escapeJsDocTextForMdx(
    [descriptionBody, ...deprecatedLines]
      .filter((line) => line.length > 0)
      .join('\n'),
  );

  return { description, params, returns };
}

/**
 * Check whether a node has an `@deprecated` JSDoc tag.
 *
 * @param node - The AST node to check.
 * @returns True if the node has an `@deprecated` tag.
 */
function hasDeprecatedJsDocTag(node: JSDocableNode): boolean {
  return node
    .getJsDocs()
    .flatMap((jsDoc) => jsDoc.getTags())
    .some((tag) => tag.getTagName() === 'deprecated');
}

// ---------------------------------------------------------------------------
// Type-resolution helpers (powered by ts-morph's type checker)
// ---------------------------------------------------------------------------

/**
 * Locates the type that represents a method on a class (e.g.
 * `Class['method']`), which itself comes from a messenger action handler.
 *
 * @param typeNode - The node that represents the indexed access.
 * @returns The found method declaration, or null.
 */
function findClassMethodDeclaration(
  typeNode: TypeNode | undefined,
): MethodDeclaration | null {
  // Fundamental check: if we don't have `Class['method']`, we can't do anything.
  if (!NodeGuards.isIndexedAccessTypeNode(typeNode)) {
    return null;
  }

  // The type that represents the class being accessed.
  // EXAMPLE:
  //   FooController['someMethod']
  //   ^^^^^^^^^^^^^
  const objectType = typeNode.getObjectTypeNode();
  // The type that represents the property being accessed.
  // EXAMPLE:
  //   FooController['someMethod']
  //                 ^^^^^^^^^^^^
  const indexType = typeNode.getIndexTypeNode();

  // To access a property on a type, it must be a type we can access properties of.
  if (
    !NodeGuards.isTypeReference(objectType) ||
    !NodeGuards.isLiteralTypeNode(indexType)
  ) {
    return null;
  }
  const indexLiteral = indexType.getLiteral();
  // Names of methods must be static strings; they cannot be template strings.
  if (
    !NodeGuards.isStringLiteral(indexLiteral) &&
    !NodeGuards.isNoSubstitutionTemplateLiteral(indexLiteral)
  ) {
    return null;
  }
  const methodName = indexLiteral.getLiteralValue();

  // Reject qualified-name type names, as we need a plain identifier to
  // resolve the symbol.
  // EXAMPLE:
  //   import * as somePackage from '...';
  //   somePackage.FooController['someMethod']
  //   ^^^^^^^^^^^^^^^^^^^^^^^^^
  const classNameNode = objectType.getTypeName();
  if (!NodeGuards.isIdentifier(classNameNode)) {
    return null;
  }

  // Since we know we have a type reference, we can assume that we have a symbol.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const localSymbol = classNameNode.getSymbol()!;
  // If we have a type imported from another file, ensure that when we access
  // the declaration, it's the type declaration in the other file, not the
  // import declaration in this file.
  // EXAMPLE:
  //   import { FooController } from '@metamask/foo-controller';
  //   FooController['someMethod']
  //   ^^^^^^^^^^^^^
  const symbol = localSymbol.getAliasedSymbol() ?? localSymbol;

  for (const declaration of symbol.getDeclarations()) {
    // We must have a class to treat the property on the object type as a
    // method.
    if (NodeGuards.isClassDeclaration(declaration)) {
      const method = declaration.getMethod(methodName);
      if (method) {
        return method;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Method info
// ---------------------------------------------------------------------------

/**
 * Build the textual signature of a class method — its parameter list and
 * return type expressed as a TypeScript function type — so a handler that
 * references `Class['method']` can be rendered as `(arg: T) => R` instead of
 * the bare indexed-access syntax.
 *
 * @param method - The method declaration.
 * @returns The signature, e.g. `(id: number) => Promise<string>`.
 */
function buildMethodSignature(method: MethodDeclaration): string {
  const signatureParams = method
    .getParameters()
    .map((param) => {
      const rest = param.isRestParameter() ? '...' : '';
      const paramName = param.getNameNode().getText();
      const optional = param.hasQuestionToken() ? '?' : '';
      const typeNode = param.getTypeNode();
      const paramType = typeNode ? typeNode.getText() : 'unknown';
      return `${rest}${paramName}${optional}: ${paramType}`;
    })
    .join(', ');

  const returnTypeNode = method.getReturnTypeNode();
  const returnType = returnTypeNode ? returnTypeNode.getText() : 'void';
  // For async methods, the declared return type already includes `Promise<>`,
  // so we don't need to wrap again.
  return `(${signatureParams}) => ${returnType}`;
}

// ---------------------------------------------------------------------------
// Messenger discovery
// ---------------------------------------------------------------------------

/**
 * A messenger capability type whose body invokes a capability-type-constructor
 * utility such as `ControllerGetStateAction<...>` or
 * `ControllerStateChangeEvent<...>`. The walker classifies the body once when
 * it captures the declaration so the extractor can read the body's type name
 * and type arguments without re-running the AST guards.
 */
type ConstructorMessengerCapabilityTypeDeclaration = {
  bodyShape: 'constructor';
  kind: 'action' | 'event';
  declaration: TypeAliasDeclaration;
  body: TypeReferenceNode;
  typeName: Identifier;
};

/**
 * A messenger capability type whose declaration carries the action/event
 * shape directly — either an interface or a type alias for a type literal.
 * The extractor reads `type`, `handler`, and `payload` from the members.
 */
type ObjectMessengerCapabilityTypeDeclaration = {
  bodyShape: 'object';
  kind: 'action' | 'event';
  declaration: TypeAliasDeclaration | InterfaceDeclaration;
};

/**
 * Represents a type declaration (type alias or interface) for an individual
 * messenger action or event, tagged with the body shape the walker
 * identified.
 */
type MessengerCapabilityTypeDeclaration =
  | ConstructorMessengerCapabilityTypeDeclaration
  | ObjectMessengerCapabilityTypeDeclaration;

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
  //   import * as somePackage from '...';
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

      // A TypeReference body with type arguments is a capability-type-
      // constructor invocation (e.g. `ControllerGetStateAction<typeof name,
      // State>`). Tag it so the constructor extractor can read `body`
      // directly without re-checking its shape.
      // EXAMPLE:
      //   type FooControllerSomeAction = ControllerGetStateAction<...>
      //                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      if (body && NodeGuards.isTypeReference(body)) {
        // Reject qualified-name constructor type names, as we need a plain
        // identifier to match the constructor by name.
        // EXAMPLE:
        //   // Bad
        //   import * as somePackage from '...';
        //   type FooControllerSomeAction = somePackage.ControllerGetStateAction<...>
        //                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        const constructorTypeName = body.getTypeName();
        if (NodeGuards.isIdentifier(constructorTypeName)) {
          result.capabilityTypeDeclarations.push({
            bodyShape: 'constructor',
            kind,
            declaration,
            body,
            typeName: constructorTypeName,
          });
        }
        continue;
      }

      // Anything else (a type literal, intersection, conditional, …) gets
      // tagged for the literal extractor, which knows how to read members
      // off a type literal and rejects exotic shapes.
      // EXAMPLE:
      //   type FooControllerSomeAction = { ... }
      //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      result.capabilityTypeDeclarations.push({
        bodyShape: 'object',
        kind,
        declaration,
      });
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
// Per-statement extraction
// ---------------------------------------------------------------------------

/**
 * Given the declaration of a messenger capability type, extract information
 * about it (action/event type string, handler/payload arguments and return
 * type, etc.)
 *
 * @param capabilityTypeDeclaration - The statement that declared the type for a
 * messenger action or event, extracted in a previous step.
 * @param projectPath - Project root, used for computing relative source paths.
 * @returns Information that may be extracted from the messenger capability type
 * (may be `null` if the type is ineligible for extraction).
 */
function extractFromMessengerCapabilityTypeDeclaration(
  capabilityTypeDeclaration: MessengerCapabilityTypeDeclaration,
  projectPath: string,
): MessengerCapabilityPacket | null {
  if (capabilityTypeDeclaration.bodyShape === 'constructor') {
    return tryToExtractFromCapabilityTypeConstructor(
      capabilityTypeDeclaration,
      projectPath,
    );
  }
  return tryToExtractFromMessengerCapabilityTypeLiteral(
    capabilityTypeDeclaration,
    projectPath,
  );
}

/**
 * If a messenger capability type is a type alias or interface and its body is
 * a literal object type — i.e. one of:
 *
 * - `{ type: '...'; handler: ... }` (action)
 * - `{ type: '...'; payload: ... }` (event)
 *
 * then this function extracts information about the type (action/event type
 * string, handler/payload arguments and return type, etc.)
 *
 * @param capabilityTypeDeclaration - The statement that declared the type for a
 * messenger action or event, extracted in a previous step.
 * @param projectPath - Project root, used for computing relative source paths.
 * @returns The extracted capability packet, or null if the shape of the type
 * doesn't match.
 */
function tryToExtractFromMessengerCapabilityTypeLiteral(
  capabilityTypeDeclaration: ObjectMessengerCapabilityTypeDeclaration,
  projectPath: string,
): MessengerCapabilityPacket | null {
  const { declaration, kind } = capabilityTypeDeclaration;

  // We must have a object type alias or an interface, and the body must not be empty.
  // EXAMPLES:
  //   // Good
  //   type FooControllerSomeAction = {
  //     type: 'FooController:getState';
  //     handler: FooController['getState'];
  //   }
  //   // Good
  //   interface FooControllerSomeAction {
  //     type: 'FooController:getState';
  //     handler: FooController['getState'];
  //   }
  //   // Bad
  //   type FooControllerSomeAction = {};
  //   // Bad
  //   interface FooControllerSomeAction {};
  let members: TypeElementTypes[] | undefined;
  if (NodeGuards.isTypeAliasDeclaration(declaration)) {
    const body = declaration.getTypeNode();
    if (body && NodeGuards.isTypeLiteral(body)) {
      members = body.getMembers();
    }
  } else {
    members = declaration.getMembers();
  }
  if (!members) {
    return null;
  }

  const propertySignatures = members.filter(
    NodeGuards.isPropertySignature.bind(NodeGuards),
  );

  // Actions and events must have a `type`, and it must be a string.
  const typeString = getMessengerCapabilityTypeString(propertySignatures);
  if (!typeString) {
    return null;
  }

  // Actions must have a `handler`, and events must have a `payload`.
  const handlerOrPayloadProperty = findProperty(
    propertySignatures,
    kind === 'action' ? 'handler' : 'payload',
  );
  if (!handlerOrPayloadProperty) {
    return null;
  }

  const handlerOrPayloadPropertyTypeNode =
    // We can assume the property has a type; otherwise it wouldn't compile.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    handlerOrPayloadProperty.getTypeNode()!;
  let handlerOrPayloadSignature = handlerOrPayloadPropertyTypeNode
    .getText()
    .trim();

  const { description: jsDoc, params, returns } = extractJsDoc(declaration);

  // For actions that represent methods (e.g. `Class['method']`), walk the
  // handler type to find the underlying handler signature
  // (e.g. `(id: number) => Promise<string>`).
  if (kind === 'action') {
    const methodDeclaration = findClassMethodDeclaration(
      handlerOrPayloadPropertyTypeNode,
    );
    if (methodDeclaration) {
      handlerOrPayloadSignature = buildMethodSignature(methodDeclaration);
    }
  }

  const sourceFile = declaration.getSourceFile();
  return {
    typeName: declaration.getName(),
    typeString,
    kind,
    jsDoc,
    params,
    returns,
    handlerOrPayload: handlerOrPayloadSignature,
    sourceFile: path.relative(projectPath, sourceFile.getFilePath()),
    line: declaration.getStartLineNumber(),
    deprecated: hasDeprecatedJsDocTag(declaration),
  };
}

/**
 * Searches the property signatures of a messenger capability type alias or
 * interface to find the value of the `type` property, and then resolves it to a
 * string (assuming it is already a string or a resolvable template literal).
 *
 * @param capabilityTypeProperties - The property signatures of the messenger
 * capability type.
 * @returns The extracted capability type string, or null if `type` cannot be
 * found in the members or it is an unexpected node.
 */
function getMessengerCapabilityTypeString(
  capabilityTypeProperties: PropertySignature[],
): string | null {
  const typeProperty = findProperty(capabilityTypeProperties, 'type');
  if (!typeProperty) {
    return null;
  }

  // A `type` property without an explicit type wouldn't compile.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const typeNode = typeProperty.getTypeNode()!;

  // Ask the type checker to resolve the value of `type`. We're looking for
  // `type` to be either a string literal or template literal.
  //
  // EXAMPLES:
  //   type FooControllerSomeAction = {
  //     type: 'FooController:someAction';
  //           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  //   }
  //   type FooControllerSomeAction = {
  //     type: `FooController:someAction`;
  //           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  //   }
  //   type FooControllerSomeAction = {
  //     type: `${typeof CONTROLLER_NAME}:someAction`;
  //           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //   }
  const resolvedType = typeNode.getType();
  if (resolvedType.isStringLiteral()) {
    // Type assertion: There aren't any type guards we can use to narrow this
    // type further.
    const literalValue = resolvedType.getLiteralValueOrThrow() as string;

    // Messenger action/event types need to be namespaced.
    if (literalValue.includes(':')) {
      return literalValue;
    }
  }

  return null;
}

/**
 * Finds a specific property in a list of property signatures for an object
 * type.
 *
 * @param propertySignatures - The property signatures of the messenger
 * capability type.
 * @param name - The property name to find.
 * @returns The property signature, or null.
 */
function findProperty(
  propertySignatures: PropertySignature[],
  name: string,
): PropertySignature | null {
  for (const property of propertySignatures) {
    const propertyNameNode = property.getNameNode();
    if (
      !NodeGuards.isIdentifier(propertyNameNode) ||
      propertyNameNode.getText() !== name
    ) {
      continue;
    }

    return property;
  }

  return null;
}

/**
 * If a messenger capability type is a type alias for either the
 * `ControllerGetStateAction` or `ControllerStateChangeEvent` type constructors,
 * then this function extracts information about the type (action/event type
 * string, handler/payload arguments and return type, etc.)
 *
 * @param capabilityTypeDeclaration - The statement that declared the type for a
 * messenger action or event, extracted in a previous step.
 * @param projectPath - Project root, used for computing relative source paths.
 * @returns The extracted capability packet, or null if the shape of the type
 * doesn't match.
 */
function tryToExtractFromCapabilityTypeConstructor(
  capabilityTypeDeclaration: ConstructorMessengerCapabilityTypeDeclaration,
  projectPath: string,
): MessengerCapabilityPacket | null {
  const { declaration, kind, body, typeName } = capabilityTypeDeclaration;

  // The name of the utility type should be either `ControllerGetStateAction`
  // (for actions) or `ControllerStateChangeEvent` (for events).
  // EXAMPLES:
  //   type FooControllerSomeAction = ControllerGetStateAction<...>
  //   type FooControllerSomeEvent = ControllerStateChangeEvent<...>
  const expectedConstructor =
    kind === 'action'
      ? 'ControllerGetStateAction'
      : 'ControllerStateChangeEvent';
  if (typeName.getText() !== expectedConstructor) {
    return null;
  }

  // The utility type should take two parameters.
  // EXAMPLES:
  //   type FooControllerSomeAction = ControllerGetStateAction<..., ...>
  //   type FooControllerSomeEvent = ControllerStateChangeEvent<..., ...>
  const typeArgs = body.getTypeArguments();
  if (typeArgs.length < 2) {
    return null;
  }

  const namespaceArgType = typeArgs[0].getType();
  // The first parameter should be a string literal.
  // EXAMPLES:
  //   type FooControllerSomeAction = ControllerGetStateAction<'FooController', ...>
  //   type FooControllerSomeAction = ControllerGetStateAction<typeof CONTROLLER_NAME, ...>
  if (!namespaceArgType.isStringLiteral()) {
    return null;
  }
  // Type assertion: There aren't any type guards we can use to narrow this type
  // further.
  const namespace = namespaceArgType.getLiteralValueOrThrow() as string;

  const typeString =
    kind === 'action' ? `${namespace}:getState` : `${namespace}:stateChange`;
  const stateArgText = typeArgs[1].getText();
  const handlerOrPayload =
    kind === 'action' ? `() => ${stateArgText}` : `[${stateArgText}, Patch[]]`;
  const { description, params, returns } = extractJsDoc(declaration);
  const sourceFile = declaration.getSourceFile();

  return {
    typeName: declaration.getName(),
    typeString,
    kind,
    jsDoc: description,
    params,
    returns,
    handlerOrPayload,
    sourceFile: path.relative(projectPath, sourceFile.getFilePath()),
    line: declaration.getStartLineNumber(),
    deprecated: hasDeprecatedJsDocTag(declaration),
  };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Create a ts-morph Project configured for messenger-docs extraction. The
 * caller should add every source file that may be referenced (directly or
 * transitively) before calling {@link extractFromSourceFile}, so the type
 * checker can resolve cross-file references.
 *
 * @returns A new ts-morph Project.
 */
export function createExtractionProject(): Project {
  return new Project({
    compilerOptions: {
      allowJs: false,
      noEmit: true,
      // Match the project's permissive defaults — we just need symbol
      // resolution, not full typechecking.
      strict: false,
      skipLibCheck: true,
      // Explicit module options so cross-file symbol resolution works
      // regardless of the host process's tsconfig.
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
  });
}

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
