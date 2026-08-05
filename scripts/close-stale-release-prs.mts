/**
 * Close inactive same-repo `release/*` PRs, comment with the outcome, and
 * delete the branch when the tip is unchanged.
 *
 * Usage (from GitHub Actions):
 *   GITHUB_TOKEN=... yarn tsx scripts/close-stale-release-prs.mts
 */

import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { Duration, getErrorMessage, inMilliseconds } from '@metamask/utils';

/**
 * The label users can use to prevent stale release PRs from being auto-closed.
 */
const SKIP_LABEL = 'release:keep-open';

/**
 * How long inactive release PRs stay open before auto-close.
 */
const STALE_DURATION_HOURS = 3;

/**
 * How long inactive release PRs stay open before auto-close (milliseconds).
 */
const STALE_DURATION_MS = inMilliseconds(STALE_DURATION_HOURS, Duration.Hour);

const PULL_REQUEST_SNAPSHOT_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        number
        state
        updatedAt
        isInMergeQueue
        autoMergeRequest {
          enabledAt
        }
        labels(first: 100) {
          nodes {
            name
          }
        }
        headRefName
        headRefOid
        headRepository {
          isFork
        }
      }
    }
  }
`;

type Octokit = ReturnType<typeof getOctokit>;

type PullRequestSnapshot = {
  number: number;
  state: string;
  updatedAt: string;
  isInMergeQueue: boolean;
  autoMergeRequest: { enabledAt: string } | null;
  labels: { nodes: { name: string }[] };
  headRefName: string;
  headRefOid: string;
  headRepository: { isFork: boolean } | null;
};

type ListedPullRequest = Awaited<
  ReturnType<Octokit['rest']['pulls']['list']>
>['data'][number];

type BranchDeleteOutcome = {
  outcome:
    | 'deleted'
    | 'kept-refresh-failed'
    | 'kept-head-moved'
    | 'kept-delete-failed';
  detail: string;
};

type StaleEligibility = { eligible: true; ageMs: number } | { eligible: false };

/**
 * Label names from a GraphQL PR snapshot.
 *
 * @param pullRequest - GraphQL pull request snapshot.
 * @returns Label name list.
 */
function pullRequestLabelNames(pullRequest: PullRequestSnapshot): string[] {
  return pullRequest.labels.nodes.map((label) => label.name);
}

/**
 * Fetch PR state, labels, head tip, and merge-queue info in one GraphQL query.
 *
 * @param octokit - Authenticated Octokit client.
 * @param pullNumber - Pull request number.
 * @returns Pull request snapshot.
 */
async function getPullRequestSnapshot(
  octokit: Octokit,
  pullNumber: number,
): Promise<PullRequestSnapshot> {
  const { owner, repo } = context.repo;
  const response = await octokit.graphql<{
    repository: { pullRequest: PullRequestSnapshot | null };
  }>(PULL_REQUEST_SNAPSHOT_QUERY, {
    owner,
    repo,
    number: pullNumber,
  });

  const { pullRequest } = response.repository;
  if (!pullRequest) {
    throw new Error(`Pull request #${pullNumber} was not found`);
  }

  return pullRequest;
}

/**
 * Whether a listed PR head is a same-repo `release/*` branch that is not skipped.
 *
 * @param pullRequest - Pull request from `pulls.list`.
 * @returns True when the PR is a candidate for stale close.
 */
function isReleasePrCandidate(pullRequest: ListedPullRequest): boolean {
  if (!pullRequest.head.ref.startsWith('release/')) {
    return false;
  }

  // Only manage same-repo release branches (never forks).
  if (!pullRequest.head.repo || pullRequest.head.repo.fork) {
    return false;
  }

  if (pullRequest.labels.some((label) => label.name === SKIP_LABEL)) {
    core.info(
      `Skipping #${pullRequest.number} (${pullRequest.head.ref}): skip label "${SKIP_LABEL}"`,
    );
    return false;
  }

  return true;
}

/**
 * Whether merge-queue or auto-merge is active for the PR.
 *
 * @param pullRequest - GraphQL pull request snapshot.
 * @returns True when a merge is already in progress.
 */
function isMergeInProgress(pullRequest: PullRequestSnapshot): boolean {
  return pullRequest.isInMergeQueue || pullRequest.autoMergeRequest !== null;
}

/**
 * Evaluate whether a PR snapshot is eligible to close as stale.
 *
 * Skip-label is re-checked so a label added after the initial list filter still
 * prevents auto-close.
 *
 * @param options - Evaluation inputs.
 * @param options.pullRequest - Fresh GraphQL pull request snapshot.
 * @param options.staleBefore - Epoch ms; PRs updated at/after this are kept.
 * @returns Eligibility result.
 */
