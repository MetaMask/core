import { assert, hasProperty, isObject } from '@metamask/utils';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ArrayLiteralExpression,
  ClassDeclaration,
  MethodDeclaration,
  Node as TSNode,
  Program,
  SourceFile,
  Type,
} from 'typescript';
import {
  ScriptTarget,
  createProgram,
  createSourceFile,
  findConfigFile,
  forEachChild,
  getJSDocCommentsAndTags,
  isArrayLiteralExpression,
  isAsExpression,
  isClassDeclaration,
  isIdentifier,
  isJSDoc,
  isMethodDeclaration,
  isStringLiteral,
  isVariableStatement,
  parseJsonConfigFileContent,
  readConfigFile,
  sys,
} from 'typescript';

export type MethodInfo = {
  name: string;
  jsDoc: string;
};

export type SourceInfo = {
  name: string;
  filePath: string;
  methods: MethodInfo[];
};

type VisitorContext = {
  exposedMethods: string[];
  className: string;
  methods: MethodInfo[];
  sourceFile: SourceFile;
};

/**
 * Extracts JSDoc comment from a method declaration.
 *
 * @param node - The method declaration node.
 * @param source - The source file.
 * @returns The JSDoc comment.
 */
function extractJSDoc(node: MethodDeclaration, source: SourceFile): string {
  const jsDocTags = getJSDocCommentsAndTags(node);
  if (jsDocTags.length === 0) {
    return '';
  }

  const jsDoc = jsDocTags[0];
  if (isJSDoc(jsDoc)) {
    const fullText = source.getFullText();
    const start = jsDoc.getFullStart();
    const end = jsDoc.getEnd();
    const rawJsDoc = fullText.substring(start, end).trim();
    return formatJSDoc(rawJsDoc);
  }

  // istanbul ignore next: defensive check — getJSDocCommentsAndTags always returns JSDoc nodes
  return '';
}

/**
 * Formats JSDoc comments to have consistent indentation for the generated file.
 *
 * @param rawJsDoc - The raw JSDoc comment from the source.
 * @returns The formatted JSDoc comment.
 */
function formatJSDoc(rawJsDoc: string): string {
  const lines = rawJsDoc.split('\n');
  const formattedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0) {
      formattedLines.push('/**');
    } else if (i === lines.length - 1) {
      formattedLines.push(' */');
    } else {
      const trimmed = line.trim();
      if (trimmed.startsWith('*')) {
        const content = trimmed.substring(1).trim();
        formattedLines.push(content ? ` * ${content}` : ' *');
      } else {
        formattedLines.push(trimmed ? ` * ${trimmed}` : ' *');
      }
    }
  }

  return formattedLines.join('\n');
}

/**
 * Visits AST nodes to find exposed methods and controller/service class.
 *
 * @param context - The visitor context.
 * @returns A function to visit nodes.
 */
function createASTVisitor(context: VisitorContext): (node: TSNode) => void {
  function visitNode(node: TSNode): void {
    if (isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0];
      if (
        isIdentifier(declaration.name) &&
        declaration.name.text === 'MESSENGER_EXPOSED_METHODS'
      ) {
        if (declaration.initializer) {
          let arrayExpression: ArrayLiteralExpression | undefined;

          if (isArrayLiteralExpression(declaration.initializer)) {
            arrayExpression = declaration.initializer;
          } else if (
            isAsExpression(declaration.initializer) &&
            isArrayLiteralExpression(declaration.initializer.expression)
          ) {
            arrayExpression = declaration.initializer.expression;
          }

          if (arrayExpression) {
            context.exposedMethods = arrayExpression.elements
              .filter(isStringLiteral)
              .map((element) => element.text);
          }
        }
      }
    }

    if (isClassDeclaration(node) && node.name) {
      const classText = node.name.text;
      if (classText.includes('Controller') || classText.includes('Service')) {
        context.className = classText;

        const seenMethods = new Set<string>();
        for (const member of node.members) {
          if (
            isMethodDeclaration(member) &&
            member.name &&
            isIdentifier(member.name)
          ) {
            const methodName = member.name.text;
            if (
              context.exposedMethods.includes(methodName) &&
              !seenMethods.has(methodName)
            ) {
              seenMethods.add(methodName);
              const jsDoc = extractJSDoc(member, context.sourceFile);
              context.methods.push({
                name: methodName,
                jsDoc,
              });
            }
          }
        }
      }
    }

    forEachChild(node, visitNode);
  }

  return visitNode;
}

/**
 * Create a TypeScript program for the given file by locating the nearest
 * tsconfig.json.
 *
 * @param filePath - Absolute path to the source file.
 * @returns A TypeScript program, or null if no tsconfig was found.
 */
function createProgramForFile(filePath: string): Program | null {
  const configPath = findConfigFile(
    path.dirname(filePath),
    sys.fileExists.bind(sys),
    'tsconfig.json',
  );
  if (!configPath) {
    return null;
  }

  const { config, error } = readConfigFile(configPath, sys.readFile.bind(sys));

  if (error) {
    return null;
  }

  const parsedConfig = parseJsonConfigFileContent(
    config,
    sys,
    path.dirname(configPath),
  );

  return createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
}

