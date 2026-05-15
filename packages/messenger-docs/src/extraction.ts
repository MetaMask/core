import { fileExists } from '@metamask/utils/node';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  Expression,
  InterfaceDeclaration,
  JSDocableNode,
  JSDocTag,
  Node as TsMorphNode,
  SourceFile,
  TemplateLiteralTypeNode,
  TypeAliasDeclaration,
  TypeElementTypes,
} from 'ts-morph';
import { Node as NodeGuards, Project, SyntaxKind, ts } from 'ts-morph';

import type { ExtractedMessengerCapabilityType, MethodInfo } from './types';

/**
 * Extract string constants from top-level variable declarations in a source file.
 * Only looks at top-level `const x = 'string'` or `const x = 'string' as const`.
 *
 * @param sourceFile - The TypeScript source file to extract constants from.
 * @returns A map of constant name to string value.
 */
function extractStringConstants(sourceFile: SourceFile): Map<string, string> {
  const names = new Map<string, string>();

  for (const statement of sourceFile.getVariableStatements()) {
    for (const declaration of statement.getDeclarations()) {
      const name = declaration.getNameNode();
      if (!NodeGuards.isIdentifier(name)) {
        continue;
      }

      const initializer = declaration.getInitializer();
      if (initializer) {
        if (NodeGuards.isStringLiteral(initializer)) {
          names.set(name.getText(), initializer.getLiteralValue());
        } else if (NodeGuards.isAsExpression(initializer)) {
          const inner = initializer.getExpression();
          if (NodeGuards.isStringLiteral(inner)) {
            names.set(name.getText(), inner.getLiteralValue());
          }
        }
      } else {
        // Handle `declare const x: "value"` (common in .d.cts files)
        const typeNode = declaration.getTypeNode();
        if (typeNode && NodeGuards.isLiteralTypeNode(typeNode)) {
          const literal = typeNode.getLiteral();
          if (NodeGuards.isStringLiteral(literal)) {
            names.set(name.getText(), literal.getLiteralValue());
          }
        }
      }
    }
  }

  return names;
}

/**
 * Collect every top-level string constant that is visible from a source file:
 * those declared in the file itself, plus those imported from single-hop local
 * modules (e.g. `import { CONTROLLER_NAME } from './constants'`). Transitive
 * imports are intentionally not followed.
 *
 * The resulting map is later used to resolve `typeof X` references inside
 * messenger action and event type template strings — when an action type
 * declares `type: \`${typeof CONTROLLER_NAME}:getState\``, we need to know the
 * string value of `CONTROLLER_NAME` to render the namespace.
 *
 * The collection is broad on purpose: we don't filter by name (e.g. "looks
 * like a controller name") because messenger client namespaces follow no fixed
 * naming convention, and the extra entries are harmless — downstream resolvers
 * only look up names that actually appear in messenger type strings.
 *
 * @param project - The ts-morph project to add imported source files to.
 * @param sourceFile - The TypeScript source file to search.
 * @param filePath - The absolute path of the source file on disk.
 * @returns A promise that resolves to a map of constant name to resolved string value.
 */
async function collectStringConstants(
  project: Project,
  sourceFile: SourceFile,
  filePath: string,
): Promise<Map<string, string>> {
  const names = extractStringConstants(sourceFile);

  // Chase single-hop local imports (no further recursion):
  //   import { BRIDGE_CONTROLLER_NAME } from './constants/bridge';
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const spec = importDeclaration.getModuleSpecifierValue();
    if (!spec?.startsWith('.') || spec.endsWith('.json')) {
      continue;
    }

    const dir = path.dirname(filePath);
    const isDts = filePath.endsWith('.d.cts') || filePath.endsWith('.d.ts');
    // Strip .cjs/.js extension from specifier for .d.cts resolution
    const bareSpec = spec.replace(/\.(c|m)?js$/u, '');
    const candidates = isDts
      ? [
          path.join(dir, `${bareSpec}.d.cts`),
          path.join(dir, bareSpec, 'index.d.cts'),
          path.join(dir, `${bareSpec}.d.ts`),
          path.join(dir, bareSpec, 'index.d.ts'),
        ]
      : [
          path.join(dir, `${bareSpec}.ts`),
          path.join(dir, bareSpec, 'index.ts'),
        ];

    for (const candidate of candidates) {
      if (!(await fileExists(candidate))) {
        continue;
      }

      const content = await fs.readFile(candidate, 'utf8');
      const importedSourceFile =
        project.getSourceFile(candidate) ??
        project.createSourceFile(candidate, content, { overwrite: true });
      // Only extract constants — do NOT follow further imports
      const imported = extractStringConstants(importedSourceFile);

      const namedImports = importDeclaration.getNamedImports();
      for (const element of namedImports) {
        const importedName = element.getNameNode().getText();
        const aliasNode = element.getAliasNode();
        const localName = aliasNode ? aliasNode.getText() : importedName;
        const value = imported.get(importedName);
        if (value !== undefined) {
          names.set(localName, value);
        }
      }
      break;
    }
  }

  return names;
}

