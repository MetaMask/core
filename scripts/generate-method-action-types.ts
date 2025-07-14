#!yarn ts-node

import { ESLint } from 'eslint';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import yargs from 'yargs';

const eslint = new ESLint({
  fix: true, // Auto-fix what we can
  errorOnUnmatchedPattern: false,
});

type MethodInfo = {
  name: string;
  jsDoc: string;
  signature: string;
};

type ControllerInfo = {
  name: string;
  filePath: string;
  exposedMethods: string[];
  methods: MethodInfo[];
};

/**
 * The parsed command-line arguments.
 */
type CommandLineArguments = {
  /**
   * Whether to check if the action types files are up to date.
   */
  check: boolean;
  /**
   * Whether to fix the action types files.
   */
  fix: boolean;
};

/**
 * Uses `yargs` to parse the arguments given to the script.
 *
 * @returns The command line arguments.
 */
async function parseCommandLineArguments(): Promise<CommandLineArguments> {
  const { check, fix } = await yargs(process.argv.slice(2))
    .option('check', {
      type: 'boolean',
      description: 'Check if generated action type files are up to date',
      default: false,
    })
    .option('fix', {
      type: 'boolean',
      description: 'Generate/update action type files',
      default: false,
    })
    .help()
    .check((argv) => {
      if (!argv.check && !argv.fix) {
        throw new Error('Either --check or --fix must be provided.\n');
      }
      return true;
    }).argv;

  return { check, fix };
}

/**
 * Normalizes content for comparison (remove extra whitespace differences)
 *
 * - Replace multiple spaces with a single space
 * - Replace `;\s*}` with `;}`
 * - Trim the content
 *
 * @param content - The content to normalize.
 * @returns The normalized content.
 */
function normalize(content: string): string {
  return content
    .replace(/\s+/gu, ' ')
    .replace(/;\s*\}/gu, ';}')
    .trim();
}

/**
 * Checks if generated action types files are up to date.
 *
 * @param controllers - Array of controller information objects.
 */
async function checkActionTypesFiles(
  controllers: ControllerInfo[],
): Promise<void> {
  let hasErrors = false;

  for (const controller of controllers) {
    console.log(`\n🔧 Checking ${controller.name}...`);
    const outputDir = path.dirname(controller.filePath);
    const baseFileName = path.basename(controller.filePath, '.ts');
    const outputFile = path.join(
      outputDir,
      `${baseFileName}-method-action-types.ts`,
    );

    const expectedContent = await generateActionTypesContent(
      controller,
      outputFile,
    );

    try {
      const actualContent = await fs.promises.readFile(outputFile, 'utf8');

      if (normalize(actualContent) !== normalize(expectedContent)) {
        console.log('Actual content:');
        console.log(actualContent);
        console.log('Expected content:');
        console.log(expectedContent);
        console.error(
          `❌ ${baseFileName}-method-action-types.ts is out of date`,
        );
        hasErrors = true;
      } else {
        console.log(`✅ ${baseFileName}-method-action-types.ts is up to date`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error(
          `❌ ${baseFileName}-method-action-types.ts does not exist`,
        );
      } else {
        console.error(
          `❌ Error reading ${baseFileName}-method-action-types.ts:`,
          error,
        );
      }
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\n💥 Some action type files are out of date or missing.');
    console.error(
      'Run `yarn generate-method-action-types --fix` to update them.',
    );
    process.exitCode = 1;
  } else {
    console.log('\n🎉 All action type files are up to date!');
  }
}

/**
 * Main entry point for the script.
 */
async function main() {
  const { fix } = await parseCommandLineArguments();

  console.log('🔍 Searching for controllers with MESSENGER_EXPOSED_METHODS...');

  const controllers = await findControllersWithExposedMethods();

  if (controllers.length === 0) {
    console.log('⚠️  No controllers found with MESSENGER_EXPOSED_METHODS');
    return;
  }

  console.log(
    `📦 Found ${controllers.length} controller(s) with exposed methods`,
  );

  if (fix) {
    for (const controller of controllers) {
      console.log(`\n🔧 Processing ${controller.name}...`);
      await generateActionTypesFile(controller);
      console.log(`✅ Generated action types for ${controller.name}`);
    }

    console.log('\n🎉 All action types generated successfully!');
  } else {
    // -check mode: check files
    await checkActionTypesFiles(controllers);
  }
}

/**
 * Finds all controller files that have MESSENGER_EXPOSED_METHODS constants.
 *
 * @returns A list of controller information objects.
 */
async function findControllersWithExposedMethods(): Promise<ControllerInfo[]> {
  const packagesDir = path.resolve(__dirname, '../packages');
  const controllers: ControllerInfo[] = [];

  const packageDirs = await fs.promises.readdir(packagesDir, {
    withFileTypes: true,
  });

  for (const packageDir of packageDirs) {
    if (!packageDir.isDirectory()) {
      continue;
    }

    const packagePath = path.join(packagesDir, packageDir.name);
    const srcPath = path.join(packagePath, 'src');

    if (!fs.existsSync(srcPath)) {
      continue;
    }

    const srcFiles = await fs.promises.readdir(srcPath);

    for (const file of srcFiles) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) {
        continue;
      }

      const filePath = path.join(srcPath, file);
      const content = await fs.promises.readFile(filePath, 'utf8');

      if (content.includes('MESSENGER_EXPOSED_METHODS')) {
        const controllerInfo = await parseControllerFile(filePath);
        if (controllerInfo) {
          controllers.push(controllerInfo);
        }
      }
    }
  }

  return controllers;
}

