#!/usr/bin/env node

import yargs from 'yargs';

import { checkActionTypesFiles } from './check';
import { generateAllActionTypesFiles } from './fix';
import { findSourcesWithExposedMethods } from './parse-source';
import type { ESLint } from './types';

type CommandLineArguments = {
  check: boolean;
  fix: boolean;
  sourcePath: string;
};

/**
 * Parses the given CLI arguments.
 *
 * @param args - The arguments to parse.
 * @returns The parsed command line arguments.
 */
async function parseCommandLineArguments(
  args: string[],
): Promise<CommandLineArguments> {
  const {
    check,
    fix,
    path: sourcePath,
  } = await yargs(args)
    .command(
      '$0 [path]',
      'Generate method action types for controller and service messengers',
      (yargsInstance) => {
        yargsInstance.positional('path', {
          type: 'string',
          description:
            'Path to the folder where controllers/services are located',
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
    sourcePath: sourcePath as string,
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
    return {
      instance,
      eslintClass: ESLintClass,
    };
  } catch {
    console.warn(
      '⚠️  ESLint could not be loaded. Generated files will not be formatted.',
    );
    return null;
  }
}

/**
 * Main entry point for the CLI.
 */
async function main(): Promise<void> {
  const { fix, sourcePath } = await parseCommandLineArguments(
    globalThis.process.argv.slice(2),
  );

  console.log(
    '🔍 Searching for controllers/services with MESSENGER_EXPOSED_METHODS...',
  );

  const sources = await findSourcesWithExposedMethods(sourcePath);

  if (sources.length === 0) {
    console.log(
      '⚠️  No controllers/services found with MESSENGER_EXPOSED_METHODS',
    );
    return;
  }

  console.log(
    `📦 Found ${sources.length} controller(s)/service(s) with exposed methods`,
  );

  const eslint = await loadESLint();

  if (fix) {
    const success = await generateAllActionTypesFiles(sources, eslint);
    if (success) {
      console.log('\n🎉 All action types generated successfully!');
    } else {
      // eslint-disable-next-line no-restricted-globals
      process.exitCode = 1;
    }
  } else {
    const success = await checkActionTypesFiles(sources, eslint);
    if (!success) {
      // eslint-disable-next-line no-restricted-globals
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  // eslint-disable-next-line no-restricted-globals
  process.exitCode = 1;
});
