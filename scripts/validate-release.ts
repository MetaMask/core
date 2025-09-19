#!/usr/bin/env -S yarn ts-node

import * as core from '@actions/core';
import execa from 'execa';
import { escapeRegExp } from 'lodash';

const VALID_RELEASE_TITLE_PATTERNS = [
  'Release [version]',
  'Release v[version]',
  'Release/[version]',
  'Release/v[version]',
  'Release `[version]`',
];

const VALID_GITHUB_EVENT_NAMES = ['push', 'pull_request'] as const;
type GitHubEventName = (typeof VALID_GITHUB_EVENT_NAMES)[number];

const ReleaseValidationStatus = {
  NotARelease: 'not-a-release',
  InvalidRelease: 'invalid-release',
  ValidRelease: 'valid-release',
  IncompleteRelease: 'incomplete-release',
} as const;
type ReleaseValidationStatus =
  (typeof ReleaseValidationStatus)[keyof typeof ReleaseValidationStatus];

type WorkspaceInfo = {
  location: string;
  name: string;
};

type BaseValidationResult = { message: string };
type SuccessfulValidationResult = BaseValidationResult & { isSuccess: true };
type FailedValidationResult = BaseValidationResult & {
  isSuccess: false;
  errorMessage: string;
};
type ValidationResult = SuccessfulValidationResult | FailedValidationResult;
type RootVersionBumpedValidationResult = ValidationResult & {
  currentVersion: string;
};
type ReleaseTitleValidationResult = ValidationResult;
type AnyWorkspacePackageVersionBumpedValidationResult = ValidationResult;

type ReleaseValidationResult = {
  status: ReleaseValidationStatus;
  errorMessages: string[];
};

// Run the script.
main().catch((error) => {
  core.setFailed(error.message);
});

/**
 * The main function of the script.
 */
export async function main(): Promise<void> {
  console.log('Parsing arguments');
  console.log('-----------------\n');
  const {
    githubEventName,
    baseRef,
    headRef,
    possibleReleaseTitle,
    existingCommentId,
  } = parseCommandLineArguments();
  const botAlreadyCommented = existingCommentId !== '';
  console.log(`- GitHub event name: ${githubEventName}`);
  console.log(`- Base ref: ${baseRef}`);
  console.log(`- Head ref: ${headRef}`);
  console.log(`- Possible release title: ${possibleReleaseTitle}`);
  console.log(`- Bot already commented: ${botAlreadyCommented}`);
  console.log(`- Existing comment ID: ${existingCommentId || 'none'}`);
  console.log('');

  console.log('Running validations');
  console.log('-------------------\n');
  console.log('- Checking whether root version has been bumped...');
  const rootVersionBumpedResult = await validateRootVersionBumped(
    baseRef,
    headRef,
  );
  console.log(`  - ${rootVersionBumpedResult.message}`);
  console.log('- Checking format of release title...');
  const releaseTitleResult = validateReleaseTitle({
    githubEventName,
    possibleReleaseTitle,
    matchCurrentVersion: rootVersionBumpedResult.isSuccess
      ? rootVersionBumpedResult.currentVersion
      : null,
  });
  console.log(`  - ${releaseTitleResult.message}`);
  console.log('- Checking whether any workspace packages have been bumped...');
  const anyWorkspacePackageVersionBumpedResult =
    await validateAnyPublicWorkspacePackageBumped(baseRef, headRef);
  console.log(`  - ${anyWorkspacePackageVersionBumpedResult.message}`);

  console.log('\nSummarizing results');
  console.log('-------------------\n');
  const releaseValidationResult = getReleaseValidationResult(
    rootVersionBumpedResult,
    releaseTitleResult,
    anyWorkspacePackageVersionBumpedResult,
  );
  summarizeResults(releaseValidationResult, githubEventName);
  core.setOutput('RELEASE_VALIDATION_RESULT', releaseValidationResult.status);

  if (githubEventName === 'pull_request') {
    const commentMessage = generateReleaseValidationMessage(
      releaseValidationResult,
      botAlreadyCommented,
    );

    if (commentMessage) {
      core.setOutput('RELEASE_VALIDATION_MESSAGE', commentMessage);
    }
  }
}

/**
 * Summarizes the release validation results by logging appropriate messages.
 *
 * @param releaseValidationResult - The result of the release validation.
 * @param githubEventName - The GitHub event name (push or pull_request).
 */