/**
 * Find a class declaration with the given name in a source file.
 *
 * @param source - The source file to search.
 * @param className - The class name to look for.
 * @returns The class declaration node, or null if not found.
 */
function findClassInSourceFile(
  source: SourceFile,
  className: string,
): ClassDeclaration | null {
  return (
    source.statements.find(
      (node): node is ClassDeclaration =>
        isClassDeclaration(node) && node.name?.text === className,
    ) ?? // istanbul ignore next: class is always found when called from parseSourceFile
    null
  );
}

/**
 * Search through the class hierarchy of a TypeScript type to find the
 * declaration of a method with the given name.
 *
 * @param classType - The class type to search.
 * @param methodName - The method name to look for.
 * @returns The method declaration node, or null if not found.
 */
function findMethodInHierarchy(
  classType: Type,
  methodName: string,
): MethodDeclaration | null {
  const symbol = classType.getProperty(methodName);
  if (!symbol) {
    return null;
  }

  const declarations = symbol.getDeclarations();
  // istanbul ignore next: defensive check — symbols from getProperty always have declarations
  if (!declarations) {
    return null;
  }

  for (const declaration of declarations) {
    if (isMethodDeclaration(declaration)) {
      return declaration;
    }
  }

  // istanbul ignore next: defensive fallback — property found but not a method declaration
  return null;
}

/**
 * Check if a path is a directory.
 *
 * @param pathValue - The path to check.
 * @returns True if the path is a directory, false otherwise.
 */
async function isDirectory(pathValue: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(pathValue);
    return stats.isDirectory();
  } catch (error) {
    if (
      isObject(error) &&
      hasProperty(error, 'code') &&
      error.code === 'ENOENT'
    ) {
      return false;
    }

    throw error;
  }
}

/**
 * Parses a source file to extract exposed methods and their metadata.
 *
 * @param filePath - Path to the controller/service file to parse.
 * @returns Source information or null if parsing fails.
 */
export async function parseSourceFile(
  filePath: string,
): Promise<SourceInfo | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const source = createSourceFile(
      filePath,
      content,
      ScriptTarget.Latest,
      true,
    );

    const context: VisitorContext = {
      exposedMethods: [],
      className: '',
      methods: [],
      sourceFile: source,
    };

    createASTVisitor(context)(source);

    if (context.exposedMethods.length === 0 || !context.className) {
      return null;
    }

    const foundMethodNames = new Set(
      context.methods.map((method) => method.name),
    );

    const inheritedMethodNames = context.exposedMethods.filter(
      (name) => !foundMethodNames.has(name),
    );

    if (inheritedMethodNames.length > 0) {
      const program = createProgramForFile(filePath);
      const checker = program?.getTypeChecker();
      const programSourceFile = program?.getSourceFile(filePath);

      assert(
        checker,
        `Type checker could not be created for "${filePath}". Ensure a valid tsconfig.json is present.`,
      );

      assert(
        programSourceFile,
        `Source file "${filePath}" not found in program.`,
      );

      const classNode = findClassInSourceFile(
        programSourceFile,
        context.className,
      );

      assert(
        classNode,
        `Class "${context.className}" not found in "${filePath}".`,
      );

      const classType = checker.getTypeAtLocation(classNode);
      for (const methodName of inheritedMethodNames) {
        const methodDeclaration = findMethodInHierarchy(classType, methodName);

        const jsDoc = methodDeclaration
          ? extractJSDoc(methodDeclaration, methodDeclaration.getSourceFile())
          : '';
        context.methods.push({ name: methodName, jsDoc });
      }
    }

    return {
      name: context.className,
      filePath,
      methods: context.methods,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

/**
 * Recursively get all files in a directory and its subdirectories.
 *
 * @param directory - The directory to search.
 * @returns An array of file paths.
 */
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
]);

async function getFiles(directory: string): Promise<string[]> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return EXCLUDED_DIRECTORIES.has(entry.name)
          ? []
          : await getFiles(fullPath);
      }
      return fullPath;
    }),
  );

  return files.flat();
}

/**
 * Finds all source files that have MESSENGER_EXPOSED_METHODS constants.
 * Searches recursively through subdirectories.
 *
 * @param sourcePath - Path to the folder where controllers/services are located.
 * @returns A list of source information objects.
 */
export async function findSourcesWithExposedMethods(
  sourcePath: string,
): Promise<SourceInfo[]> {
  const srcPath = path.resolve(globalThis.process.cwd(), sourcePath);
  const sources: SourceInfo[] = [];

  if (!(await isDirectory(srcPath))) {
    throw new Error(`The specified path is not a directory: ${srcPath}`);
  }

  const srcFiles = await getFiles(srcPath);

  for (const file of srcFiles) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) {
      continue;
    }

    const content = await fs.promises.readFile(file, 'utf8');

    if (content.includes('MESSENGER_EXPOSED_METHODS')) {
      const sourceInfo = await parseSourceFile(file);
      if (sourceInfo) {
        sources.push(sourceInfo);
      }
    }
  }

  return sources;
}