/**
 * Resolve a `LiteralTypeNode`'s literal child to a string value. The only
 * literal kinds that produce a usable namespace-style action/event type are
 * string literals and bare template literals (`'Foo:bar'` and
 * `` `Foo:bar` ``); everything else (numeric, boolean, null, prefix-unary)
 * isn't a valid messenger type string.
 *
 * Template literals with substitutions (e.g. `` `${typeof X}:foo` ``) appear
 * as `TemplateLiteralTypeNode` in type position, not as a child of
 * `LiteralTypeNode`, so they're handled by {@link resolveTemplateLiteralType}.
 *
 * @param node - The literal child of a `LiteralTypeNode`.
 * @returns The resolved string value, or null if the literal kind isn't usable.
 */
function resolveTypeString(node: Expression): string | null {
  if (
    NodeGuards.isStringLiteral(node) ||
    NodeGuards.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralValue();
  }
  // istanbul ignore next: numeric/boolean literal types aren't valid as a
  // messenger `type` and don't appear in real fixtures.
  return null;
}

/**
 * Resolve a TemplateLiteralTypeNode (used in type positions like
 * `type: \`${typeof controllerName}:name\``) to its string value.
 *
 * @param node - The template literal type node to resolve.
 * @param constants - A map of known constant names to their string values.
 * @returns The resolved string value, or null if unresolvable.
 */
function resolveTemplateLiteralType(
  node: TemplateLiteralTypeNode,
  constants: Map<string, string>,
): string | null {
  // ts-morph wraps `TemplateLiteralTypeSpan` awkwardly here, so we drop down to
  // the raw compiler nodes to access each span's `type` and `literal`.
  const { compilerNode } = node;
  let result = compilerNode.head.text;

  for (const span of compilerNode.templateSpans) {
    const typeNode = span.type;
    // In type position, `typeof X` is a TypeQueryNode. Other span shapes
    // (literal interpolations, qualified names) are valid TS but not used
    // in any of the messenger types we extract from, so we bail out.
    /* istanbul ignore if */
    if (typeNode.kind !== SyntaxKind.TypeQuery) {
      return null;
    }
    const { exprName } = typeNode as ts.TypeQueryNode;
    /* istanbul ignore if */
    if (exprName.kind !== SyntaxKind.Identifier) {
      return null;
    }
    const val = constants.get(exprName.text);
    /* istanbul ignore if */
    if (val === undefined) {
      return null;
    }
    result += val + span.literal.text;
  }

  return result;
}

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
  return (tag.getCommentText() ?? '').replace(/\s+/gu, ' ').trim();
}

/**
 * Extract cleaned JSDoc body text from a node:
 *
 * - the description (everything above the first tag) goes through verbatim,
 * - `@deprecated` tags are rendered as `**Deprecated:** <comment>` lines and
 *   appended after the description,
 * - all other tags (`@param`, `@returns`, `@see`, …) are dropped — their
 *   information is already present in the rendered handler/payload signature.
 *
 * Output is normalized for MDX (curly braces escaped, `{@link}` resolved).
 *
 * @param node - The AST node to extract JSDoc from.
 * @returns The cleaned JSDoc text, or empty string if none.
 */