function summarizeResults(
  releaseValidationResult: ReleaseValidationResult,
  githubEventName: GitHubEventName,
): void {
  switch (releaseValidationResult.status) {
    case ReleaseValidationStatus.ValidRelease:
      if (githubEventName === 'push') {
        console.log(
          'This appears to be a release commit. Release workflow will be run.',
        );
      } else {
        console.log(
          '✅ It appears that you have created a release PR, and it is valid. Good job!',
        );
      }
      break;
    case ReleaseValidationStatus.InvalidRelease:
      if (githubEventName === 'push') {
        console.log(
          'This does not appear to be a release commit. Release workflow will be skipped.',
        );
      } else {
        core.error('This release PR is invalid.');
        console.log('❌ This release PR is invalid.\n');
        console.log(
          'It appears that you have created a release PR, but the following checks failed:\n',
        );
        for (const errorMessage of releaseValidationResult.errorMessages) {
          console.log(`- ${errorMessage}`);
        }
        console.log(
          '\nAll of the checks above need to pass before you can merge this PR.',
        );
      }
      break;
    case ReleaseValidationStatus.IncompleteRelease:
      if (githubEventName === 'push') {
        console.log(
          'This does not appear to be a release commit. Release workflow will be skipped.',
        );
      } else {
        console.log('⚠️ This may be an incomplete release PR.');
        console.log(
          'It appears that you have attempted to create a release PR, but the following checks failed:\n',
        );
        for (const errorMessage of releaseValidationResult.errorMessages) {
          console.log(`- ${errorMessage}`);
        }
        console.log(
          '\nYou may merge this PR, but if you meant for this to be a release PR, you should get all of the checks above passing.',
        );
      }
      break;
    default:
      if (githubEventName === 'push') {
        console.log(
          'This does not appear to be a release commit. Release workflow will be skipped.',
        );
      } else {
        console.log(
          'This does not appear to be a release PR. You can merge this PR.',
        );
      }
      break;
  }
}

/**
 * Generates the release validation message for PR comments.
 *
 * @param releaseValidationResult - The result of the release validation.
 * @param botAlreadyCommented - Whether the bot has already commented on the PR.
 * @returns The comment message, or empty string if no comment is needed.
 */
function generateReleaseValidationMessage(
  releaseValidationResult: ReleaseValidationResult,
  botAlreadyCommented: boolean,
): string {
  let commentMessage = '';

  const isReleasePR =
    releaseValidationResult.status !== ReleaseValidationStatus.NotARelease;

  if (isReleasePR) {
    const greeting = 'Hello 👋';
    const marker = '<!-- METAMASKBOT-RELEASE-VALIDATION -->';

    switch (releaseValidationResult.status) {
      case ReleaseValidationStatus.InvalidRelease:
        commentMessage = `${greeting} It looks like you're trying to make a release PR, but some things don't look right:

${releaseValidationResult.errorMessages.map((msg) => `- ${msg}`).join('\n')}

**You'll need to get all of these checks passing before you can merge this PR.**

${marker}`;
        break;
      case ReleaseValidationStatus.IncompleteRelease:
        commentMessage = `${greeting} Are you trying to make a release PR? If so, some things don't look right:

${releaseValidationResult.errorMessages.map((msg) => `- ${msg}`).join('\n')}

You may merge this PR, but if you meant for this to be a release PR, you'll need to get all of these checks passing first. (Otherwise, you can ignore this comment.)

${marker}`;
        break;
      case ReleaseValidationStatus.ValidRelease:
        // If we previously commented but now it's valid, show success message
        if (botAlreadyCommented) {
          commentMessage = `This release PR previously had issues, but it looks like they have been fixed. Good job! 🎉

${marker}`;
        }
        // If it was always valid, no comment needed
        break;
      default:
        break;
    }
  } else if (botAlreadyCommented) {
    // If we previously thought it was a release PR but now it's not, update the comment
    commentMessage = `_(This PR was previously recognized as a potential release PR, and this comment reflected that, but it has since been downgraded to a regular PR, so there is nothing to see here.)_

<!-- METAMASKBOT-RELEASE-VALIDATION -->`;
  }

  return commentMessage;
}

/**
 * Gets the list of public workspace packages in the monorepo.
 *
 * @returns An array of public workspaces.
 */