function evaluateStaleEligibility({
  pullRequest,
  staleBefore,
}: {
  pullRequest: PullRequestSnapshot;
  staleBefore: number;
}): StaleEligibility {
  const ref = pullRequest.headRefName;

  if (pullRequest.state !== 'OPEN') {
    core.info(`Skipping #${pullRequest.number} (${ref}): no longer open`);
    return { eligible: false };
  }

  if (pullRequestLabelNames(pullRequest).includes(SKIP_LABEL)) {
    core.info(
      `Skipping #${pullRequest.number} (${ref}): skip label "${SKIP_LABEL}"`,
    );
    return { eligible: false };
  }

  if (pullRequest.headRepository?.isFork) {
    core.info(`Skipping #${pullRequest.number} (${ref}): fork head`);
    return { eligible: false };
  }

  const updatedAtMs = Date.parse(pullRequest.updatedAt);
  if (updatedAtMs >= staleBefore) {
    core.info(
      `Skipping #${pullRequest.number} (${ref}): has not reached stale age of ${STALE_DURATION_HOURS}h yet (updated ${Math.round((Date.now() - updatedAtMs) / Duration.Minute)}m ago)`,
    );
    return { eligible: false };
  }

  if (isMergeInProgress(pullRequest)) {
    core.info(`Skipping #${pullRequest.number} (${ref}): merge in progress`);
    return { eligible: false };
  }

  return { eligible: true, ageMs: Date.now() - updatedAtMs };
}

/**
 * Close the pull request.
 *
 * @param octokit - Authenticated Octokit client.
 * @param pullNumber - Pull request number.
 * @param headRef - Head branch name for logging.
 * @returns True when the close succeeded.
 */
async function closePullRequest(
  octokit: Octokit,
  pullNumber: number,
  headRef: string,
): Promise<boolean> {
  const { owner, repo } = context.repo;
  try {
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: 'closed',
    });
    return true;
  } catch (error) {
    core.warning(
      `Failed to close #${pullNumber} (${headRef}): ${getErrorMessage(error)}`,
    );
    return false;
  }
}

/**
 * Delete the release branch when its tip still matches the expected SHA.
 *
 * @param options - Delete inputs.
 * @param options.octokit - Authenticated Octokit client.
 * @param options.pullNumber - Closed pull request number.
 * @param options.expectedHeadRef - Branch name to delete.
 * @param options.expectedHeadSha - SHA that must still be the tip.
 * @returns Branch deletion outcome.
 */
async function deleteBranchIfUnchanged({
  octokit,
  pullNumber,
  expectedHeadRef,
  expectedHeadSha,
}: {
  octokit: Octokit;
  pullNumber: number;
  expectedHeadRef: string;
  expectedHeadSha: string;
}): Promise<BranchDeleteOutcome> {
  const { owner, repo } = context.repo;
  let branchSha: string;

  try {
    const { data: branchRef } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${expectedHeadRef}`,
    });
    branchSha = branchRef.object.sha;
  } catch (error) {
    const message = getErrorMessage(error);
    core.warning(
      `Closed #${pullNumber} but failed to refresh ${expectedHeadRef} before delete: ${message}`,
    );
    return { outcome: 'kept-refresh-failed', detail: message };
  }

  if (branchSha !== expectedHeadSha) {
    const detail = `head moved from ${expectedHeadSha} to ${branchSha}`;
    core.warning(
      `Closed #${pullNumber} but skipped deleting ${expectedHeadRef}: ${detail}`,
    );
    return { outcome: 'kept-head-moved', detail };
  }

  try {
    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${expectedHeadRef}`,
    });
    core.info(`Closed #${pullNumber} and deleted branch ${expectedHeadRef}`);
    return { outcome: 'deleted', detail: '' };
  } catch (error) {
    const message = getErrorMessage(error);
    core.warning(
      `Closed #${pullNumber} but failed to delete ${expectedHeadRef}: ${message}`,
    );
    return { outcome: 'kept-delete-failed', detail: message };
  }
}

/**
 * Build a link to the current workflow run.
 *
 * @returns Workflow run URL.
 */
