#!/usr/bin/env node

import yargs from 'yargs';

import { checkActionTypesFiles } from './check';
import { generateAllActionTypesFiles } from './fix';
import { findSourcesWithExposedMethods } from './parse-source';
import { Formatter } from './types';

type CommandLineArguments = {
  check: boolean;
  generate: boolean;
  formatter: Formatter;
  sourcePath: string;
  esm: boolean;
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
    generate,
    formatter,
    esm,
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
    .option('generate', {
      type: 'boolean',
      description: 'Generate/update action type files',
      default: false,
    })
    .option('formatter', {
      type: 'string',
      description: 'The formatter to use for formatting generated files',
      choices: ['oxfmt', 'prettier'],
      default: 'prettier',
    })
    .option('esm', {
      type: 'boolean',
      description: 'Add .js extensions to import paths for ESM compatibility',
      default: false,
    })
    .help()
    .check((argv) => {
      if (!argv.check && !argv.generate) {
        throw new Error('Either --check or --generate must be provided.\n');
      }
      return true;
    }).argv;

  return {
    check,
    generate,
    formatter: formatter as Formatter,
    sourcePath: sourcePath as string,
    esm,
  };
}

/**
 * Main entry point for the CLI.
 */
async function main(): Promise<void> {
  const { generate, sourcePath, formatter, esm } =
    await parseCommandLineArguments(globalThis.process.argv.slice(2));

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

  if (generate) {
    await generateAllActionTypesFiles(sources, formatter, esm);
    console.log('\n🎉 All action types generated successfully!');
  } else {
    const success = await checkActionTypesFiles(sources, formatter, esm);
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
