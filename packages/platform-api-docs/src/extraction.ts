import * as path from 'node:path';
import type {
  InterfaceDeclaration,
  JSDocableNode,
  JSDocTag,
  MethodDeclaration,
  Node as TsMorphNode,
  PropertySignature,
  SourceFile,
  TemplateLiteralTypeNode,
  TypeAliasDeclaration,
  TypeElementTypes,
  TypeNode,
} from 'ts-morph';
import { Node as NodeGuards, Project, ts } from 'ts-morph';

import type {
  ExtractedMessengerCapabilityType,
  MethodInfo,
  DocumentedParameter,
} from './types';

// ---------------------------------------------------------------------------
// JSDoc utilities
// ---------------------------------------------------------------------------

/**
 * Convert `{@link X}` references inside a string to plain backtick code spans,
 * and escape any remaining (out-of-backtick) curly braces so the output is
 * safe to drop into MDX.
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
 * Extract a JSDoc tag's comment text, normalizing whitespace so continuation
 * lines are joined with single spaces. ts-morph returns the raw comment with
 * embedded newlines preserved; we collapse those for the markdown output.
 *
 * @param tag - The JSDoc tag.
 * @returns The flattened comment text.
 */
function extractJsDocTagComment(tag: JSDocTag): string {
  // istanbul ignore next: ts-morph returns null for tags without comment text,
  // but every fixture tag we extract from carries a comment.
  return (tag.getCommentText() ?? '').replace(/\s+/gu, ' ').trim();
}

/**
 * Strip the conventional `- ` separator from the start of a `@param` tag's
 * comment. JSDoc style is `@param name - description`, and ts-morph hands us
 * back `- description` for the comment. The hyphen is purely cosmetic; we'd
 * rather render the description without it.
 *
 * @param comment - The flattened comment text from a `@param` tag.
 * @returns The comment with any leading `- ` (or `– `, `— `) removed.
 */
function stripParamSeparator(comment: string): string {
  return comment.replace(/^[-–—]\s*/u, '');
}

/**
 * Decompose a node's JSDoc into the parts the rendered docs need:
 *
 * - `description` — the body above the first tag, with `@deprecated` comments
 *   appended as `**Deprecated:** <comment>` lines and normalized for MDX
 *   (curly braces escaped, `{@link}` resolved),
 * - `params` — every `@param` tag in source order, with name and description,
 * - `returns` — the `@returns` tag's comment, or empty string if absent.
 *
 * Other tags (`@see`, `@throws`, `@template`, `@example`) are dropped.
 *
 * @param node - The AST node to extract JSDoc from.
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
      // istanbul ignore next: bare `@deprecated` (without explanatory text)
      // doesn't appear in messenger JSDoc in practice.
      deprecatedLines.push(
        comment ? `**Deprecated:** ${comment}` : '**Deprecated:**',
      );
    } else if (tagName === 'param' && NodeGuards.isJSDocParameterTag(tag)) {
      const nameNode = tag.getNameNode();
      // istanbul ignore next: `@param` tags without a name aren't valid JSDoc.
      if (!nameNode) {
        continue;
      }
      params.push({
        name: nameNode.getText(),
        description: escapeJsDocTextForMdx(
          stripParamSeparator(extractJsDocTagComment(tag)),
        ),
      });
    } else if (tagName === 'returns' || tagName === 'return') {
      returns = escapeJsDocTextForMdx(extractJsDocTagComment(tag));
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
function isDeprecated(node: JSDocableNode): boolean {
  return node
    .getJsDocs()
    .flatMap((jsDoc) => jsDoc.getTags())
    .some((tag) => tag.getTagName() === 'deprecated');
}

// ---------------------------------------------------------------------------
// Type-resolution helpers (powered by ts-morph's type checker)
// ---------------------------------------------------------------------------

/**
 * Resolve a TemplateLiteralTypeNode (e.g. `` `${typeof X}:foo` ``) to its
 * concrete string value, using the type checker to follow `typeof X` to its
 * literal type. Returns null if the type checker can't reduce it to a single
 * string literal.
 *
 * @param node - The template literal type node.
 * @returns The resolved string, or null.
 */
function resolveTemplateLiteralType(
  node: TemplateLiteralTypeNode,
): string | null {
  const type = node.getType();
  if (type.isStringLiteral()) {
    return type.getLiteralValueOrThrow() as string;
  }
  // istanbul ignore next: messenger fixtures always reduce template literal
  // types to a single string literal via `typeof X` constants.
  return null;
}