function extractJsDocText(node: JSDocableNode): string {
  const jsDocs = node.getJsDocs();
  if (jsDocs.length === 0) {
    return '';
  }

  const jsDoc = jsDocs[0];
  const description = jsDoc.getDescription().trim();

  const deprecatedLines: string[] = [];
  for (const tag of jsDoc.getTags()) {
    if (tag.getTagName() !== 'deprecated') {
      continue;
    }
    const comment = extractJsDocTagComment(tag);
    deprecatedLines.push(
      comment ? `**Deprecated:** ${comment}` : '**Deprecated:**',
    );
  }

  const combined = [description, ...deprecatedLines]
    .filter((line) => line.length > 0)
    .join('\n');

  return escapeJsDocTextForMdx(combined);
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

/**
 * Collect method info from all class declarations in a source file.
 * Returns a map keyed by "ClassName.methodName".
 *
 * @param sourceFile - The TypeScript source file to scan.
 * @returns A map of "ClassName.methodName" to method info.
 */
function collectClassMethods(sourceFile: SourceFile): Map<string, MethodInfo> {
  const methods = new Map<string, MethodInfo>();

  for (const classDeclaration of sourceFile.getClasses()) {
    const className = classDeclaration.getName();
    // istanbul ignore next: anonymous class expressions don't appear as
    // top-level declarations in controllers we extract from.
    if (!className) {
      continue;
    }

    for (const member of classDeclaration.getMembers()) {
      if (!NodeGuards.isMethodDeclaration(member)) {
        continue;
      }
      const memberNameNode = member.getNameNode();
      // istanbul ignore next: methods with computed property names
      // (e.g. `[Symbol.iterator]()`) aren't referenced from messenger
      // handler types.
      if (!NodeGuards.isIdentifier(memberNameNode)) {
        continue;
      }

      const methodName = memberNameNode.getText();

      // Build parameter list
      const params = member
        .getParameters()
        .map((param) => {
          const paramName = param.getNameNode().getText();
          const optional = param.hasQuestionToken() ? '?' : '';
          const typeNode = param.getTypeNode();
          const paramType = typeNode ? typeNode.getText() : 'unknown';
          return `${paramName}${optional}: ${paramType}`;
        })
        .join(', ');

      // Get return type
      const returnTypeNode = member.getReturnTypeNode();
      const returnType = returnTypeNode ? returnTypeNode.getText() : 'void';

      // For async methods, the declared return type already includes Promise<>,
      // so we don't need to wrap again.
      const methodSignature = `(${params}) => ${returnType}`;

      const jsDoc = extractJsDocText(member);

      methods.set(`${className}.${methodName}`, {
        jsDoc,
        signature: methodSignature,
      });
    }
  }

  return methods;
}

/**
 * If `handlerText` matches `ClassName['methodName']`, look it up in classMethodInfo
 * and return the resolved signature. Otherwise return the original text.
 *
 * @param handlerText - The raw handler text to resolve.
 * @param classMethods - A map of class methods collected from the source file.
 * @returns An object with the resolved signature and any associated JSDoc.
 */
function resolveHandler(
  handlerText: string,
  classMethods: Map<string, MethodInfo>,
): { signature: string; methodJsDoc: string } {
  const match = handlerText.match(/^(\w+)\['(\w+)'\]$/u);
  if (match) {
    const key = `${match[1]}.${match[2]}`;
    const info = classMethods.get(key);
    if (info) {
      return { signature: info.signature, methodJsDoc: info.jsDoc };
    }
  }
  return { signature: handlerText, methodJsDoc: '' };
}

/**
 * Get the raw source text for a property value inside a type literal.
 *
 * @param members - The type literal members to search.
 * @param propName - The property name to find.
 * @returns The raw text of the property type, or empty string if not found.
 */
function getPropertyText(
  members: TypeElementTypes[],
  propName: string,
): string {
  for (const member of members) {
    // istanbul ignore next: messenger capability-type bodies contain only
    // property signatures (`type`, `handler`, `payload`).
    if (!NodeGuards.isPropertySignature(member)) {
      continue;
    }
    const memberNameNode = member.getNameNode();
    if (
      // istanbul ignore next: `type`, `handler`, `payload` are always plain
      // identifiers in capability-type bodies.
      !NodeGuards.isIdentifier(memberNameNode) ||
      memberNameNode.getText() !== propName
    ) {
      continue;
    }
    const typeNode = member.getTypeNode();
    // istanbul ignore next: property signatures we care about always have
    // an explicit type.
    if (typeNode) {
      return typeNode.getText().trim();
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Messenger discovery
// ---------------------------------------------------------------------------

/**
 * A capability type declared in a source file, along with the kind
 * (action/event) it was found under in a Messenger declaration's type
 * arguments.
 */
type MessengerCapabilityTypeDeclaration = {
  statement: TypeAliasDeclaration | InterfaceDeclaration;
  kind: 'action' | 'event';
};

/**
 * Find every `*Messenger` type alias in a source file, parse its
 * `Messenger<Namespace, Actions, Events>` generic arguments, and return the
 * local capability-type declarations referenced from the Actions and Events
 * slots — paired with the kind under which they were referenced.
 *
 * Anchoring extraction on Messenger declarations avoids false positives from
 * unrelated types that happen to share an action/event-like shape. Returning
 * the AST nodes (rather than just names) lets the caller skip a second walk
 * over the source file's statements.
 *
 * @param sourceFile - The TypeScript source file to scan.
 * @returns The list of locally-declared capability types referenced by
 * messengers, each tagged with its kind.
 */
function collectMessengerCapabilityTypeDeclarations(
  sourceFile: SourceFile,
): MessengerCapabilityTypeDeclaration[] {
  const seen = new Set<string>();
  const declarations: MessengerCapabilityTypeDeclaration[] = [];

  const recordLocalDeclaration = (
    name: string,
    kind: 'action' | 'event',
  ): void => {
    if (seen.has(name)) {
      return;
    }
    const local =
      sourceFile.getTypeAlias(name) ?? sourceFile.getInterface(name);
    if (!local) {
      return;
    }
    seen.add(name);
    declarations.push({ statement: local, kind });
  };

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

    for (const name of collectNonUnionTypeNames(typeArgs[1], sourceFile)) {
      recordLocalDeclaration(name, 'action');
    }
    for (const name of collectNonUnionTypeNames(typeArgs[2], sourceFile)) {
      recordLocalDeclaration(name, 'event');
    }
  }

  return declarations;
}

/**
 * Walk an Actions or Events type-argument tree and return the names of the
 * underlying non-union type references. Unions are expanded into their
 * members; type references that resolve to a *local* union alias are also
 * expanded, so the intermediate alias name itself doesn't appear in the
 * result. Type references whose local alias body is anything other than a
 * union are treated as leaves.
 *
 * For example, given:
 *
 * ```typescript
 * type AccountsControllerActions =
 *   | AccountsControllerGetStateAction
 *   | AccountsControllerMethodActions;
 * type AccountsControllerMethodActions =
 *   | AccountsControllerGetAccountAction
 *   | AccountsControllerListAccountsAction;
 * type AllowedActions = KeyringControllerGetStateAction;
 *
 * type AccountsControllerMessenger = Messenger<
 *   typeof controllerName,
 *   AccountsControllerActions | AllowedActions,
 *   ...
 * >;
 * ```
 *
 * walking the Actions slot yields:
 *
 * - `AccountsControllerGetStateAction`,
 * - `AccountsControllerGetAccountAction`,
 * - `AccountsControllerListAccountsAction`,
 * - `AllowedActions` (its body is a single TypeReference, not a union, so the
 *   walk stops here — leaving `KeyringControllerGetStateAction` to be
 *   documented from its home package, not this one).
 *
 * @param node - The Actions or Events type-argument node to walk.
 * @param sourceFile - The containing source file, used to resolve aliases.
 * @returns The set of non-union type-reference names reached by the walk.
 */
function collectNonUnionTypeNames(
  node: TsMorphNode,
  sourceFile: SourceFile,
): Set<string> {
  const names = new Set<string>();
  const visited = new Set<string>();

  const visit = (current: TsMorphNode): void => {
    if (NodeGuards.isUnionTypeNode(current)) {
      for (const member of current.getTypeNodes()) {
        visit(member);
      }
      return;
    }

    if (!NodeGuards.isTypeReference(current)) {
      return;
    }

    const nameNode = current.getTypeName();
    // istanbul ignore next: qualified-name references like
    // `Namespace.Type` aren't used in messenger generic arguments.
    if (!NodeGuards.isIdentifier(nameNode)) {
      return;
    }
    const name = nameNode.getText();
    // istanbul ignore next: cycle guard — defensive, real messenger
    // unions don't recurse through themselves.
    if (visited.has(name)) {
      return;
    }
    visited.add(name);

    // If this name maps to a local union alias, descend through it without
    // recording the intermediate alias as an action/event type.
    const localAlias = sourceFile.getTypeAlias(name);
    const aliasBody = localAlias?.getTypeNode();
    if (aliasBody && NodeGuards.isUnionTypeNode(aliasBody)) {
      visit(aliasBody);
      return;
    }

    names.add(name);
  };

  visit(node);
  return names;
}

// ---------------------------------------------------------------------------
// Per-statement extraction
// ---------------------------------------------------------------------------

/**
 * Shared context passed to per-statement extraction helpers.
 */
type ExtractContext = {
  constants: Map<string, string>;
  classMethods: Map<string, MethodInfo>;
  relPath: string;
};

/**
 * Extract a single messenger item from a type alias or interface, given the
 * kind already determined from the messenger declaration. Returns null if
 * neither the inline messenger-capability-type nor the capability-type-
 * constructor patterns apply.
 *
 * @param statement - The type alias or interface declaration.
 * @param kind - Whether this statement is referenced as an action or an event.
 * @param context - Shared extraction context.
 * @returns The extracted capability, or null if no recognized pattern matches.
 */
function extractFromMessengerCapabilityType(
  statement: TypeAliasDeclaration | InterfaceDeclaration,
  kind: 'action' | 'event',
  context: ExtractContext,
): ExtractedMessengerCapabilityType | null {
  const inlineCapability = extractFromInlineMessengerCapabilityType(
    statement,
    kind,
    context,
  );
  if (inlineCapability) {
    return inlineCapability;
  }

  if (NodeGuards.isTypeAliasDeclaration(statement)) {
    return extractFromCapabilityTypeConstructor(statement, kind, context);
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
 * @param context - Shared extraction context.
 * @returns The extracted capability, or null if the shape doesn't match.
 */
function extractFromInlineMessengerCapabilityType(
  statement: TypeAliasDeclaration | InterfaceDeclaration,
  kind: 'action' | 'event',
  context: ExtractContext,
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

  const typeString = resolveInlineTypeString(members, context.constants);
  // istanbul ignore next: capabilities reachable via the messenger walk
  // always have a resolvable `Namespace:name` type string.
  if (!typeString?.includes(':')) {
    return null;
  }

  const handlerText = getPropertyText(members, 'handler');
  const payloadText = getPropertyText(members, 'payload');
  const rawSource = kind === 'action' ? handlerText : payloadText;
  // istanbul ignore next: actions always have `handler` and events always
  // have `payload`; the messenger walk wouldn't have surfaced this
  // declaration otherwise.
  if (!rawSource) {
    return null;
  }

  let handlerOrPayload = rawSource;
  let jsDoc = extractJsDocText(statement);
  if (kind === 'action') {
    const resolved = resolveHandler(handlerText, context.classMethods);
    handlerOrPayload = resolved.signature;
    if (!jsDoc && resolved.methodJsDoc) {
      jsDoc = resolved.methodJsDoc;
    }
  }

  return {
    typeName: statement.getName(),
    typeString,
    kind,
    jsDoc,
    handlerOrPayload,
    sourceFile: context.relPath,
    line: statement.getStartLineNumber(),
    deprecated: isDeprecated(statement),
  };
}

/**
 * Resolve the literal value of an inline shape's `type` property — either a
 * direct string literal or a template literal type that references known
 * constants.
 *
 * @param members - The type elements of the inline shape.
 * @param constants - Known string constants for resolving `typeof X` references.
 * @returns The resolved type string, or null if it can't be resolved.
 */
function resolveInlineTypeString(
  members: TypeElementTypes[],
  constants: Map<string, string>,
): string | null {
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
      return resolveTypeString(typeNode.getLiteral());
    }
    if (NodeGuards.isTemplateLiteralTypeNode(typeNode)) {
      return resolveTemplateLiteralType(typeNode, constants);
    }
  }
  // istanbul ignore next: the inline shape always has a `type` member
  // that produces either a literal or template-literal type.
  return null;
}

/**
 * Try the capability-type-constructor pattern:
 * `ControllerGetStateAction<typeof X, State>` for actions, or
 * `ControllerStateChangeEvent<typeof X, State>` for events. We don't have a
 * settled term for these — they're generic types in `@metamask/base-controller`
 * that you instantiate to declare a capability — but "type constructor" is
 * close.
 *
 * @param statement - The type alias declaration.
 * @param kind - The expected kind (action or event).
 * @param context - Shared extraction context.
 * @returns The extracted capability, or null if the constructor doesn't match.
 */
function extractFromCapabilityTypeConstructor(
  statement: TypeAliasDeclaration,
  kind: 'action' | 'event',
  context: ExtractContext,
): ExtractedMessengerCapabilityType | null {
  const aliasBody = statement.getTypeNode();
  // istanbul ignore next: type aliases without a body or that resolve to
  // non-type-reference forms don't reach this helper.
  if (!aliasBody || !NodeGuards.isTypeReference(aliasBody)) {
    return null;
  }
  const nameNode = aliasBody.getTypeName();
  // istanbul ignore next: qualified-name type references aren't used as
  // capability-type constructors.
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

  const namespace = resolveNamespaceFromTypeArg(typeArgs[0], context.constants);
  // istanbul ignore next: a recognized constructor whose first type
  // argument couldn't be resolved to a namespace string doesn't appear in
  // real source files.
  if (!namespace) {
    return null;
  }
  const stateArgText = typeArgs[1].getText();

  return {
    typeName: statement.getName(),
    typeString:
      kind === 'action' ? `${namespace}:getState` : `${namespace}:stateChange`,
    kind,
    jsDoc: extractJsDocText(statement),
    handlerOrPayload:
      kind === 'action'
        ? `() => ${stateArgText}`
        : `[${stateArgText}, Patch[]]`,
    sourceFile: context.relPath,
    line: statement.getStartLineNumber(),
    deprecated: isDeprecated(statement),
  };
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

/**
 * Extract messenger action/event type definitions from a single TypeScript
 * file. Only types referenced by a `*Messenger` declaration in the same file
 * are considered — this avoids false positives from unrelated types that
 * happen to share an action/event-like shape.
 *
 * @param filePath - The absolute path to the TypeScript file.
 * @param relBase - Base path for computing relative source paths.
 * @returns A promise that resolves to an array of extracted messenger item docs.
 */
export async function extractFromFile(
  filePath: string,
  relBase: string,
): Promise<ExtractedMessengerCapabilityType[]> {
  const content = await fs.readFile(filePath, 'utf8');
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });
  const sourceFile = project.createSourceFile(filePath, content, {
    overwrite: true,
  });

  const capabilityTypeDeclarations =
    collectMessengerCapabilityTypeDeclarations(sourceFile);
  if (capabilityTypeDeclarations.length === 0) {
    return [];
  }

  const context: ExtractContext = {
    constants: await collectStringConstants(project, sourceFile, filePath),
    classMethods: collectClassMethods(sourceFile),
    relPath: path.relative(relBase, filePath),
  };
  const capabilities: ExtractedMessengerCapabilityType[] = [];

  for (const { statement, kind } of capabilityTypeDeclarations) {
    const capability = extractFromMessengerCapabilityType(
      statement,
      kind,
      context,
    );
    if (capability) {
      capabilities.push(capability);
    }
  }

  return capabilities;
}

/**
 * Resolve the namespace string from the first type argument of a
 * `ControllerGetStateAction` or `ControllerStateChangeEvent`. Accepts either
 * `typeof someConstant` or a string literal.
 *
 * @param typeArg - The type argument node.
 * @param constants - A map of known constant names to their string values.
 * @returns The resolved namespace, or null if unresolvable.
 */
function resolveNamespaceFromTypeArg(
  typeArg: TsMorphNode,
  constants: Map<string, string>,
): string | null {
  if (NodeGuards.isTypeQuery(typeArg)) {
    const exprName = typeArg.getExprName();
    // istanbul ignore next: `typeof Foo.bar` isn't used in capability-type
    // constructor invocations.
    if (NodeGuards.isIdentifier(exprName)) {
      return constants.get(exprName.getText()) ?? null;
    }
  }
  if (NodeGuards.isLiteralTypeNode(typeArg)) {
    const literal = typeArg.getLiteral();
    // istanbul ignore next: defensive — only string literals are valid
    // namespace arguments.
    if (NodeGuards.isStringLiteral(literal)) {
      return literal.getLiteralValue();
    }
  }
  // istanbul ignore next: defensive — any other shape is meaningless here.
  return null;
}
