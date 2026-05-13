import { fileExists } from '@metamask/utils/node';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  Expression,
  InterfaceDeclaration,
  JSDocableNode,
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
    // In type position, `typeof X` is a TypeQueryNode
    if (typeNode.kind === SyntaxKind.TypeQuery) {
      const { exprName } = typeNode as ts.TypeQueryNode;
      if (exprName.kind === SyntaxKind.Identifier) {
        const val = constants.get(exprName.text);
        if (val === undefined) {
          return null;
        }
        result += val;
      } else {
        return null;
      }
    } else if (typeNode.kind === SyntaxKind.LiteralType) {
      const { literal } = typeNode as ts.LiteralTypeNode;
      if (literal.kind === SyntaxKind.StringLiteral) {
        result += (literal as ts.StringLiteral).text;
      } else {
        return null;
      }
    } else {
      return null;
    }
    result += span.literal.text;
  }

  return result;
}

/**
 * Extract cleaned JSDoc body text from a node.
 *
 * @param node - The AST node to extract JSDoc from.
 * @returns The cleaned JSDoc text, or empty string if none.
 */
function extractJsDocText(node: JSDocableNode): string {
  const jsDocs = node.getJsDocs();
  if (jsDocs.length === 0) {
    return '';
  }

  const raw = jsDocs[0].getText().trim();

  // Handle single-line JSDoc: /** Gets the current state. */
  const singleLineMatch = raw.match(/^\/\*\*\s*(.*?)\s*\*\/$/u);
  if (singleLineMatch) {
    let text = singleLineMatch[1].replace(/^\*\s*/u, '');
    // Handle tags in single-line JSDoc
    if (text.startsWith('@deprecated')) {
      const depText = text.slice('@deprecated'.length).trim();
      text = depText ? `**Deprecated:** ${depText}` : '';
    } else if (text.startsWith('@')) {
      // Strip other tags (@param, @returns, @see, @throws, etc.)
      return '';
    }
    // Apply same escaping as multi-line path
    text = text.replace(/\{@link\s+([^}]+)\}/gu, '`$1`');
    text = text.replace(/`[^`]*`|(\{)|(\})/gu, (match, open, close) => {
      if (open) {
        return '\\{';
      }
      if (close) {
        return '\\}';
      }
      return match;
    });
    return text || '';
  }

  // Strip comment delimiters, leading asterisks, and @param/@returns/@see tags
  const lines = raw.split('\n');
  const cleaned: string[] = [];
  const skippedTags = [
    '@param',
    '@returns',
    '@see',
    '@throws',
    '@template',
    '@example',
  ];
  let currentTag: 'skip' | 'deprecated' | null = null;
  let deprecatedParts: string[] = [];

  for (const rawLine of lines) {
    let trimmed = rawLine.trim();
    if (trimmed === '/**' || trimmed === '*/') {
      continue;
    }
    if (trimmed.startsWith('* ')) {
      trimmed = trimmed.slice(2);
    } else if (trimmed === '*') {
      trimmed = '';
    } else if (trimmed.startsWith('*')) {
      trimmed = trimmed.slice(1);
    }

    // Check if this line starts a new tag
    if (trimmed.startsWith('@')) {
      // Flush any accumulated deprecated text
      if (currentTag === 'deprecated' && deprecatedParts.length > 0) {
        cleaned.push(`**Deprecated:** ${deprecatedParts.join(' ')}`);
        deprecatedParts = [];
      }

      if (trimmed.startsWith('@deprecated')) {
        currentTag = 'deprecated';
        const depText = trimmed.slice('@deprecated'.length).trim();
        if (depText) {
          deprecatedParts.push(depText);
        }
        continue;
      }

      currentTag = skippedTags.some((tag) => trimmed.startsWith(tag))
        ? 'skip'
        : null;
      if (currentTag === 'skip') {
        continue;
      }
    } else if (currentTag === 'skip') {
      if (trimmed === '') {
        currentTag = null;
      } else {
        continue;
      }
    } else if (currentTag === 'deprecated') {
      if (trimmed === '') {
        // End of deprecated tag
        if (deprecatedParts.length > 0) {
          cleaned.push(`**Deprecated:** ${deprecatedParts.join(' ')}`);
          deprecatedParts = [];
        }
        currentTag = null;
      } else {
        deprecatedParts.push(trimmed);
        continue;
      }
    }

    cleaned.push(trimmed);
  }

  // Flush any remaining deprecated text
  if (deprecatedParts.length > 0) {
    cleaned.push(`**Deprecated:** ${deprecatedParts.join(' ')}`);
  }

  let result = cleaned.join('\n').trim();

  // Convert JSDoc {@link X} references to markdown backtick code
  result = result.replace(/\{@link\s+([^}]+)\}/gu, '`$1`');

  // Escape remaining curly braces for MDX safety (but not inside backtick code spans)
  result = result.replace(/`[^`]*`|(\{)|(\})/gu, (match, open, close) => {
    if (open) {
      return '\\{';
    }
    if (close) {
      return '\\}';
    }
    return match; // preserve content inside backticks
  });

  return result;
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
    if (!className) {
      continue;
    }

    for (const member of classDeclaration.getMembers()) {
      if (!NodeGuards.isMethodDeclaration(member)) {
        continue;
      }
      const memberNameNode = member.getNameNode();
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
    if (!NodeGuards.isPropertySignature(member)) {
      continue;
    }
    const memberNameNode = member.getNameNode();
    if (
      !NodeGuards.isIdentifier(memberNameNode) ||
      memberNameNode.getText() !== propName
    ) {
      continue;
    }
    const typeNode = member.getTypeNode();
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
    if (!NodeGuards.isIdentifier(nameNode)) {
      return;
    }
    const name = nameNode.getText();
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
  if (!typeString?.includes(':')) {
    return null;
  }

  const handlerText = getPropertyText(members, 'handler');
  const payloadText = getPropertyText(members, 'payload');
  const rawSource = kind === 'action' ? handlerText : payloadText;
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
    if (!NodeGuards.isPropertySignature(member)) {
      continue;
    }
    const memberNameNode = member.getNameNode();
    if (
      !NodeGuards.isIdentifier(memberNameNode) ||
      memberNameNode.getText() !== 'type'
    ) {
      continue;
    }
    const typeNode = member.getTypeNode();
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
  if (!aliasBody || !NodeGuards.isTypeReference(aliasBody)) {
    return null;
  }
  const nameNode = aliasBody.getTypeName();
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
    if (NodeGuards.isIdentifier(exprName)) {
      return constants.get(exprName.getText()) ?? null;
    }
  }
  if (NodeGuards.isLiteralTypeNode(typeArg)) {
    const literal = typeArg.getLiteral();
    if (NodeGuards.isStringLiteral(literal)) {
      return literal.getLiteralValue();
    }
  }
  return null;
}
