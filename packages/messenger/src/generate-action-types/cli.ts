#!/usr/bin/env node

import yargs from 'yargs';

import { checkActionTypesFiles } from './check';
import { generateAllActionTypesFiles } from './fix';
import { findControllersWithExposedMethods } from './parse-controller';

type CommandLineArguments = {
  check: boolean;
  fix: boolean;
  controllerPath: string;
};

/**
 * Uses `yargs` to parse the arguments given to the script.
 *
 * @returns The command line arguments.
 */
async function parseCommandLineArguments(): Promise<CommandLineArguments> {
  const {
    check,
    fix,
    path: controllerPath,
  } = await yargs(globalThis.process.argv.slice(2))
    .command(
      '$0 [path]',
      'Generate method action types for a controller messenger',
      (yargsInstance) => {
        yargsInstance.positional('path', {
          type: 'string',
          description: 'Path to the folder where controllers are located',
          default: 'src',
        });
      },
    )
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

  return {
    check,
    fix,
    controllerPath: controllerPath as string,
  };
}

/**
 * Attempt to load ESLint from the current project. Returns null if unavailable.
 *
 * @returns An object with an ESLint instance and the ESLint class, or null values.
 */
async function loadESLint(): Promise<{
  eslint: InstanceType<typeof import('eslint').ESLint> | null;
  eslintStatic: typeof import('eslint').ESLint | null;
}> {
  try {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({
      fix: true,
      errorOnUnmatchedPattern: false,
    });
    return { eslint, eslintStatic: ESLint };
  } catch {
    return { eslint: null, eslintStatic: null };
  }
}

/**
 * Main entry point for the CLI.
 */
async function main(): Promise<void> {
  const { fix, controllerPath } = await parseCommandLineArguments();

  console.log('🔍 Searching for controllers with MESSENGER_EXPOSED_METHODS...');

  const controllers = await findControllersWithExposedMethods(controllerPath);

  if (controllers.length === 0) {
    console.log('⚠️  No controllers found with MESSENGER_EXPOSED_METHODS');
    return;
  }

  console.log(
    `📦 Found ${controllers.length} controller(s) with exposed methods`,
  );

  const { eslint, eslintStatic } = await loadESLint();

  if (fix) {
    await generateAllActionTypesFiles(controllers, eslint, eslintStatic);
    console.log('\n🎉 All action types generated successfully!');
  } else {
    await checkActionTypesFiles(controllers, eslint, eslintStatic);
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  globalThis.process.exitCode = 1;
});
