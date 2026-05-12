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

import type { MessengerItemDoc, MethodInfo } from './types';

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
    if (!spec?.startsWith('.')) {
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
 * Resolve a template-literal or string-literal `type` property to its string
 * value. Returns null if unresolvable.
 *
 * @param node - The expression node to resolve.
 * @param constants - A map of known constant names to their string values.
 * @returns The resolved string value, or null if unresolvable.
 */
function resolveTypeString(
  node: Expression,
  constants: Map<string, string>,
): string | null {
  if (
    NodeGuards.isStringLiteral(node) ||
    NodeGuards.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralValue();
  }

  if (NodeGuards.isTemplateExpression(node)) {
    let result = node.getHead().getLiteralText();
    for (const span of node.getTemplateSpans()) {
      const expression = span.getExpression();
      // typeof X  →  resolve X
      if (NodeGuards.isTypeOfExpression(expression)) {
        const inner = expression.getExpression();
        if (NodeGuards.isIdentifier(inner)) {
          const val = constants.get(inner.getText());
          if (val === undefined) {
            return null;
          }
          result += val;
        } else {
          return null;
        }
      } else if (NodeGuards.isIdentifier(expression)) {
        const val = constants.get(expression.getText());
        if (val === undefined) {
          return null;
        }
        result += val;
      } else {
        return null;
      }
      result += span.getLiteral().getLiteralText();
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
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });
  const sourceFile = project.createSourceFile(filePath, content, {
    overwrite: true,
  });

  const constants = await collectStringConstants(project, sourceFile, filePath);
  const classMethods = collectClassMethods(sourceFile);
  const items: MessengerItemDoc[] = [];
  const relPath = path.relative(relBase, filePath);

  // Type aliases and interfaces are always top-level statements
  for (const statement of sourceFile.getStatements()) {
    // ---------------------------------------------------------------
    // Pattern 1: { type: '...'; handler/payload: ... }
    // Matches both:
    //   type X = { type: '...'; handler: ... }   (type alias with literal body)
    //   interface X { type: '...'; handler: ... } (interface declaration)
    // ---------------------------------------------------------------
    let inlineNode: TypeAliasDeclaration | InterfaceDeclaration | undefined;
    let inlineMembers: TypeElementTypes[] | undefined;

    if (NodeGuards.isTypeAliasDeclaration(statement)) {
      const aliasType = statement.getTypeNode();
      if (aliasType && NodeGuards.isTypeLiteral(aliasType)) {
        inlineNode = statement;
        inlineMembers = aliasType.getMembers();
      }
    } else if (NodeGuards.isInterfaceDeclaration(statement)) {
      inlineNode = statement;
      inlineMembers = statement.getMembers();
    }

    if (inlineNode && inlineMembers) {
      const typeName = inlineNode.getName();
      const line = inlineNode.getStartLineNumber();

      // Find `type` property
      let typeString: string | null = null;
      for (const member of inlineMembers) {
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
          typeString = resolveTypeString(typeNode.getLiteral(), constants);
        } else if (NodeGuards.isTemplateLiteralTypeNode(typeNode)) {
          typeString = resolveTemplateLiteralType(typeNode, constants);
        }
      }

      if (typeString?.includes(':')) {
        const handlerText = getPropertyText(inlineMembers, 'handler');
        const payloadText = getPropertyText(inlineMembers, 'payload');

        if (handlerText || payloadText) {
          const kind: 'action' | 'event' = handlerText ? 'action' : 'event';

          // For actions, resolve ClassName['methodName'] to actual signature + JSDoc
          let resolvedHandler = handlerText || payloadText;
          let typeAliasJsDoc = extractJsDocText(inlineNode);

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
            deprecated: isDeprecated(inlineNode),
          });
        }
      }
    }

    // -------------------------------------------------------------------
    // Patterns 2 & 3 only apply to type aliases (generic type references)
    // -------------------------------------------------------------------
    if (!NodeGuards.isTypeAliasDeclaration(statement)) {
      continue;
    }
    const node = statement;
    const typeName = node.getName();
    const line = node.getStartLineNumber();
    const aliasTypeNode = node.getTypeNode();

    if (!aliasTypeNode || !NodeGuards.isTypeReference(aliasTypeNode)) {
      continue;
    }

    const typeNameNode = aliasTypeNode.getTypeName();
    if (!NodeGuards.isIdentifier(typeNameNode)) {
      continue;
    }
    const typeReferenceName = typeNameNode.getText();
    const typeArguments = aliasTypeNode.getTypeArguments();
    if (typeArguments.length < 2) {
      continue;
    }

    // -------------------------------------------------------------------
    // Pattern 2: ControllerGetStateAction<typeof cn, State>
    // -------------------------------------------------------------------
    if (typeReferenceName === 'ControllerGetStateAction') {
      const namespace = resolveNamespaceFromTypeArg(
        typeArguments[0],
        constants,
      );
      const stateArg = typeArguments[1];

      if (namespace) {
        items.push({
          typeName,
          typeString: `${namespace}:getState`,
          kind: 'action',
          jsDoc: extractJsDocText(node),
          handlerOrPayload: `() => ${stateArg.getText()}`,
          sourceFile: relPath,
          line,
          deprecated: isDeprecated(node),
        });
      }
    }

    // -------------------------------------------------------------------
    // Pattern 3: ControllerStateChangeEvent<typeof cn, State>
    // -------------------------------------------------------------------
    if (typeReferenceName === 'ControllerStateChangeEvent') {
      const namespace = resolveNamespaceFromTypeArg(
        typeArguments[0],
        constants,
      );
      const stateArg = typeArguments[1];

      if (namespace) {
        items.push({
          typeName,
          typeString: `${namespace}:stateChange`,
          kind: 'event',
          jsDoc: extractJsDocText(node),
          handlerOrPayload: `[${stateArg.getText()}, Patch[]]`,
          sourceFile: relPath,
          line,
          deprecated: isDeprecated(node),
        });
      }
    }
  }

  return items;
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