/**
 * Resolve a capability-type-constructor's first generic argument to a
 * namespace string. Accepts either `typeof X` (resolved via the type checker)
 * or a string literal.
 *
 * @param typeArg - The first generic argument node.
 * @returns The resolved namespace, or null.
 */
function resolveNamespaceFromTypeArg(typeArg: TsMorphNode): string | null {
  if (NodeGuards.isTypeQuery(typeArg)) {
    const type = typeArg.getType();
    if (type.isStringLiteral()) {
      return type.getLiteralValueOrThrow() as string;
    }
  }
  if (NodeGuards.isLiteralTypeNode(typeArg)) {
    const literal = typeArg.getLiteral();
    // istanbul ignore else: only string literals are valid namespace args.
    if (NodeGuards.isStringLiteral(literal)) {
      return literal.getLiteralValue();
    }
  }
  // istanbul ignore next: namespace args are always a `typeof X` query or a
  // string literal in valid messenger usage.
  return null;
}

/**
 * If `typeNode` is `Class['method']`, resolve `Class` to its declaration
 * (across files if needed via the type checker) and look up the method by
 * name. Returns the method declaration when found.
 *
 * @param typeNode - The handler's type node.
 * @returns The method declaration, or null.
 */
function resolveIndexedAccessMethod(
  typeNode: TypeNode | undefined,
): MethodDeclaration | null {
  if (!typeNode || !NodeGuards.isIndexedAccessTypeNode(typeNode)) {
    return null;
  }
  const objectType = typeNode.getObjectTypeNode();
  const indexType = typeNode.getIndexTypeNode();

  // istanbul ignore next: handler indexed-access types in messenger fixtures
  // always reference a class via TypeReference.
  if (!NodeGuards.isTypeReference(objectType)) {
    return null;
  }
  // istanbul ignore next: the index in `Class['method']` is always a literal
  // type node in valid handler syntax.
  if (!NodeGuards.isLiteralTypeNode(indexType)) {
    return null;
  }
  const indexLiteral = indexType.getLiteral();
  // The index can be written as `'method'`, `"method"`, or `` `method` ``.
  // The first two land as `StringLiteral`; the bare template literal is a
  // `NoSubstitutionTemplateLiteral`.
  // istanbul ignore next: numeric/boolean indices aren't valid method names.
  if (
    !NodeGuards.isStringLiteral(indexLiteral) &&
    !NodeGuards.isNoSubstitutionTemplateLiteral(indexLiteral)
  ) {
    return null;
  }
  const methodName = indexLiteral.getLiteralValue();

  const classNameNode = objectType.getTypeName();
  // istanbul ignore next: qualified-name class references aren't used in
  // messenger handler types.
  if (!NodeGuards.isIdentifier(classNameNode)) {
    return null;
  }
  const localSymbol = classNameNode.getSymbol();
  // istanbul ignore next: a referenced class name always resolves to a symbol
  // in a typechecked project.
  if (!localSymbol) {
    return null;
  }
  // Follow the import alias (if any) so we can find the class declaration in
  // its home file.
  const symbol = localSymbol.getAliasedSymbol() ?? localSymbol;

  // istanbul ignore next: a resolved symbol always exposes its declarations
  // array in a typechecked project.
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (NodeGuards.isClassDeclaration(declaration)) {
      const method = declaration.getMethod(methodName);
      if (method) {
        return method;
      }
    }
  }
  // istanbul ignore next: only reached if the indexed method isn't declared
  // on any of the resolved class declarations, which doesn't happen in valid
  // handler types.
  return null;
}

// ---------------------------------------------------------------------------
// Method info
// ---------------------------------------------------------------------------

/**
 * Build a {@link MethodInfo} record for a class method — its textual
 * signature plus the JSDoc description, `@param`, and `@returns` extracted
 * from the method itself.
 *
 * @param method - The method declaration.
 * @returns The method info.
 */
function buildMethodInfo(method: MethodDeclaration): MethodInfo {
  const signatureParams = method
    .getParameters()
    .map((param) => {
      const paramName = param.getNameNode().getText();
      const optional = param.hasQuestionToken() ? '?' : '';
      const typeNode = param.getTypeNode();
      // istanbul ignore next: handler parameters in messenger fixtures always
      // declare an explicit type.
      const paramType = typeNode ? typeNode.getText() : 'unknown';
      return `${paramName}${optional}: ${paramType}`;
    })
    .join(', ');

  const returnTypeNode = method.getReturnTypeNode();
  // istanbul ignore next: handler class methods in messenger fixtures always
  // declare an explicit return type.
  const returnType = returnTypeNode ? returnTypeNode.getText() : 'void';
  // For async methods, the declared return type already includes `Promise<>`,
  // so we don't need to wrap again.
  const signature = `(${signatureParams}) => ${returnType}`;

  const { description, params, returns } = extractJsDoc(method);

  return { jsDoc: description, params, returns, signature };
}