/**
 * Context for AST visiting.
 */
type VisitorContext = {
  exposedMethods: string[];
  className: string;
  methods: MethodInfo[];
  sourceFile: ts.SourceFile;
};

/**
 * Visits AST nodes to find exposed methods and controller class.
 *
 * @param context - The visitor context.
 * @returns A function to visit nodes.
 */
function createASTVisitor(context: VisitorContext) {
  /**
   * Visits AST nodes to find exposed methods and controller class.
   *
   * @param node - The AST node to visit.
   */
  function visitNode(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0];
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === 'MESSENGER_EXPOSED_METHODS'
      ) {
        if (declaration.initializer) {
          let arrayExpression: ts.ArrayLiteralExpression | undefined;

          // Handle direct array literal
          if (ts.isArrayLiteralExpression(declaration.initializer)) {
            arrayExpression = declaration.initializer;
          }
          // Handle "as const" assertion: expression is wrapped in type assertion
          else if (
            ts.isAsExpression(declaration.initializer) &&
            ts.isArrayLiteralExpression(declaration.initializer.expression)
          ) {
            arrayExpression = declaration.initializer.expression;
          }

          if (arrayExpression) {
            context.exposedMethods = arrayExpression.elements
              .filter(ts.isStringLiteral)
              .map((element) => element.text);
          }
        }
      }
    }

    // Find the controller class
    if (ts.isClassDeclaration(node) && node.name) {
      const classText = node.name.text;
      if (classText.includes('Controller')) {
        context.className = classText;

        // Extract method info for exposed methods
        const seenMethods = new Set<string>();
        for (const member of node.members) {
          if (
            ts.isMethodDeclaration(member) &&
            member.name &&
            ts.isIdentifier(member.name)
          ) {
            const methodName = member.name.text;
            if (
              context.exposedMethods.includes(methodName) &&
              !seenMethods.has(methodName)
            ) {
              seenMethods.add(methodName);
              const jsDoc = extractJSDoc(member, context.sourceFile);
              const signature = extractMethodSignature(member);
              context.methods.push({
                name: methodName,
                jsDoc,
                signature,
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, visitNode);
  }

  return visitNode;
}

/**
 * Parses a controller file to extract exposed methods and their metadata.
 *
 * @param filePath - Path to the controller file to parse.
 * @returns Controller information or null if parsing fails.
 */
async function parseControllerFile(
  filePath: string,
): Promise<ControllerInfo | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    const context: VisitorContext = {
      exposedMethods: [],
      className: '',
      methods: [],
      sourceFile,
    };

    createASTVisitor(context)(sourceFile);

    if (context.exposedMethods.length === 0 || !context.className) {
      return null;
    }

    return {
      name: context.className,
      filePath,
      exposedMethods: context.exposedMethods,
      methods: context.methods,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

/**
 * Extracts JSDoc comment from a method declaration.
 *
 * @param node - The method declaration node.
 * @param sourceFile - The source file.
 * @returns The JSDoc comment.
 */
function extractJSDoc(
  node: ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
): string {
  const jsDocTags = ts.getJSDocCommentsAndTags(node);
  if (jsDocTags.length === 0) {
    return '';
  }

  const jsDoc = jsDocTags[0];
  if (ts.isJSDoc(jsDoc)) {
    const fullText = sourceFile.getFullText();
    const start = jsDoc.getFullStart();
    const end = jsDoc.getEnd();
    const rawJsDoc = fullText.substring(start, end).trim();
    return formatJSDoc(rawJsDoc);
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
      // First line should be /**
      formattedLines.push('/**');
    } else if (i === lines.length - 1) {
      // Last line should be */
      formattedLines.push(' */');
    } else {
      // Middle lines should start with ' * '
      const trimmed = line.trim();
      if (trimmed.startsWith('*')) {
        // Remove existing * and normalize
        const content = trimmed.substring(1).trim();
        formattedLines.push(content ? ` * ${content}` : ' *');
      } else {
        // Handle lines that don't start with *
        formattedLines.push(trimmed ? ` * ${trimmed}` : ' *');
      }
    }
  }

  return formattedLines.join('\n');
}

/**
 * Extracts method signature as a string for the handler type.
 *
 * @param node - The method declaration node.
 * @returns The method signature.
 */
function extractMethodSignature(node: ts.MethodDeclaration): string {
  // Since we're just using the method reference in the handler type,
  // we don't need the full signature - just return the method name
  // The actual signature will be inferred from the controller class
  return node.name ? (node.name as ts.Identifier).text : '';
}

/**
 * Generates the action types file for a controller.
 *
 * @param controller - The controller information object.
 */
async function generateActionTypesFile(
  controller: ControllerInfo,
): Promise<void> {
  const outputDir = path.dirname(controller.filePath);
  const baseFileName = path.basename(controller.filePath, '.ts');
  const outputFile = path.join(
    outputDir,
    `${baseFileName}-method-action-types.ts`,
  );

  const content = await generateActionTypesContent(controller, outputFile);
  await fs.promises.writeFile(outputFile, content, 'utf8');
}

/**
 * Generates the content for the action types file.
 *
 * @param controller - The controller information object.
 * @param outputFile - The path to the output file.
 * @returns The content for the action types file.
 */
async function generateActionTypesContent(
  controller: ControllerInfo,
  outputFile: string,
): Promise<string> {
  const baseFileName = path.basename(controller.filePath, '.ts');
  const controllerImportPath = `./${baseFileName}`;

  let content = `/**
 * This file is auto generated by \`scripts/generate-method-action-types.ts\`.
 * Do not edit manually.
 */

import type { ${controller.name} } from '${controllerImportPath}';

`;

  const actionTypeNames: string[] = [];

  // Generate action types for each exposed method
  for (const method of controller.methods) {
    const actionTypeName = `${controller.name}${capitalize(method.name)}Action`;
    const actionString = `${controller.name}:${method.name}`;

    actionTypeNames.push(actionTypeName);

    // Add the JSDoc if available
    if (method.jsDoc) {
      content += `${method.jsDoc}\n`;
    }

    content += `export type ${actionTypeName} = {
  type: \`${actionString}\`;
  handler: ${controller.name}['${method.name}'];
};\n\n`;
  }

  // Generate union type of all action types
  if (actionTypeNames.length > 0) {
    const unionTypeName = `${controller.name}MethodActions`;
    content += `/**
 * Union of all ${controller.name} action types.
 */
export type ${unionTypeName} = ${actionTypeNames.join(' | ')};\n`;
  }

  // Lint the generated content
  return await lintFileContent(`${content.trimEnd()}\n`, outputFile);
}

/**
 * Capitalizes the first letter of a string.
 *
 * @param str - The string to capitalize.
 * @returns The capitalized string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Lints TypeScript content using ESLint and returns the fixed content.
 *
 * @param content - The TypeScript content to lint.
 * @param outputFilePath - The path where the file would be written (used for file type detection).
 * @returns The linted content.
 */
async function lintFileContent(
  content: string,
  outputFilePath: string,
): Promise<string> {
  // Write temporary file for ESLint to process (ensures proper TS file detection)
  const tempFile = outputFilePath.replace('.ts', '.tmp.ts');
  await fs.promises.writeFile(tempFile, content, 'utf8');

  try {
    // Lint the temporary file
    const results = await eslint.lintFiles([tempFile]);
    await ESLint.outputFixes(results);

    // Read back the potentially fixed content
    const lintedContent = await fs.promises.readFile(tempFile, 'utf8');

    return lintedContent;
  } finally {
    // Clean up temporary file
    try {
      await fs.promises.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Error handling wrapper
main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exitCode = 1;
});