function getWorkflowRunUrl(): string {
  return `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
}

/**
 * Build the PR comment body for a completed stale close.
 *
 * @param options - Comment inputs.
 * @param options.inactiveHours - Formatted inactivity duration.
 * @param options.outcome - Branch deletion outcome key.
 * @returns Markdown comment body.
 */
function buildCloseComment({
  inactiveHours,
  outcome,
}: {
  inactiveHours: string;
  outcome: BranchDeleteOutcome['outcome'];
}): string {
  const lines = [
    '## This pull request has been closed',
    '',
    `This release PR was automatically closed because it had no activity for ${STALE_DURATION_HOURS} hours (last updated ${inactiveHours}h ago).`,
    '',
    'Open release PRs are expected to merge promptly so they do not block others from starting a new release.',
    '',
    `To keep a release PR open longer in exceptional cases, add the \`${SKIP_LABEL}\` label.`,
  ];

  // GitHub already surfaces successful branch deletion on the closed PR.
  // Call out real failures and intentional tip move skips separately.
  if (outcome === 'kept-head-moved') {
    lines.push(
      '',
      `> (Branch was left in place because its tip changed after close. See more details here: ${getWorkflowRunUrl()})`,
    );
  } else if (outcome !== 'deleted') {
    lines.push(
      '',
      `> (A failed attempt was made to delete this branch. See more details here: ${getWorkflowRunUrl()})`,
    );
  }

  lines.push('', '<!-- stale-release-pr-comment -->');
  return lines.join('\n');
}

/**
 * Post the stale-close comment on the pull request.
 *
 * @param octokit - Authenticated Octokit client.
 * @param pullNumber - Pull request number.
 * @param body - Markdown comment body.
 */
async function commentOnPullRequest(
  octokit: Octokit,
  pullNumber: number,
  body: string,
): Promise<void> {
  const { owner, repo } = context.repo;
  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  } catch (error) {
    core.warning(
      `Closed #${pullNumber} but failed to comment: ${getErrorMessage(error)}`,
    );
  }
}

/**
 * Process a single stale release PR candidate.
 *
 * @param options - Processing inputs.
 * @param options.octokit - Authenticated Octokit client.
 * @param options.candidate - Candidate from the initial open-PR list.
 * @param options.staleBefore - Epoch ms; PRs updated at/after this are kept.
 */
async function processReleasePr({
  octokit,
  candidate,
  staleBefore,
}: {
  octokit: Octokit;
  candidate: ListedPullRequest;
  staleBefore: number;
}): Promise<void> {
  let pullRequest: PullRequestSnapshot;
  try {
    pullRequest = await getPullRequestSnapshot(octokit, candidate.number);
  } catch (error) {
    core.warning(
      `Failed to refresh #${candidate.number} (${candidate.head.ref}): ${getErrorMessage(error)}`,
    );
    return;
  }

  const eligibility = evaluateStaleEligibility({ pullRequest, staleBefore });
  if (!eligibility.eligible) {
    return;
  }

  const inactiveHours = (eligibility.ageMs / Duration.Hour).toFixed(1);

  // Close before commenting so a failed close does not bump updatedAt.
  const closed = await closePullRequest(
    octokit,
    pullRequest.number,
    pullRequest.headRefName,
  );
  if (!closed) {
    return;
  }

  const branchResult = await deleteBranchIfUnchanged({
    octokit,
    pullNumber: pullRequest.number,
    expectedHeadRef: pullRequest.headRefName,
    expectedHeadSha: pullRequest.headRefOid,
  });

  const body = buildCloseComment({
    inactiveHours,
    outcome: branchResult.outcome,
  });

  await commentOnPullRequest(octokit, pullRequest.number, body);
}

/**
 * Close inactive same-repo `release/*` PRs.
 */
async function main(): Promise<void> {
  // GitHub Actions provides the token via the environment for this workflow.
  // eslint-disable-next-line n/no-process-env
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.setFailed('GITHUB_TOKEN is required');
    return;
  }

  const octokit = getOctokit(token);
  const staleBefore = Date.now() - STALE_DURATION_MS;
  const { owner, repo } = context.repo;

  const pullRequests: ListedPullRequest[] = await octokit.paginate(
    octokit.rest.pulls.list,
    {
      owner,
      repo,
      state: 'open',
      per_page: 100,
    },
  );

  const releasePrs = pullRequests.filter(isReleasePrCandidate);

  if (releasePrs.length === 0) {
    core.info('No open release PRs to evaluate.');
    return;
  }

  for (const candidate of releasePrs) {
    await processReleasePr({
      octokit,
      candidate,
      staleBefore,
    });
  }
}

main().catch((error: unknown) => {
  core.setFailed(getErrorMessage(error));
  process.exitCode = 1;
});
