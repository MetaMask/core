import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';

import type { MessengerItemDoc, MethodInfo } from './types';

/**
 * Check whether a file exists.
 *
 * @param filePath - The path to check.
 * @returns A promise that resolves to true if the file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

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
 * @returns A promise that resolves to a map of constant name to resolved string value.
 */
async function resolveControllerName(
  sourceFile: ts.SourceFile,
  filePath: string,
): Promise<Map<string, string>> {
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
      if (!(await fileExists(candidate))) {
        continue;
      }

      const content = await fs.readFile(candidate, 'utf8');
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
 * @param relBase - Base path for computing relative source paths.
 * @returns A promise that resolves to an array of extracted messenger item docs.
 */
export async function extractFromFile(
  filePath: string,
  relBase: string,
): Promise<MessengerItemDoc[]> {
  const content = await fs.readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const constants = await resolveControllerName(sourceFile, filePath);
  const classMethods = collectClassMethods(sourceFile);
  const items: MessengerItemDoc[] = [];
  const relPath = path.relative(relBase, filePath);

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
