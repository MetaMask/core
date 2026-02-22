#!/usr/bin/env tsx
/* eslint-disable n/no-sync */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

type MessengerItemDoc = {
  typeName: string; // e.g. "NetworkControllerGetStateAction"
  typeString: string; // e.g. "NetworkController:getState"
  kind: 'action' | 'event';
  jsDoc: string; // Cleaned JSDoc body text (empty if none)
  handlerOrPayload: string; // Raw type text of handler / payload
  sourceFile: string; // Relative path from repo root
  line: number;
  deprecated: boolean;
};

type NamespaceGroup = {
  namespace: string;
  actions: MessengerItemDoc[];
  events: MessengerItemDoc[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');

/**
 * Extract string constants from top-level variable declarations in a source file.
 * Only looks at top-level `const x = 'string'` or `const x = 'string' as const`.
 *
 * @param sourceFile - The TypeScript source file to extract constants from.
 * @returns A map of constant name to string value.
 */
function extractStringConstants(
  sourceFile: ts.SourceFile,
): Map<string, string> {
  const names = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) {
        continue;
      }

      if (decl.initializer) {
        const init = decl.initializer;
        if (ts.isStringLiteral(init)) {
          names.set(decl.name.text, init.text);
        } else if (
          ts.isAsExpression(init) &&
          ts.isStringLiteral(init.expression)
        ) {
          names.set(decl.name.text, init.expression.text);
        }
      }

      // Handle `declare const x: "value"` (common in .d.cts files)
      if (
        !decl.initializer &&
        decl.type &&
        ts.isLiteralTypeNode(decl.type) &&
        ts.isStringLiteral(decl.type.literal)
      ) {
        names.set(decl.name.text, decl.type.literal.text);
      }
    }
  }

  return names;
}

/**
 * Resolve the value of `controllerName` (or similar constant) defined in the
 * same file or imported from a local `./constants*` module (single-hop only).
 *
 * @param sourceFile - The TypeScript source file to search.
 * @param filePath - The absolute path of the source file on disk.
 * @returns A map of constant name to resolved string value.
 */
function resolveControllerName(
  sourceFile: ts.SourceFile,
  filePath: string,
): Map<string, string> {
  const names = extractStringConstants(sourceFile);

  // Chase single-hop local imports (no further recursion):
  //   import { BRIDGE_CONTROLLER_NAME } from './constants/bridge';
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    const spec = statement.moduleSpecifier.text;
    if (!spec.startsWith('.')) {
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
      : [path.join(dir, `${spec}.ts`), path.join(dir, spec, 'index.ts')];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      const content = fs.readFileSync(candidate, 'utf8');
      const sf = ts.createSourceFile(
        candidate,
        content,
        ts.ScriptTarget.Latest,
        true,
      );
      // Only extract constants — do NOT follow further imports
      const imported = extractStringConstants(sf);

      if (
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const element of statement.importClause.namedBindings.elements) {
          const importedName = (element.propertyName ?? element.name).text;
          const localName = element.name.text;
          const value = imported.get(importedName);
          if (value !== undefined) {
            names.set(localName, value);
          }
        }
      }
      break;
    }
  }

  return names;
}

/**
 * Resolve a template-literal or string-literal `type` property to its string
 * value. Returns null if unresolvable.
 *
 * @param node - The expression node to resolve.
 * @param constants - A map of known constant names to their string values.
 * @returns The resolved string value, or null if unresolvable.
 */
