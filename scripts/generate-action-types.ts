#!/usr/bin/env tsx

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

type MethodInfo = {
  name: string;
  parameters: { name: string; type: string }[];
  returnType: string;
  isAsync: boolean;
  overloads: MethodInfo[];
};

type ControllerInfo = {
  name: string;
  filePath: string;
  methods: MethodInfo[];
  exposedMethods: string[];
};

/**
 * Extracts the MESSENGER_EXPOSED_METHODS constant from a TypeScript file
 *
 * @param sourceFile - The TypeScript source file to analyze
 * @returns Array of exposed method names
 */
function extractExposedMethods(sourceFile: ts.SourceFile): string[] {
  const exposedMethods: string[] = [];

  /**
   * Visits nodes in the AST to find MESSENGER_EXPOSED_METHODS
   *
   * @param node - The AST node to visit
   */
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node)) {
      const name = node.name.getText();
      if (name === 'MESSENGER_EXPOSED_METHODS') {
        if (node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
          node.initializer.elements.forEach((element) => {
            if (ts.isStringLiteral(element)) {
              exposedMethods.push(element.text);
            }
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return exposedMethods;
}

/**
 * Extracts the controller class name from a TypeScript file
 *
 * @param sourceFile - The TypeScript source file to analyze
 * @returns The controller class name or null if not found
 */
function extractControllerClassName(sourceFile: ts.SourceFile): string | null {
  let controllerName: string | null = null;

  /**
   * Visits nodes in the AST to find class declarations
   *
   * @param node - The AST node to visit
   */
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.text;
      if (className.endsWith('Controller')) {
        controllerName = className;
        return; // Found the controller, stop searching
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return controllerName;
}

/**
 * Extracts method information from a TypeScript class
 *
 * @param sourceFile - The TypeScript source file to analyze
 * @param className - The name of the class to extract methods from
 * @param exposedMethodNames - Array of method names that should be exposed
 * @returns Array of method information for exposed methods only
 */
function extractMethodsFromClass(
  sourceFile: ts.SourceFile,
  className: string,
  exposedMethodNames: string[],
): MethodInfo[] {
  const methodMap = new Map<string, MethodInfo>();

  /**
   * Visits nodes in the AST to find class methods
   *
   * @param node - The AST node to visit
   */
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      node.members.forEach((member) => {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText();

          // Only process methods that are in the exposed methods list
          if (!exposedMethodNames.includes(methodName)) {
            return;
          }

          // Skip private methods
          if (methodName.startsWith('#')) {
            return;
          }

          // Skip methods with private modifiers
          if (
            member.modifiers?.some(
              (mod) => mod.kind === ts.SyntaxKind.PrivateKeyword,
            )
          ) {
            return;
          }

          const method = extractMethodInfo(member, methodName);
          if (method) {
            // Handle overloads by keeping only one entry per method name
            // Use the most general signature (usually the implementation)
            const existing = methodMap.get(methodName);
            if (
              !existing ||
              method.parameters.length >= existing.parameters.length
            ) {
              methodMap.set(methodName, method);
            }
          }
        }
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Array.from(methodMap.values());
}

/**
 * Extracts detailed information from a method declaration
 *
 * @param method - The method declaration to analyze
 * @param methodName - The name of the method
 * @returns Method information or null if extraction fails
 */
function extractMethodInfo(
  method: ts.MethodDeclaration,
  methodName: string,
): MethodInfo | null {
  const parameters = method.parameters.map((param) => ({
    name: param.name.getText(),
    type: param.type ? param.type.getText() : 'unknown',
  }));

  const returnType = method.type ? method.type.getText() : 'unknown';
  const isAsync =
    method.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword) ??
    false;

  return {
    name: methodName,
    parameters,
    returnType,
    isAsync,
    overloads: [], // We'll handle overloads separately
  };
}

/**
 * Generates TypeScript action type definitions
 *
 * @param controllerInfo - Information about the controller to generate types for
 * @returns Generated TypeScript code as a string
 */
function generateActionTypes(controllerInfo: ControllerInfo): string {
  const relevantMethods = controllerInfo.methods;

  let output = `// Auto-generated action types for ${controllerInfo.name}\n`;
  output += `// Generated on ${new Date().toISOString()}\n`;
  output += `// Based on MESSENGER_EXPOSED_METHODS: [${controllerInfo.exposedMethods.map((m) => `'${m}'`).join(', ')}]\n\n`;

  // Generate individual action types
  relevantMethods.forEach((method) => {
    const actionTypeName = `${controllerInfo.name}${capitalizeFirstLetter(method.name)}Action`;
    const paramTypes = method.parameters
      .map((p) => `${p.name}: ${p.type}`)
      .join(', ');

    output += `export type ${actionTypeName} = {\n`;
    output += `  type: '${controllerInfo.name}:${method.name}';\n`;
    output += `  handler: (${paramTypes}) => ${method.returnType};\n`;
    output += `};\n\n`;
  });

  // Generate union type
  const actionTypeNames = relevantMethods.map(
    (method) =>
      `${controllerInfo.name}${capitalizeFirstLetter(method.name)}Action`,
  );

  if (actionTypeNames.length > 0) {
    output += `export type ${controllerInfo.name}MethodActions =\n`;
    output += actionTypeNames.map((name) => `  | ${name}`).join('\n');
    output += ';\n\n';
  }

  // Generate the updated export that would replace NetworkControllerActions
  output += `// Replace the existing ${controllerInfo.name}Actions with:\n`;
  output += `// export type ${controllerInfo.name}Actions =\n`;
  output += `//   | ${controllerInfo.name}GetStateAction\n`;
  if (actionTypeNames.length > 0) {
    output += `//   | ${controllerInfo.name}MethodActions;\n`;
  }

  return output;
}

/**
 * Analyzes a controller file and generates action types
 *
 * @param filePath - Path to the controller file to analyze
 * @returns Generated TypeScript code as a string
 */
function analyzeController(filePath: string): string {
  const sourceCode = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );

  // Extract controller name from the actual class declaration
  const controllerName = extractControllerClassName(sourceFile);
  if (!controllerName) {
    throw new Error(`No controller class found in ${filePath}`);
  }

  // Extract exposed methods from MESSENGER_EXPOSED_METHODS constant
  const exposedMethods = extractExposedMethods(sourceFile);
  if (exposedMethods.length === 0) {
    console.warn(`Warning: No MESSENGER_EXPOSED_METHODS found in ${filePath}`);
    console.warn(
      'Make sure the controller has a MESSENGER_EXPOSED_METHODS constant defined.',
    );
    return `// No MESSENGER_EXPOSED_METHODS found in ${controllerName}\n`;
  }

  console.log(`Found controller: ${controllerName}`);
  console.log(`Exposed methods: ${exposedMethods.join(', ')}`);

  const methods = extractMethodsFromClass(
    sourceFile,
    controllerName,
    exposedMethods,
  );

  // Check if all exposed methods were found
  const foundMethodNames = methods.map((m) => m.name);
  const missingMethods = exposedMethods.filter(
    (name) => !foundMethodNames.includes(name),
  );
  if (missingMethods.length > 0) {
    console.warn(
      `Warning: Some exposed methods not found in class: ${missingMethods.join(', ')}`,
    );
  }

  const controllerInfo: ControllerInfo = {
    name: controllerName,
    filePath,
    methods,
    exposedMethods,
  };

  return generateActionTypes(controllerInfo);
}

/**
 * Utility function to capitalize the first letter
 *
 * @param str - The string to capitalize
 * @returns The string with the first letter capitalized
 */
function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Main execution function
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      'Usage: tsx generate-action-types.ts <controller-file-path> [output-file-path]',
    );
    throw new Error('Missing required argument: controller-file-path');
  }

  const controllerFilePath = args[0];

  if (!fs.existsSync(controllerFilePath)) {
    const errorMessage = `File not found: ${controllerFilePath}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    const generatedTypes = analyzeController(controllerFilePath);

    // Output to stdout or file
    const outputPath = args[1];
    if (outputPath) {
      fs.writeFileSync(outputPath, generatedTypes);
      console.log(`Generated action types written to: ${outputPath}`);
    } else {
      console.log(`\n${generatedTypes}`);
    }
  } catch (error) {
    console.error('Error generating action types:', error);
    throw error;
  }
}

if (require.main === module) {
  main();
}