// ---------------------------------------------------------------------------
// Messenger discovery
// ---------------------------------------------------------------------------

/**
 * A capability type declared somewhere reachable from a `*Messenger`, along
 * with the kind (action/event) it was found under.
 */
type MessengerCapabilityTypeDeclaration = {
  statement: TypeAliasDeclaration | InterfaceDeclaration;
  kind: 'action' | 'event';
};

/**
 * Find every `*Messenger` type alias in a source file, parse its
 * `Messenger<Namespace, Actions, Events>` generic arguments, and return the
 * capability-type declarations referenced from the Actions and Events slots
 * — paired with the kind under which they were referenced.
 *
 * The walker follows imported references via ts-morph's symbol resolution,
 * so capability types declared in sibling files (e.g. the auto-generated
 * `*-method-action-types.ts` files) are discovered even though only the
 * `*Messenger` declaration is local to this file.
 *
 * @param sourceFile - The TypeScript source file to scan.
 * @returns The list of locally- and transitively-referenced capability types.
 */
function collectMessengerCapabilityTypeDeclarations(
  sourceFile: SourceFile,
): MessengerCapabilityTypeDeclaration[] {
  const declarations: MessengerCapabilityTypeDeclaration[] = [];
  const seen = new Set<TsMorphNode>();

  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (!typeAlias.getName().endsWith('Messenger')) {
      continue;
    }
    const body = typeAlias.getTypeNode();
    if (!body || !NodeGuards.isTypeReference(body)) {
      continue;
    }
    const typeArgs = body.getTypeArguments();
    if (typeArgs.length < 3) {
      continue;
    }

    walkCapabilityTypes(typeArgs[1], 'action', declarations, seen);
    walkCapabilityTypes(typeArgs[2], 'event', declarations, seen);
  }

  return declarations;
}

/**
 * Walk an Actions or Events type-argument tree and append the underlying
 * capability-type declarations to `output`. Unions are expanded. Type
 * references are resolved via ts-morph's symbol resolution (so imported
 * names are followed across files); a resolved alias whose body is itself a
 * union expands transparently, leaving the intermediate alias unrecorded.
 *
 * A resolved alias whose body is a single non-union type reference (e.g.
 * `type AllowedActions = ConnectivityControllerGetStateAction`) is treated
 * as an opaque re-export — the walk stops there, leaving the target to be
 * documented from its home package by the dedup logic later.
 *
 * For example, given:
 *
 * ```typescript
 * // NetworkController.ts
 * import type { NetworkControllerMethodActions } from './NetworkController-method-action-types';
 * type NetworkControllerActions =
 *   | NetworkControllerGetStateAction
 *   | NetworkControllerMethodActions;
 * type NetworkControllerMessenger = Messenger<typeof name, NetworkControllerActions, ...>;
 *
 * // NetworkController-method-action-types.ts
 * export type NetworkControllerAddNetworkAction = {
 *   type: 'NetworkController:addNetwork';
 *   handler: NetworkController['addNetwork'];
 * };
 * // ... more ...
 * export type NetworkControllerMethodActions =
 *   | NetworkControllerAddNetworkAction
 *   | ...;
 * ```
 *
 * walking the Actions slot yields each individual `NetworkController*Action`
 * declaration — both the local `NetworkControllerGetStateAction` and the
 * cross-file ones reached via `NetworkControllerMethodActions`.
 *
 * @param node - The Actions or Events type-argument node to walk.
 * @param kind - Whether to tag found declarations as 'action' or 'event'.
 * @param output - The list to append discovered declarations to.
 * @param seen - Declaration nodes already visited (prevents cycles and
 * duplicate work).
 */
