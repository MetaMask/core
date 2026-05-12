import { assert, hasProperty, isObject } from '@metamask/utils';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ArrayLiteralExpression,
  ClassDeclaration,
  MethodDeclaration,
  Node as TsMorphNode,
  SourceFile,
} from 'ts-morph';
import { Node as NodeGuards, Project } from 'ts-morph';

export type MethodInfo = {
  name: string;
  jsDoc: string;
};

export type SourceInfo = {
  name: string;
  filePath: string;
  methods: MethodInfo[];
};

/**
 * Extracts JSDoc comment from a method declaration. When the method has
 * overload signatures, JSDoc is typically placed on the first overload rather
 * than the implementation, so overload signatures are checked first.
 *
 * @param method - The method declaration node.
 * @returns The formatted JSDoc comment.
 */
function extractJSDoc(method: MethodDeclaration): string {
  const declarations = [...method.getOverloads(), method];
  for (const declaration of declarations) {
    const jsDocs = declaration.getJsDocs();
    if (jsDocs.length > 0) {
      // When multiple JSDoc blocks precede a declaration, the closest one
      // (last in source order) is the one logically attached.
      return formatJSDoc(jsDocs[jsDocs.length - 1].getText().trim());
    }
  }
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
 * Returns the underlying array literal from a `MESSENGER_EXPOSED_METHODS`
 * initializer, unwrapping a trailing `as const` assertion if present.
 *
 * @param initializer - The initializer expression.
 * @returns The array literal, or undefined if the initializer is not an array literal.
 */
function getArrayLiteral(
  initializer: TsMorphNode,
): ArrayLiteralExpression | undefined {
  if (NodeGuards.isArrayLiteralExpression(initializer)) {
    return initializer;
  }
  if (NodeGuards.isAsExpression(initializer)) {
    const inner = initializer.getExpression();
    if (NodeGuards.isArrayLiteralExpression(inner)) {
      return inner;
    }
  }
  return undefined;
}

/**
 * Extracts the names listed in the `MESSENGER_EXPOSED_METHODS` constant.
 *
 * @param sourceFile - The source file to search.
 * @returns The list of exposed method names, or an empty array if not found.
 */
function extractExposedMethods(sourceFile: SourceFile): string[] {
  for (const statement of sourceFile.getVariableStatements()) {
    for (const declaration of statement.getDeclarations()) {
      if (declaration.getName() !== 'MESSENGER_EXPOSED_METHODS') {
        continue;
      }
      const initializer = declaration.getInitializer();
      if (!initializer) {
        continue;
      }
      const arrayExpression = getArrayLiteral(initializer);
      if (!arrayExpression) {
        continue;
      }
      return arrayExpression
        .getElements()
        .filter(NodeGuards.isStringLiteral)
        .map((element) => element.getLiteralValue());
    }
  }
  return [];
}

/**
 * Finds the first class in the source file whose name contains "Controller" or
 * "Service".
 *
 * @param sourceFile - The source file to search.
 * @returns The class declaration, or undefined if not found.
 */
function findControllerOrServiceClass(
  sourceFile: SourceFile,
): ClassDeclaration | undefined {
  return sourceFile.getClasses().find((cls) => {
    const name = cls.getName();
    return (
      name !== undefined &&
      (name.includes('Controller') || name.includes('Service'))
    );
  });
}

/**
 * Walks the class hierarchy looking for a method with the given name.
 *
 * @param classDeclaration - The starting class.
 * @param methodName - The method name to look for.
 * @returns The method declaration, or undefined if not found.
 */
function findMethodInHierarchy(
  classDeclaration: ClassDeclaration,
  methodName: string,
): MethodDeclaration | undefined {
  let current: ClassDeclaration | undefined = classDeclaration;
  while (current) {
    const method = current.getMethod(methodName);
    if (method) {
      return method;
    }
    current = current.getBaseClass();
  }
  return undefined;
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
 * Walks up from the given file looking for the nearest `tsconfig.json`.
 *
 * @param filePath - The file to start searching from.
 * @returns The absolute path to the nearest tsconfig.json, or undefined if none is found.
 */
function findNearestTsConfig(filePath: string): string | undefined {
  let directory = path.dirname(filePath);
  while (directory !== path.dirname(directory)) {
    const candidate = path.join(directory, 'tsconfig.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    directory = path.dirname(directory);
  }
  return undefined;
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
    const standaloneProject = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    const sourceFile = standaloneProject.addSourceFileAtPath(filePath);

    const exposedMethods = extractExposedMethods(sourceFile);
    const classDeclaration = findControllerOrServiceClass(sourceFile);

    if (exposedMethods.length === 0 || !classDeclaration) {
      return null;
    }

    const className = classDeclaration.getName();
    // istanbul ignore next: findControllerOrServiceClass only matches named classes
    assert(className, 'Class declaration is missing a name.');

    const methods: MethodInfo[] = [];
    const seenMethods = new Set<string>();

    for (const member of classDeclaration.getMethods()) {
      const methodName = member.getName();
      if (exposedMethods.includes(methodName) && !seenMethods.has(methodName)) {
        seenMethods.add(methodName);
        methods.push({ name: methodName, jsDoc: extractJSDoc(member) });
      }
    }

    const inheritedMethodNames = exposedMethods.filter(
      (name) => !seenMethods.has(name),
    );

    if (inheritedMethodNames.length > 0) {
      const configPath = findNearestTsConfig(filePath);
      assert(
        configPath,
        `tsconfig.json could not be located for "${filePath}". Ensure a valid tsconfig.json is present.`,
      );

      const project = new Project({ tsConfigFilePath: configPath });
      const fullSourceFile = project.addSourceFileAtPath(filePath);
      const fullClassDeclaration = findControllerOrServiceClass(fullSourceFile);

      // istanbul ignore next: class was found in the standalone parse above
      assert(
        fullClassDeclaration,
        `Class "${className}" not found in "${filePath}".`,
      );

      for (const methodName of inheritedMethodNames) {
        const method = findMethodInHierarchy(fullClassDeclaration, methodName);
        const jsDoc = method ? extractJSDoc(method) : '';
        methods.push({ name: methodName, jsDoc });
      }
    }

    return {
      name: className,
      filePath,
      methods,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
]);

/**
 * Recursively get all files in a directory and its subdirectories.
 *
 * @param directory - The directory to search.
 * @returns An array of file paths.
 */
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
