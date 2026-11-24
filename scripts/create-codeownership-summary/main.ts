import yargs from 'yargs';

import { generateCodeownershipSummary } from './generate-summary.ts';

/**
 * The most characters the summary may have with `--ci`, leaving room below
 * GitHub's comment size limit (65,536 characters) for the workflow's comment
 * marker.
 */
const MAX_SUMMARY_LENGTH_FOR_COMMENT = 60_000;

/**
 * Print a summary of which codeowners own the files changed on a branch. The
 * summary is what the Post Codeownership Summary workflow posts on pull
 * requests, so running this locally shows what the workflow will post.
 *
 * Everything that is accessed on `process` (e.g. stdout and stderr) is passed
 * in so that this function can be unit-tested.
 *
 * @param options - The process-level inputs and outputs.
 * @param options.argv - The command-line arguments, including the executable
 * and script path.
 * @param options.stdout - Where usage and the summary are written.
 * @param options.stderr - Where usage is written when the arguments are
 * invalid, along with any notices.
 * @param options.cwd - A directory within the Git repository to inspect.
 */
export async function main({
  argv,
  stdout,
  stderr,
  cwd,
}: {
  argv: string[];
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  cwd: string;
}): Promise<void> {
  let parseError: Error | undefined;
  const options = await yargs()
    .scriptName('create-codeownership-summary')
    .usage(
      'Print which codeowners own the files changed on a branch, using the CODEOWNERS file on the branch being merged into.\n\nThis is the summary that the Post Codeownership Summary workflow posts on pull requests.',
    )
    .option('base-ref', {
      type: 'string',
      default: 'main',
      description:
        'The branch being merged into. Its CODEOWNERS file determines who owns each file, and files are compared from its merge base with the head ref.',
    })
    .option('head-ref', {
      type: 'string',
      default: 'HEAD',
      description: 'The branch being merged. Uncommitted changes are ignored.',
    })
    .option('ci', {
      type: 'boolean',
      default: false,
      description:
        'Shorten the file lists if needed so that the summary fits in a GitHub comment, as the workflow does.',
    })
    .example('$0', 'Report the changes on the current branch')
    .example(
      '$0 --base-ref origin/main --head-ref my-branch',
      'Report the changes on my-branch compared with the remote main branch',
    )
    .example(
      '$0 --ci',
      'Report the changes exactly as the workflow would post them',
    )
    .strict()
    .help('help')
    .alias('help', 'h')
    // Don't exit the process after printing help or encountering an argument
    // error, so that the unit tests don't abort
    .exitProcess(false)
    // By default yargs prints help and errors to stdout and stderr, but we
    // use injected streams so we don't see output when running our tests
    .parseAsync(argv.slice(2), {}, (error, _parsed, output) => {
      parseError = error ?? undefined;
      if (output) {
        (error ? stderr : stdout).write(`${output}\n`);
      }
    });
  // Handle these manually (see above)
  if (parseError) {
    throw parseError;
  }
  if (options.help) {
    return;
  }

  const summary = await generateCodeownershipSummary({
    repositoryDirectoryPath: cwd,
    baseRef: options.baseRef,
    headRef: options.headRef,
    maxLength: options.ci ? MAX_SUMMARY_LENGTH_FOR_COMMENT : undefined,
  });
  if (summary) {
    stdout.write(summary);
  } else {
    // Even though this is not an error, we use stderr to ensure that the
    // workflow doesn't post this as a comment to the PR
    stderr.write('No changed files have codeowners.\n');
  }
}