function walkCapabilityTypes(
  node: TsMorphNode,
  kind: 'action' | 'event',
  output: MessengerCapabilityTypeDeclaration[],
  seen: Set<TsMorphNode>,
): void {
  if (NodeGuards.isUnionTypeNode(node)) {
    for (const member of node.getTypeNodes()) {
      walkCapabilityTypes(member, kind, output, seen);
    }
    return;
  }

  if (!NodeGuards.isTypeReference(node)) {
    return;
  }
  const nameNode = node.getTypeName();
  // istanbul ignore next: qualified-name references aren't used in messenger
  // generic arguments.
  if (!NodeGuards.isIdentifier(nameNode)) {
    return;
  }
  // For a TypeReference whose name was imported, `getSymbol()` returns the
  // import alias symbol — its only declaration is the `ImportSpecifier`.
  // `getAliasedSymbol()` follows the alias to the original declaration in
  // the imported file. Use it when present; otherwise fall back to the
  // (already-local) symbol.
  const localSymbol = nameNode.getSymbol();
  // istanbul ignore next: a referenced type name always resolves to a symbol
  // in a typechecked project.
  if (!localSymbol) {
    return;
  }
  const symbol = localSymbol.getAliasedSymbol() ?? localSymbol;

  // istanbul ignore next: a resolved symbol always exposes its declarations
  // array in a typechecked project.
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (seen.has(declaration)) {
      continue;
    }
    seen.add(declaration);

    if (NodeGuards.isTypeAliasDeclaration(declaration)) {
      const aliasBody = declaration.getTypeNode();
      if (aliasBody && NodeGuards.isUnionTypeNode(aliasBody)) {
        // Umbrella union — descend through it without documenting the alias.
        walkCapabilityTypes(aliasBody, kind, output, seen);
        continue;
      }
      // A bare TypeReference body with no type arguments (e.g.
      // `type AllowedActions = ConnectivityControllerGetStateAction`) is a
      // plain re-export — leave the target to be documented from its home
      // package, not this one. TypeReferences *with* type arguments are
      // capability-type-constructor invocations (e.g.
      // `ControllerGetStateAction<typeof name, State>`) and are recorded.
      if (
        aliasBody &&
        NodeGuards.isTypeReference(aliasBody) &&
        aliasBody.getTypeArguments().length === 0
      ) {
        continue;
      }
      // TypeLiteral body, capability-type-constructor invocation, etc.
      output.push({ statement: declaration, kind });
    } else if (NodeGuards.isInterfaceDeclaration(declaration)) {
      output.push({ statement: declaration, kind });
    }
  }
}

// ---------------------------------------------------------------------------
// Per-statement extraction
// ---------------------------------------------------------------------------

/**
 * Extract a single capability-type declaration to an
 * {@link ExtractedMessengerCapabilityType}.
 *
 * @param statement - The type alias or interface declaration.
 * @param kind - Whether this statement is referenced as an action or an event.
 * @param projectPath - Project root, used for computing relative source paths.
 * @returns The extracted capability, or null if no recognized pattern matches.
 */
function extractFromMessengerCapabilityType(
  statement: TypeAliasDeclaration | InterfaceDeclaration,
  kind: 'action' | 'event',
  projectPath: string,
): ExtractedMessengerCapabilityType | null {
  const inlineCapability = extractFromInlineMessengerCapabilityType(
    statement,
    kind,
    projectPath,
  );
  if (inlineCapability) {
    return inlineCapability;
  }

  if (NodeGuards.isTypeAliasDeclaration(statement)) {
    return extractFromCapabilityTypeConstructor(statement, kind, projectPath);
  }

  // istanbul ignore next: interface declarations always have members and
  // therefore an inline shape, so the inline branch above always returns
  // non-null here.
  return null;
}

/**
 * Try the inline messenger-capability-type pattern:
 * `{ type: '...'; handler: ... }` (action) or
 * `{ type: '...'; payload: ... }` (event), expressed as either a type alias
 * body or an interface body.
 *
 * @param statement - The type alias or interface declaration.
 * @param kind - The expected kind (action or event).
 * @param projectPath - Project root, used for computing relative source paths.
 * @returns The extracted capability, or null if the shape doesn't match.
 */
