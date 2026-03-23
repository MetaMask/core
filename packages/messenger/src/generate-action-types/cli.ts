#!/usr/bin/env node

import yargs from 'yargs';

import { checkActionTypesFiles } from './check';
import { generateAllActionTypesFiles } from './fix';
import { findControllersWithExposedMethods } from './parse-source';
import type { ESLint } from './types';

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
 * @returns An ESLint object with instance and static methods, or null if unavailable.
 */
async function loadESLint(): Promise<ESLint | null> {
  try {
    const { ESLint: ESLintClass } = await import('eslint');
    const instance = new ESLintClass({
      fix: true,
      errorOnUnmatchedPattern: false,
    });
    return { instance, static: ESLintClass };
  } catch {
    return null;
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

  const eslint = await loadESLint();

  if (fix) {
    await generateAllActionTypesFiles(controllers, eslint);
    console.log('\n🎉 All action types generated successfully!');
  } else {
    await checkActionTypesFiles(controllers, eslint);
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  globalThis.process.exitCode = 1;
});