function resolveTypeString(
  node: ts.Expression,
  constants: Map<string, string>,
): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      // typeof X  →  resolve X
      if (ts.isTypeOfExpression(span.expression)) {
        if (ts.isIdentifier(span.expression.expression)) {
          const val = constants.get(span.expression.expression.text);
          if (val === undefined) {
            return null;
          }
          result += val;
        } else {
          return null;
        }
      } else if (ts.isIdentifier(span.expression)) {
        const val = constants.get(span.expression.text);
        if (val === undefined) {
          return null;
        }
        result += val;
      } else {
        return null;
      }
      result += span.literal.text;
    }
    return result;
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
  node: ts.TemplateLiteralTypeNode,
  constants: Map<string, string>,
): string | null {
  let result = node.head.text;

  for (const span of node.templateSpans) {
    // In type position, `typeof X` is a TypeQueryNode
    if (ts.isTypeQueryNode(span.type) && ts.isIdentifier(span.type.exprName)) {
      const val = constants.get(span.type.exprName.text);
      if (val === undefined) {
        return null;
      }
      result += val;
    } else if (
      ts.isLiteralTypeNode(span.type) &&
      ts.isStringLiteral(span.type.literal)
    ) {
      result += span.type.literal.text;
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
 * @param sourceFile - The source file containing the node.
 * @returns The cleaned JSDoc text, or empty string if none.
 */
function extractJsDocText(node: ts.Node, sourceFile: ts.SourceFile): string {
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) {
    return '';
  }

  const jsDoc = jsDocs[0];
  if (!ts.isJSDoc(jsDoc)) {
    return '';
  }

  const fullText = sourceFile.getFullText();
  const raw = fullText.substring(jsDoc.getFullStart(), jsDoc.getEnd()).trim();

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
function isDeprecated(node: ts.Node): boolean {
  const tags = ts.getJSDocTags(node);
  return tags.some((tag) => tag.tagName.text === 'deprecated');
}

/**
 * Info about a class method, used to resolve `ClassName['methodName']` handlers.
 */
type MethodInfo = {
  jsDoc: string;
  signature: string; // e.g. "(fields: AddNetworkFields) => NetworkConfiguration"
};

/**
 * Collect method info from all class declarations in a source file.
 * Returns a map keyed by "ClassName.methodName".
 *
 * @param sourceFile - The TypeScript source file to scan.
 * @returns A map of "ClassName.methodName" to method info.
 */
function collectClassMethods(
  sourceFile: ts.SourceFile,
): Map<string, MethodInfo> {
  const methods = new Map<string, MethodInfo>();

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) {
      continue;
    }

    const className = statement.name.text;

    for (const member of statement.members) {
      if (
        !ts.isMethodDeclaration(member) ||
        !member.name ||
        !ts.isIdentifier(member.name)
      ) {
        continue;
      }

      const methodName = member.name.text;

      // Build parameter list
      const params = member.parameters
        .map((param) => {
          const paramName = param.name.getText(sourceFile);
          const optional = param.questionToken ? '?' : '';
          const paramType = param.type
            ? param.type.getText(sourceFile)
            : 'unknown';
          return `${paramName}${optional}: ${paramType}`;
        })
        .join(', ');

      // Get return type
      const returnType = member.type ? member.type.getText(sourceFile) : 'void';

      // For async methods, the declared return type already includes Promise<>,
      // so we don't need to wrap again.
      const methodSignature = `(${params}) => ${returnType}`;

      const jsDoc = extractJsDocText(member, sourceFile);

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
 * @param sourceFile - The source file for getText calls.
 * @returns The raw text of the property type, or empty string if not found.
 */
function getPropertyText(
  members: ts.NodeArray<ts.TypeElement>,
  propName: string,
  sourceFile: ts.SourceFile,
): string {
  for (const member of members) {
    if (
      ts.isPropertySignature(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.name.text === propName &&
      member.type
    ) {
      return member.type.getText(sourceFile).trim();
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

/**
 * Extract messenger action/event type definitions from a single TypeScript file.
 *
 * @param filePath - The absolute path to the TypeScript file.
 * @param relBase - Optional base path for computing relative source paths (defaults to ROOT).
 * @returns An array of extracted messenger item docs.
 */
function extractFromFile(
  filePath: string,
  relBase?: string,
): MessengerItemDoc[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const constants = resolveControllerName(sourceFile, filePath);
  const classMethods = collectClassMethods(sourceFile);
  const items: MessengerItemDoc[] = [];
  const relPath = path.relative(relBase ?? ROOT, filePath);

  // Type aliases are always top-level statements — no need for deep recursion
  for (const statement of sourceFile.statements) {
    // Handle `export type X = ...`
    let node: ts.TypeAliasDeclaration | undefined;
    if (ts.isTypeAliasDeclaration(statement)) {
      node = statement;
    }

    if (!node) {
      continue;
    }

    const typeName = node.name.text;
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    // -------------------------------------------------------------------
    // Pattern 1: Inline type literal  { type: '...'; handler/payload: ... }
    // -------------------------------------------------------------------
    if (ts.isTypeLiteralNode(node.type)) {
      const { members } = node.type;

      // Find `type` property
      let typeString: string | null = null;
      for (const member of members) {
        if (
          ts.isPropertySignature(member) &&
          member.name &&
          ts.isIdentifier(member.name) &&
          member.name.text === 'type' &&
          member.type
        ) {
          if (ts.isLiteralTypeNode(member.type)) {
            typeString = resolveTypeString(member.type.literal, constants);
          } else if (ts.isTemplateLiteralTypeNode(member.type)) {
            typeString = resolveTemplateLiteralType(member.type, constants);
          }
        }
      }

      if (!typeString?.includes(':')) {
        continue;
      }

      const handlerText = getPropertyText(members, 'handler', sourceFile);
      const payloadText = getPropertyText(members, 'payload', sourceFile);

      if (!handlerText && !payloadText) {
        continue;
      }

      const kind: 'action' | 'event' = handlerText ? 'action' : 'event';

      // For actions, resolve ClassName['methodName'] to actual signature + JSDoc
      let resolvedHandler = handlerText || payloadText;
      let typeAliasJsDoc = extractJsDocText(node, sourceFile);

      if (handlerText) {
        const resolved = resolveHandler(handlerText, classMethods);
        resolvedHandler = resolved.signature;
        // If the type alias has no JSDoc, use the method's JSDoc
        if (!typeAliasJsDoc && resolved.methodJsDoc) {
          typeAliasJsDoc = resolved.methodJsDoc;
        }
      }

      items.push({
        typeName,
        typeString,
        kind,
        jsDoc: typeAliasJsDoc,
        handlerOrPayload: resolvedHandler,
        sourceFile: relPath,
        line,
        deprecated: isDeprecated(node),
      });
    }

    // -------------------------------------------------------------------
    // Pattern 2: ControllerGetStateAction<typeof cn, State>
    // -------------------------------------------------------------------
    if (
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      node.type.typeName.text === 'ControllerGetStateAction' &&
      node.type.typeArguments &&
      node.type.typeArguments.length >= 2
    ) {
      const firstArg = node.type.typeArguments[0];
      const stateArg = node.type.typeArguments[1];
      let namespace: string | null = null;

      if (ts.isTypeQueryNode(firstArg) && ts.isIdentifier(firstArg.exprName)) {
        namespace = constants.get(firstArg.exprName.text) ?? null;
      }
      if (
        ts.isLiteralTypeNode(firstArg) &&
        ts.isStringLiteral(firstArg.literal)
      ) {
        namespace = firstArg.literal.text;
      }

      if (namespace) {
        items.push({
          typeName,
          typeString: `${namespace}:getState`,
          kind: 'action',
          jsDoc: extractJsDocText(node, sourceFile),
          handlerOrPayload: `() => ${stateArg.getText(sourceFile)}`,
          sourceFile: relPath,
          line,
          deprecated: isDeprecated(node),
        });
      }
    }

    // -------------------------------------------------------------------
    // Pattern 3: ControllerStateChangeEvent<typeof cn, State>
    // -------------------------------------------------------------------
    if (
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      node.type.typeName.text === 'ControllerStateChangeEvent' &&
      node.type.typeArguments &&
      node.type.typeArguments.length >= 2
    ) {
      const firstArg = node.type.typeArguments[0];
      const stateArg = node.type.typeArguments[1];
      let namespace: string | null = null;

      if (ts.isTypeQueryNode(firstArg) && ts.isIdentifier(firstArg.exprName)) {
        namespace = constants.get(firstArg.exprName.text) ?? null;
      }
      if (
        ts.isLiteralTypeNode(firstArg) &&
        ts.isStringLiteral(firstArg.literal)
      ) {
        namespace = firstArg.literal.text;
      }

      if (namespace) {
        items.push({
          typeName,
          typeString: `${namespace}:stateChange`,
          kind: 'event',
          jsDoc: extractJsDocText(node, sourceFile),
          handlerOrPayload: `[${stateArg.getText(sourceFile)}, Patch[]]`,
          sourceFile: relPath,
          line,
          deprecated: isDeprecated(node),
        });
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  '__tests__',
  'tests',
  'test',
  'node_modules',
  'dist',
  '__mocks__',
]);

/**
 * Recursively find all non-test TypeScript files in a directory.
 *
 * @param dir - The directory to search.
 * @returns An array of absolute file paths.
 */
function findTsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // Skip test dirs, node_modules, dist
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        walk(full);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test-d.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Recursively find all `.d.cts` declaration files in a directory.
 * Skips nested `node_modules` subdirectories.
 *
 * @param dir - The directory to search.
 * @returns An array of absolute file paths.
 */
function findDtsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          continue;
        }
        walk(full);
      } else if (entry.name.endsWith('.d.cts')) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Markdown generation
// ---------------------------------------------------------------------------

/**
 * Generate markdown documentation for a single messenger item.
 *
 * @param item - The messenger item to document.
 * @param clientMode - Whether we are generating docs from a client's dependency tree.
 * @returns The generated markdown string.
 */
function generateItemMarkdown(
  item: MessengerItemDoc,
  clientMode: boolean,
): string {
  const parts: string[] = [];

  parts.push(`### \`${item.typeString}\``);
  parts.push('');

  if (item.deprecated) {
    parts.push('> **Deprecated**');
    parts.push('');
  }

  if (clientMode) {
    const pkgMatch = item.sourceFile.match(/node_modules\/(@metamask\/[^/]+)/u);
    const pkgName = pkgMatch ? pkgMatch[1] : item.sourceFile;
    const npmUrl = `https://www.npmjs.com/package/${pkgName}`;
    parts.push(`**Package**: [\`${pkgName}\`](${npmUrl})`);
  } else {
    const ghUrl = `https://github.com/MetaMask/core/blob/main/${item.sourceFile}#L${item.line}`;
    parts.push(`**Source**: [${item.sourceFile}:${item.line}](${ghUrl})`);
  }
  parts.push('');

  if (item.jsDoc) {
    // Strip any @deprecated line from displayed doc (already shown as badge)
    const docText = item.jsDoc
      .split('\n')
      .filter((line) => !line.trim().startsWith('@deprecated'))
      .join('\n')
      .trim();
    if (docText) {
      parts.push(docText);
      parts.push('');
    }
  }

  const label = item.kind === 'action' ? 'Handler' : 'Payload';
  parts.push(`**${label}**:`);
  parts.push('');
  parts.push('```typescript');
  parts.push(item.handlerOrPayload);
  parts.push('```');
  parts.push('');

  return parts.join('\n');
}

/**
 * Generate a full markdown page for a namespace's actions or events.
 *
 * @param ns - The namespace group to generate a page for.
 * @param kind - Whether to generate the actions or events page.
 * @param clientMode - Whether we are generating docs from a client's dependency tree.
 * @returns The generated markdown string.
 */
function generateNamespacePage(
  ns: NamespaceGroup,
  kind: 'action' | 'event',
  clientMode: boolean,
): string {
  const items = kind === 'action' ? ns.actions : ns.events;
  const title = kind === 'action' ? 'Actions' : 'Events';
  const parts: string[] = [];

  parts.push('---');
  parts.push(`title: "${ns.namespace} ${title}"`);
  parts.push(`sidebar_label: "${title}"`);
  parts.push('---');
  parts.push('');
  parts.push(`# ${ns.namespace} ${title}`);
  parts.push('');

  if (items.length === 0) {
    parts.push(`_No ${kind}s found for this namespace._`);
    parts.push('');
    return parts.join('\n');
  }

  parts.push(
    `${items.length} ${kind}${items.length === 1 ? '' : 's'} registered.`,
  );
  parts.push('');

  // Table of contents
  parts.push('| Name | Deprecated |');
  parts.push('|------|-----------|');
  for (const item of items) {
    const name = item.typeString.split(':')[1];
    // Docusaurus uses github-slugger: strips non-alphanumeric, lowercases, no dashes for special chars in code spans
    const anchor = item.typeString.toLowerCase().replace(/[^a-z0-9]/gu, '');
    const dep = item.deprecated ? 'Yes' : '';
    parts.push(`| [\`${name}\`](#${anchor}) | ${dep} |`);
  }
  parts.push('');
  parts.push('---');
  parts.push('');

  for (const item of items) {
    parts.push(generateItemMarkdown(item, clientMode));
    parts.push('---');
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Generate the index/overview page listing all namespaces.
 *
 * @param namespaces - All namespace groups sorted alphabetically.
 * @param clientName - Optional client name for client-mode docs.
 * @returns The generated markdown string.
 */
function generateIndexPage(
  namespaces: NamespaceGroup[],
  clientName?: string,
): string {
  const totalActions = namespaces.reduce(
    (sum, ns) => sum + ns.actions.length,
    0,
  );
  const totalEvents = namespaces.reduce((sum, ns) => sum + ns.events.length, 0);

  const parts: string[] = [];
  if (clientName) {
    parts.push('---');
    parts.push(`title: "${clientName} Messenger API Reference"`);
    parts.push('slug: "/"');
    parts.push('---');
    parts.push('');
    parts.push(`# ${clientName} Messenger API`);
    parts.push('');
    parts.push(
      `This site documents every action and event available in the \`${clientName}\` dependency tree — the type-safe message bus used across all controllers.`,
    );
  } else {
    parts.push('---');
    parts.push('title: "Messenger API Reference"');
    parts.push('slug: "/"');
    parts.push('---');
    parts.push('');
    parts.push('# MetaMask Core Messenger API');
    parts.push('');
    parts.push(
      'This site documents every action and event registered on the Messenger — the type-safe message bus used across all controllers in `@metamask/core`.',
    );
  }
  parts.push('');
  parts.push(`- **${namespaces.length}** namespaces`);
  parts.push(`- **${totalActions}** actions`);
  parts.push(`- **${totalEvents}** events`);
  parts.push('');
  parts.push('## Namespaces');
  parts.push('');
  parts.push('| Namespace | Actions | Events |');
  parts.push('|-----------|---------|--------|');

  for (const ns of namespaces) {
    const link = ns.namespace;
    parts.push(
      `| [${ns.namespace}](${link}/actions) | ${ns.actions.length} | ${ns.events.length} |`,
    );
  }

  parts.push('');
  return parts.join('\n');
}

/**
 * Generate the sidebars.ts file content for Docusaurus.
 *
 * @param namespaces - All namespace groups sorted alphabetically.
 * @returns The generated TypeScript source string.
 */
function generateSidebars(namespaces: NamespaceGroup[]): string {
  const items = namespaces.map((ns) => ({
    type: 'category',
    label: ns.namespace,
    items: [
      ...(ns.actions.length > 0 ? [`${ns.namespace}/actions`] : []),
      ...(ns.events.length > 0 ? [`${ns.namespace}/events`] : []),
    ],
  }));

  const sidebar = {
    messengerSidebar: [
      {
        type: 'doc',
        id: 'index',
        label: 'Overview',
      },
      ...items,
    ],
  };

  return `// This file is auto-generated by scripts/generate-messenger-docs.ts\n// Do not edit manually.\nconst sidebars = ${JSON.stringify(sidebar, null, 2)};\nexport default sidebars;\n`;
}

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Main entry point: scans packages, extracts messenger types, and generates docs.
 */
function main(): void {
  // Parse --client flag
  const clientIdx = process.argv.indexOf('--client');
  const clientPath = clientIdx !== -1 ? process.argv[clientIdx + 1] : undefined;
  const clientMode = Boolean(clientPath);
  const clientName = clientPath ? path.basename(clientPath) : undefined;

  const allItems: MessengerItemDoc[] = [];

  if (clientMode) {
    console.log(
      `Scanning ${clientName} dependencies for Messenger action/event types...`,
    );

    const nmDir = path.join(clientPath as string, 'node_modules', '@metamask');
    if (!fs.existsSync(nmDir)) {
      console.error(`Error: ${nmDir} does not exist.`);
      process.exit(1);
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
          const items = extractFromFile(file, clientPath);
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
          const items = extractFromFile(file);
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

main();