function extractFromInlineMessengerCapabilityType(
  statement: TypeAliasDeclaration | InterfaceDeclaration,
  kind: 'action' | 'event',
  projectPath: string,
): ExtractedMessengerCapabilityType | null {
  let members: TypeElementTypes[] | undefined;
  if (NodeGuards.isTypeAliasDeclaration(statement)) {
    const body = statement.getTypeNode();
    if (body && NodeGuards.isTypeLiteral(body)) {
      members = body.getMembers();
    }
  } else {
    members = statement.getMembers();
  }
  if (!members) {
    return null;
  }

  const typeString = resolveInlineTypeString(members);
  // istanbul ignore next: capabilities reachable via the messenger walk
  // always have a resolvable `Namespace:name` type string.
  if (!typeString?.includes(':')) {
    return null;
  }

  const handlerMember = getPropertyMember(members, 'handler');
  const payloadMember = getPropertyMember(members, 'payload');
  const rawSourceMember = kind === 'action' ? handlerMember : payloadMember;
  // istanbul ignore next: actions always have `handler` and events always
  // have `payload`; the messenger walk wouldn't have surfaced this
  // declaration otherwise.
  if (!rawSourceMember) {
    return null;
  }
  const rawSourceTypeNode = rawSourceMember.getTypeNode();
  // istanbul ignore next: property signatures we care about always have an
  // explicit type.
  if (!rawSourceTypeNode) {
    return null;
  }

  let handlerOrPayload = rawSourceTypeNode.getText().trim();
  let { description: jsDoc, params, returns } = extractJsDoc(statement);

  // For actions, if the handler resolves to a class method (`Class['method']`
  // — possibly in another file), inherit its signature plus any JSDoc fields
  // the type alias itself doesn't already provide.
  if (kind === 'action') {
    const resolvedMethod = resolveIndexedAccessMethod(rawSourceTypeNode);
    if (resolvedMethod) {
      const info = buildMethodInfo(resolvedMethod);
      handlerOrPayload = info.signature;
      if (!jsDoc && info.jsDoc) {
        jsDoc = info.jsDoc;
      }
      if (params.length === 0 && info.params.length > 0) {
        params = info.params;
      }
      if (!returns && info.returns) {
        returns = info.returns;
      }
    }
  }

  const sourceFile = statement.getSourceFile();
  return {
    typeName: statement.getName(),
    typeString,
    kind,
    jsDoc,
    params,
    returns,
    handlerOrPayload,
    sourceFile: path.relative(projectPath, sourceFile.getFilePath()),
    line: statement.getStartLineNumber(),
    deprecated: isDeprecated(statement),
  };
}

/**
 * Resolve the literal value of an inline shape's `type` property — either a
 * direct string literal or a template literal type with `typeof X`
 * substitutions (resolved via the type checker).
 *
 * @param members - The type elements of the inline shape.
 * @returns The resolved type string, or null if it can't be resolved.
 */
function resolveInlineTypeString(members: TypeElementTypes[]): string | null {
  for (const member of members) {
    // istanbul ignore next: capability-type bodies only contain property
    // signatures.
    if (!NodeGuards.isPropertySignature(member)) {
      continue;
    }
    const memberNameNode = member.getNameNode();
    if (
      // istanbul ignore next: `type` is always a plain identifier.
      !NodeGuards.isIdentifier(memberNameNode) ||
      memberNameNode.getText() !== 'type'
    ) {
      continue;
    }
    const typeNode = member.getTypeNode();
    // istanbul ignore next: a `type` property without an explicit type
    // wouldn't compile.
    if (!typeNode) {
      continue;
    }
    if (NodeGuards.isLiteralTypeNode(typeNode)) {
      const literal = typeNode.getLiteral();
      // istanbul ignore next: messenger `type` fields are written as
      // quoted string literals in real fixtures; backtick template literals
      // are valid TypeScript but don't appear in practice.
      if (
        NodeGuards.isStringLiteral(literal) ||
        NodeGuards.isNoSubstitutionTemplateLiteral(literal)
      ) {
        return literal.getLiteralValue();
      }
      // istanbul ignore next: numeric/boolean literal types aren't valid as a
      // messenger `type` and don't appear in real fixtures.
      return null;
    }
    if (NodeGuards.isTemplateLiteralTypeNode(typeNode)) {
      return resolveTemplateLiteralType(typeNode);
    }
  }
  // istanbul ignore next: the inline shape always has a `type` member that
  // produces either a literal or template-literal type.
  return null;
}

/**
 * Find the `PropertySignature` named `propName` in a type literal body.
 *
 * @param members - The type literal members to search.
 * @param propName - The property name to find.
 * @returns The property signature, or null.
 */
function getPropertyMember(
  members: TypeElementTypes[],
  propName: string,
): PropertySignature | null {
  for (const member of members) {
    // istanbul ignore next: capability-type bodies only contain property
    // signatures.
    if (!NodeGuards.isPropertySignature(member)) {
      continue;
    }
    const memberNameNode = member.getNameNode();
    if (
      // istanbul ignore next: capability properties always have identifier names.
      !NodeGuards.isIdentifier(memberNameNode) ||
      memberNameNode.getText() !== propName
    ) {
      continue;
    }
    return member;
  }
  return null;
}

