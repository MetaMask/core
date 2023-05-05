import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import execa from 'execa';

/**
 * The mode in which to run this script.
 */
enum Mode {
  /**
   * Reports lint violations.
   */
  Check = 'check',
  /**
   * Reports lint violations, but also attempts to automatically fix them.
   */
  Fix = 'fix',
}

/**
 * The entrypoint to this script.
 */
async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage('Run lint.')
    .option('fix', {
      alias: 'f',
      describe: 'Fix lint violations rather than just reporting them.',
      type: 'boolean',
      default: false,
    })
    .help()
    .parse();

  const mode: Mode = args.fix ? Mode.Fix : Mode.Check;
  const filePaths = args._.map((arg) => arg.toString());
  console.log('filePaths', filePaths);

  await lintScripts(mode, filePaths);
  await lintPackageManifests(mode);
  await lintOtherFiles(mode, filePaths);
}

/**
 * Lints JavaScript or TypeScript files.
 *
 * @param mode - When "check", reports the errors; when "fix", fixes errors.
 * @param filePaths - An optional list of file paths to lint. If not
 * specified, defaults to the whole project.
 */
async function lintScripts(mode: Mode, filePaths: string[]) {
  const supportedExtensions = ['js', 'ts'];
  const filteredFilePaths = filePaths.filter((filePath) =>
    supportedExtensions.some((extension) => filePath.endsWith(`.${extension}`)),
  );
  const filePatterns =
    filteredFilePaths.length === 0 ? ['.'] : filteredFilePaths;
  const command = [
    'eslint',
    '--cache',
    '--ext',
    supportedExtensions.join(','),
    ...(mode === Mode.Fix ? ['--fix'] : []),
    ...filePatterns,
  ];

  await runCommand('Linting scripts', command);
}

/**
 * Lints package manifests across the monorepo using Yarn's constraint rules.
 *
 * @param mode - When "check", reports the errors; when "fix", fixes errors.
 */
async function lintPackageManifests(mode: Mode) {
  const command = [
    'yarn',
    'constraints',
    ...(mode === Mode.Fix ? ['--fix'] : []),
  ];

  await runCommand('Linting package manifests', command);
}

/**
 * Lints JSON, Markdown, and YAML files (except changelogs and the Yarn
 * configuration file).
 *
 * @param mode - When "check", reports the errors; when "fix", fixes errors.
 * @param filePaths - An optional list of file paths to lint. If not
 * specified, defaults to the whole project.
 */
async function lintOtherFiles(mode: Mode, filePaths: string[]) {
  const supportedExtensions = ['json', 'md', 'yml'];
  const filteredFilePaths = filePaths.filter((filePath) =>
    supportedExtensions.some((extension) => filePath.endsWith(`.${extension}`)),
  );
  const filePatterns =
    filteredFilePaths.length === 0
      ? supportedExtensions.map((extension) => `**/*.${extension}`)
      : filteredFilePaths;
  const command = [
    'prettier',
    '--ignore-path',
    '.gitignore',
    mode === Mode.Fix ? '--fix' : '--check',
    ...filePatterns,
    '!**/CHANGELOG.md',
    '!**/CHANGELOG.old.md',
    '!.yarnrc.yml',
  ];

  await runCommand('Linting other files', command);
}

/**
 * Runs a command, printing a description of what is being run and the result.
 *
 * @param description - The description.
 * @param command - The command.
 */
async function runCommand(description: string, command: string[]) {
  process.stdout.write(`${description}... `);

  console.log(command);

  const { all, failed } = await execa(command[0], command.slice(1));

  if (failed) {
    process.stdout.write('\n');

    if (all) {
      process.stderr.write(all);
    }
  } else {
    process.stdout.write('done!\n');
  }
}

main().catch(console.error);