async function getPublicWorkspaces(): Promise<WorkspaceInfo[]> {
  const { stdout } = await execa('yarn', [
    'workspaces',
    'list',
    '--json',
    '--no-private',
  ]);
  return stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

/**
 * Fetches the `package.json` in the directory from the base and head commits
 * and returns their version fields.
 *
 * @param baseRef - The ref of the first commit to fetch.
 * @param headRef - The ref of the second commit to fetch.
 * @param directory - The directory where `package.json` is located (must end
 * with `/`).
 * @returns The output.
 */
async function getPreviousAndCurrentPackageVersions(
  baseRef: string,
  headRef: string,
  directory: string,
): Promise<{ previousVersion: string; currentVersion: string }> {
  const { stdout: rawPreviousManifest } = await execa('git', [
    'show',
    `${baseRef}:${directory}package.json`,
  ]);
  const { stdout: rawCurrentManifest } = await execa('git', [
    'show',
    `${headRef}:${directory}package.json`,
  ]);

  const previousManifest = JSON.parse(rawPreviousManifest) as {
    version: string;
  };
  const currentManifest = JSON.parse(rawCurrentManifest) as { version: string };

  return {
    previousVersion: previousManifest.version,
    currentVersion: currentManifest.version,
  };
}

/**
 * Prints the usage for this script.
 */
function printUsage() {
  console.error(
    `
Identifies whether the given PR or commit is a release commit, and if so,
validates it by ensuring that the title of the PR or commit is formatted
correctly and the root package version is bumped alongside packages in the
monorepo.

USAGE: scripts/validate-release.ts <github-event-name> <base-ref> <head-ref> <possible-release-title> [existing-comment-id]

ARGUMENTS:

<github-event-name>
  The name of the event that spawned this GitHub workflow. Either "push" or
  "pull_request".
<base-ref>
  If GITHUB_EVENT_NAME is "pull_request", a ref to the base branch commit; if
  "push" then a ref to the commit before the push.
<head-ref>
  If GITHUB_EVENT_NAME is "pull_request", a ref to the head branch commit; if
  "push", then a ref to the head commit after the push.
<possible-release-title>
  If GITHUB_EVENT_NAME is "pull_request", the title of the pull request; if
  "push", then the subject of the head commit pushed.
[existing-comment-id]
  Required if GITHUB_EVENT_NAME is "pull_request", ignored otherwise. The ID
  of an existing comment from the MetaMask bot, or empty string if none exists.
`.trimStart(),
  );
}

/**
 * Prints an error and the program usage, then exits.
 *
 * @param message - The message to print.
 */
function failWithInvalidUsage(message: string) {
  console.error(`ERROR: ${message}\n`);
  printUsage();
  // This is okay, we want to exit early.
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}

/**
 * Parses the arguments given to the script.
 *
 * @returns The previous commit ID and release title prefix.
 */
function parseCommandLineArguments() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    failWithInvalidUsage('Expected at least 4 arguments.');
  }

  const githubEventName = args[0];
  const baseRef = args[1];
  const headRef = args[2];
  const possibleReleaseTitle = args[3];

  if (githubEventName === 'pull_request' && args.length < 5) {
    failWithInvalidUsage(
      'Expected a 5th argument (existing-comment-id) when GitHub event name is "pull_request".',
    );
  }

  const existingCommentId = args[4] || '';

  if (
    !(VALID_GITHUB_EVENT_NAMES as readonly string[]).includes(githubEventName)
  ) {
    failWithInvalidUsage(
      'Expected GitHub event name to be one of "push" or "pull_request".',
    );
  }

  return {
    githubEventName: githubEventName as GitHubEventName,
    baseRef,
    headRef,
    possibleReleaseTitle,
    existingCommentId,
  };
}

/**
 * Checks if the subject of the commit or title of the pull request matches that
 * which is expected of a release title.
 *
 * @param args - Arguments to this function.
 * @param args.githubEventName - The name of the event that spawned this GitHub
 * workflow.
 * @param args.possibleReleaseTitle - The title of the commit or PR to check.
 * @param args.matchCurrentVersion - If the possible title should include the
 * current version, that version; otherwise null.
 * @returns The result of the validation.
 */