/**
 * Try the capability-type-constructor pattern:
 * `ControllerGetStateAction<typeof X, State>` for actions, or
 * `ControllerStateChangeEvent<typeof X, State>` for events.
 *
 * @param statement - The type alias declaration.
 * @param kind - The expected kind (action or event).
 * @param projectPath - Project root, used for computing relative source paths.
 * @returns The extracted capability, or null if the constructor doesn't match.
 */
function extractFromCapabilityTypeConstructor(
  statement: TypeAliasDeclaration,
  kind: 'action' | 'event',
  projectPath: string,
): ExtractedMessengerCapabilityType | null {
  const aliasBody = statement.getTypeNode();
  // istanbul ignore next: walker only records aliases whose body matches.
  if (!aliasBody || !NodeGuards.isTypeReference(aliasBody)) {
    return null;
  }
  const nameNode = aliasBody.getTypeName();
  // istanbul ignore next: qualified-name type references aren't used.
  if (!NodeGuards.isIdentifier(nameNode)) {
    return null;
  }
  const constructorName = nameNode.getText();
  const typeArgs = aliasBody.getTypeArguments();
  if (typeArgs.length < 2) {
    return null;
  }

  const expectedConstructor =
    kind === 'action'
      ? 'ControllerGetStateAction'
      : 'ControllerStateChangeEvent';
  if (constructorName !== expectedConstructor) {
    return null;
  }

  const namespace = resolveNamespaceFromTypeArg(typeArgs[0]);
  // istanbul ignore next: recognized constructors always have resolvable args.
  if (!namespace) {
    return null;
  }
  const stateArgText = typeArgs[1].getText();
  const { description, params, returns } = extractJsDoc(statement);

  const sourceFile = statement.getSourceFile();
  return {
    typeName: statement.getName(),
    typeString:
      kind === 'action' ? `${namespace}:getState` : `${namespace}:stateChange`,
    kind,
    jsDoc: description,
    params,
    returns,
    handlerOrPayload:
      kind === 'action'
        ? `() => ${stateArgText}`
        : `[${stateArgText}, Patch[]]`,
    sourceFile: path.relative(projectPath, sourceFile.getFilePath()),
    line: statement.getStartLineNumber(),
    deprecated: isDeprecated(statement),
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
 * Extract every messenger action/event type reachable from a single source
 * file's `*Messenger` declarations.
 *
 * The caller is responsible for ensuring `sourceFile` (plus any files it
 * imports from) belongs to a ts-morph Project so cross-file symbol resolution
 * works.
 *
 * @param sourceFile - The TypeScript source file to extract from.
 * @param projectPath - Project root, used for computing relative source paths.
 * @returns The extracted capability list.
 */
export function extractFromSourceFile(
  sourceFile: SourceFile,
  projectPath: string,
): ExtractedMessengerCapabilityType[] {
  const declarations = collectMessengerCapabilityTypeDeclarations(sourceFile);
  if (declarations.length === 0) {
    return [];
  }

  const items: ExtractedMessengerCapabilityType[] = [];
  for (const { statement, kind } of declarations) {
    const item = extractFromMessengerCapabilityType(
      statement,
      kind,
      projectPath,
    );
    if (item) {
      items.push(item);
    }
  }
  return items;
}

/**
 * Convenience wrapper: extract from a single file by path. Loads the file
 * and any sibling files in its parent directory into a fresh Project so
 * relative imports resolve.
 *
 * For batch operations across many files, prefer
 * {@link createExtractionProject} + {@link extractFromSourceFile} so one
 * Project amortizes the type-checker setup across the whole run.
 *
 * @param filePath - The absolute path to the TypeScript file.
 * @param projectPath - Base path for computing relative source paths.
 * @returns A promise that resolves to the extracted capability list.
 */
export async function extractFromFile(
  filePath: string,
  projectPath: string,
): Promise<ExtractedMessengerCapabilityType[]> {
  const project = createExtractionProject();
  const parentDir = path.dirname(filePath);
  // Load the file's directory so single-hop relative imports resolve.
  project.addSourceFilesAtPaths([
    path.join(parentDir, '**/*.ts'),
    path.join(parentDir, '**/*.d.cts'),
  ]);
  const sourceFile = project.getSourceFile(filePath);
  // istanbul ignore next: the path always exists since the caller just
  // wrote the file or it was scanned from disk.
  if (!sourceFile) {
    return [];
  }
  return extractFromSourceFile(sourceFile, projectPath);
}