function validateReleaseTitle({
  githubEventName,
  possibleReleaseTitle,
  matchCurrentVersion,
}: {
  githubEventName: GitHubEventName;
  possibleReleaseTitle: string;
  matchCurrentVersion: string | null;
}): ReleaseTitleValidationResult {
  const niceValidReleaseTitlePatterns = matchCurrentVersion
    ? VALID_RELEASE_TITLE_PATTERNS.map((pattern) =>
        pattern.replace('[version]', matchCurrentVersion),
      )
    : VALID_RELEASE_TITLE_PATTERNS;
  const validReleaseTitleRegexpSource = VALID_RELEASE_TITLE_PATTERNS.map(
    (pattern) =>
      escapeRegExp(pattern.replace('[version]', '__VERSION__')).replace(
        '__VERSION__',
        matchCurrentVersion ?? '\\d+\\.\\d+\\.\\d+',
      ),
  )
    .map((pattern) => `(?:${pattern})`)
    .join('|');
  const validReleaseTitleRegexp = new RegExp(
    `^(?:${validReleaseTitleRegexpSource})$`,
    'u',
  );
  const match = possibleReleaseTitle.match(validReleaseTitleRegexp);
  const source =
    githubEventName === 'push' ? 'commit message' : 'pull request title';

  if (match) {
    return {
      isSuccess: true,
      message: `The ${source} "${possibleReleaseTitle}" matches a valid release title format`,
    };
  }
  return {
    isSuccess: false,
    message: `The ${source} "${possibleReleaseTitle}" does not match a valid release title format`,
    errorMessage: `Your ${source} must match one of the following formats: ${niceValidReleaseTitlePatterns
      .map((pattern) => {
        if (pattern.includes('`')) {
          return `\`\` ${pattern} \`\``;
        }
        return `\`${pattern}\``;
      })
      .join(', ')}`,
  };
}

/**
 * Checks if the version in the the root package's `package.json` has been
 * bumped.
 *
 * @param baseRef - The base commit ref.
 * @param headRef - The head commit ref.
 * @returns The result of the validation.
 */
async function validateRootVersionBumped(
  baseRef: string,
  headRef: string,
): Promise<RootVersionBumpedValidationResult> {
  const { previousVersion, currentVersion } =
    await getPreviousAndCurrentPackageVersions(baseRef, headRef, './');

  console.log(
    'Previous version:',
    previousVersion,
    'Current version:',
    currentVersion,
  );

  if (currentVersion !== previousVersion) {
    return {
      isSuccess: true,
      message: `Root package version has been bumped from ${previousVersion} to ${currentVersion}`,
      currentVersion,
    };
  }

  return {
    isSuccess: false,
    message: 'Root package version has not been bumped',
    errorMessage: 'Root package version must be bumped',
    currentVersion,
  };
}

/**
 * Checks if any of the versions among workspace package have been bumped.
 *
 * @param baseRef - The base commit ref.
 * @param headRef - The head commit ref.
 * @returns The result of the validation.
 */
async function validateAnyPublicWorkspacePackageBumped(
  baseRef: string,
  headRef: string,
): Promise<AnyWorkspacePackageVersionBumpedValidationResult> {
  const publicWorkspaces = await getPublicWorkspaces();

  const workspacesWithVersions = await Promise.all(
    publicWorkspaces.map(async (publicWorkspace) => {
      const { previousVersion, currentVersion } =
        await getPreviousAndCurrentPackageVersions(
          baseRef,
          headRef,
          `${publicWorkspace.location}/`,
        );

      return { name: publicWorkspace.name, previousVersion, currentVersion };
    }),
  );
  const bumpedWorkspacesWithVersions = workspacesWithVersions.filter(
    (workspace) => workspace.currentVersion !== workspace.previousVersion,
  );

  if (bumpedWorkspacesWithVersions.length > 0) {
    return {
      isSuccess: true,
      message: `${bumpedWorkspacesWithVersions.length} workspace package(s) have been bumped`,
    };
  }

  return {
    isSuccess: false,
    message: 'No workspace packages have been bumped',
    errorMessage: 'You must bump one of the packages in this monorepo',
  };
}

/**
 * Determines the release validation status from how many validations succeeded.
 *
 * @param rootVersionBumpedResult - The "root version bumped" validation result.
 * @param releaseTitleResult - The "release title" validation result.
 * @param anyWorkspacePackageVersionBumpedResult - The "any workspace package
 * version bumped" validation result.
 * @returns The overall release validation status.
 */
function getReleaseValidationResult(
  rootVersionBumpedResult: RootVersionBumpedValidationResult,
  releaseTitleResult: ReleaseTitleValidationResult,
  anyWorkspacePackageVersionBumpedResult: AnyWorkspacePackageVersionBumpedValidationResult,
) {
  const errorMessages = [
    rootVersionBumpedResult,
    releaseTitleResult,
    anyWorkspacePackageVersionBumpedResult,
  ]
    .filter((result): result is FailedValidationResult => !result.isSuccess)
    .map((result) => result.errorMessage);

  if (rootVersionBumpedResult.isSuccess) {
    if (
      releaseTitleResult.isSuccess &&
      anyWorkspacePackageVersionBumpedResult.isSuccess
    ) {
      return {
        status: ReleaseValidationStatus.ValidRelease,
        errorMessages,
      };
    }
    return {
      status: ReleaseValidationStatus.InvalidRelease,
      errorMessages,
    };
  }

  if (
    !releaseTitleResult.isSuccess &&
    !anyWorkspacePackageVersionBumpedResult.isSuccess
  ) {
    return {
      status: ReleaseValidationStatus.NotARelease,
      errorMessages,
    };
  }
  return {
    status: ReleaseValidationStatus.IncompleteRelease,
    errorMessages,
  };
}
