/**
 * Close inactive same-repo `release/*` PRs, comment with the outcome, and
 * delete the branch when the tip is unchanged.
 *
 * Intended to be invoked from `actions/github-script`:
 * `await require('./.github/scripts/close-stale-release-prs.cjs')({ github, context, core });`
 */

// Optional escape hatch for long-running releases that must stay open.
const STALE_HOURS = 3;
const EXEMPT_LABEL = 'release:keep-open';
const STALE_MS = STALE_HOURS * 60 * 60 * 1000;

const MERGE_STATE_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        isInMergeQueue
        autoMergeRequest {
          enabledAt
        }
      }
    }
  }
`;

/**
 * Stable fingerprint of a PR's label set for equality checks.
 *
 * @param {Array<{ name: string }>} labels - PR labels from the GitHub API.
 * @returns {string} Sorted, joined label names.
 */
function labelKey(labels) {
  return labels
    .map((label) => label.name)
    .sort()
    .join('\0');
}

/**
 * Load merge-queue / auto-merge state for a pull request.
 *
 * @param {object} github - Octokit client from `actions/github-script`.
 * @param {string} owner - Repository owner.
 * @param {string} repo - Repository name.
 * @param {number} pullNumber - Pull request number.
 * @returns {Promise<{ isInMergeQueue: boolean, autoMergeRequest: object | null }>}
 * Merge state for the pull request.
 */
async function getMergeState(github, owner, repo, pullNumber) {
  const mergeQueue = await github.graphql(MERGE_STATE_QUERY, {
    owner,
    repo,
    number: pullNumber,
  });
  return mergeQueue.repository.pullRequest;
}

/**
 * Fetch a pull request by number.
 *
 * @param {object} github - Octokit client from `actions/github-script`.
 * @param {string} owner - Repository owner.
 * @param {string} repo - Repository name.
 * @param {number} pullNumber - Pull request number.
 * @returns {Promise<object>} Pull request payload.
 */
async function getPull(github, owner, repo, pullNumber) {
  const { data } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  return data;
}

/**
 * Whether a PR head is a same-repo `release/*` branch that is not exempt.
 *
 * @param {object} pr - Pull request payload.
 * @param {string} owner - Repository owner.
 * @param {string} repo - Repository name.
 * @param {object} core - `@actions/core` helpers.
 * @returns {boolean} True when the PR is a candidate for stale close.
 */
function isReleasePrCandidate(pr, owner, repo, core) {
  if (!pr.head.ref.startsWith('release/')) {
    return false;
  }

  // Only manage same-repo release branches (never forks).
  if (pr.head.repo?.full_name !== `${owner}/${repo}`) {
    return false;
  }

  if (pr.labels.some((label) => label.name === EXEMPT_LABEL)) {
    core.info(
      `Skipping #${pr.number} (${pr.head.ref}): exempt label "${EXEMPT_LABEL}"`,
    );
    return false;
  }

  return true;
}

/**
 * Whether merge-queue or auto-merge is active for the PR.
 *
 * @param {{ isInMergeQueue: boolean, autoMergeRequest: object | null }} mergeState -
 * GraphQL merge state.
 * @returns {boolean} True when a merge is already in progress.
 */
function isMergeInProgress(mergeState) {
  return Boolean(mergeState.isInMergeQueue || mergeState.autoMergeRequest);
}

/**
 * Evaluate whether a refreshed PR is still eligible to close as stale.
 *
 * @param {object} options - Evaluation inputs.
 * @param {object} options.pr - Fresh pull request payload.
 * @param {number} options.now - Epoch ms used for the stale window.
 * @param {object} options.core - `@actions/core` helpers.
 * @param {string} [options.phase] - Log suffix describing the check phase.
 * @returns {{ eligible: boolean, ageMs?: number }} Eligibility result.
 */
function evaluateStaleEligibility({ pr, now, core, phase = '' }) {
  const suffix = phase ? ` ${phase}` : '';

  if (pr.state !== 'open') {
    core.info(
      `Skipping #${pr.number} (${pr.head.ref}): no longer open${suffix}`,
    );
    return { eligible: false };
  }

  if (pr.labels.some((label) => label.name === EXEMPT_LABEL)) {
    core.info(
      `Skipping #${pr.number} (${pr.head.ref}): exempt label "${EXEMPT_LABEL}"${suffix}`,
    );
    return { eligible: false };
  }

  const ageMs = now - Date.parse(pr.updated_at);
  if (ageMs < STALE_MS) {
    core.info(
      `Skipping #${pr.number} (${pr.head.ref}): updated ${Math.round(ageMs / 60000)}m ago${suffix}`,
    );
    return { eligible: false };
  }

  return { eligible: true, ageMs };
}

/**
 * Confirm the PR snapshot has not changed since the pre-close checks.
 *
 * @param {object} options - Comparison inputs.
 * @param {object} options.latestPr - Most recent pull request payload.
 * @param {string} options.expectedUpdatedAt - Previously observed `updated_at`.
 * @param {string} options.expectedHeadSha - Previously observed head SHA.
 * @param {string} options.expectedHeadRef - Previously observed head ref.
 * @param {string} options.expectedLabels - Previously observed label fingerprint.
 * @param {object} options.core - `@actions/core` helpers.
 * @returns {boolean} True when the snapshot is unchanged and still stale.
 */
function isUnchangedBeforeClose({
  latestPr,
  expectedUpdatedAt,
  expectedHeadSha,
  expectedHeadRef,
  expectedLabels,
  core,
}) {
  if (labelKey(latestPr.labels) !== expectedLabels) {
    core.info(
      `Skipping #${latestPr.number} (${latestPr.head.ref}): labels changed before close`,
    );
    return false;
  }

  if (
    latestPr.updated_at !== expectedUpdatedAt ||
    latestPr.head.sha !== expectedHeadSha ||
    latestPr.head.ref !== expectedHeadRef
  ) {
    core.info(
      `Skipping #${latestPr.number} (${latestPr.head.ref}): activity or head changed before close`,
    );
    return false;
  }

  if (Date.now() - Date.parse(latestPr.updated_at) < STALE_MS) {
    core.info(
      `Skipping #${latestPr.number} (${latestPr.head.ref}): no longer stale before close`,
    );
    return false;
  }

  return true;
}

/**
 * Close the pull request.
 *
 * @param {object} github - Octokit client from `actions/github-script`.
 * @param {string} owner - Repository owner.
 * @param {string} repo - Repository name.
 * @param {object} pr - Pull request payload.
 * @param {object} core - `@actions/core` helpers.
 * @returns {Promise<boolean>} True when the close succeeded.
 */
async function closePullRequest(github, owner, repo, pr, core) {
  try {
    await github.rest.pulls.update({
      owner,
      repo,
      pull_number: pr.number,
      state: 'closed',
    });
    return true;
  } catch (error) {
    core.warning(
      `Failed to close #${pr.number} (${pr.head.ref}): ${error.message}`,
    );
    return false;
  }
}

/**
 * Delete the release branch when its tip still matches the expected SHA.
 *
 * @param {object} options - Delete inputs.
 * @param {object} options.github - Octokit client from `actions/github-script`.
 * @param {string} options.owner - Repository owner.
 * @param {string} options.repo - Repository name.
 * @param {number} options.pullNumber - Closed pull request number.
 * @param {string} options.expectedHeadRef - Branch name to delete.
 * @param {string} options.expectedHeadSha - SHA that must still be the tip.
 * @param {object} options.core - `@actions/core` helpers.
 * @returns {Promise<{ outcome: string, detail: string, branchSha?: string }>}
 * Branch deletion outcome.
 */
async function deleteBranchIfUnchanged({
  github,
  owner,
  repo,
  pullNumber,
  expectedHeadRef,
  expectedHeadSha,
  core,
}) {
  let branchSha;

  try {
    const { data: branchRef } = await github.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${expectedHeadRef}`,
    });
    branchSha = branchRef.object.sha;
  } catch (error) {
    core.warning(
      `Closed #${pullNumber} but failed to refresh ${expectedHeadRef} before delete: ${error.message}`,
    );
    return { outcome: 'kept-refresh-failed', detail: error.message };
  }

  if (branchSha !== expectedHeadSha) {
    const detail = `head moved from ${expectedHeadSha} to ${branchSha}`;
    core.warning(
      `Closed #${pullNumber} but skipped deleting ${expectedHeadRef}: ${detail}`,
    );
    return { outcome: 'kept-head-moved', detail, branchSha };
  }

  try {
    await github.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${expectedHeadRef}`,
    });
    core.info(`Closed #${pullNumber} and deleted branch ${expectedHeadRef}`);
    return { outcome: 'deleted', detail: '', branchSha };
  } catch (error) {
    core.warning(
      `Closed #${pullNumber} but failed to delete ${expectedHeadRef}: ${error.message}`,
    );
    return { outcome: 'kept-delete-failed', detail: error.message, branchSha };
  }
}

/**
 * Build the PR comment body for a completed stale close.
 *
 * @param {object} options - Comment inputs.
 * @param {string} options.inactiveHours - Formatted inactivity duration.
 * @param {string} options.expectedHeadRef - Release branch name.
 * @param {string} options.expectedHeadSha - Head SHA at close time.
 * @param {string} options.outcome - Branch deletion outcome key.
 * @param {string} options.detail - Extra outcome detail.
 * @param {string} [options.branchSha] - Current branch tip when kept.
 * @returns {string} Markdown comment body.
 */
function buildCloseComment({
  inactiveHours,
  expectedHeadRef,
  expectedHeadSha,
  outcome,
  detail,
  branchSha,
}) {
  let branchStatusLines;
  if (outcome === 'deleted') {
    branchStatusLines = [
      `The release branch \`${expectedHeadRef}\` has been deleted. If you still need to publish these packages, start a fresh release with \`yarn create-release-branch\`.`,
    ];
  } else if (outcome === 'kept-head-moved') {
    branchStatusLines = [
      `The release branch \`${expectedHeadRef}\` was **not** deleted because its tip changed after close (\`${expectedHeadSha}\` → \`${branchSha}\`).`,
      '',
      'Delete the branch manually if it is no longer needed, or open a new release PR from the updated tip.',
    ];
  } else {
    branchStatusLines = [
      `The release branch \`${expectedHeadRef}\` was **not** deleted (${detail}).`,
      '',
      'Delete the branch manually if it is no longer needed, or start a fresh release with `yarn create-release-branch`.',
    ];
  }

  return [
    '## Stale release PR closed',
    '',
    `This release PR was automatically closed because it had no activity for ${STALE_HOURS} hours (last updated ${inactiveHours}h ago).`,
    '',
    'Open release PRs on `release/*` branches are expected to merge promptly so they do not block others from starting a new release.',
    '',
    ...branchStatusLines,
    '',
    `To keep a release PR open longer in exceptional cases, add the \`${EXEMPT_LABEL}\` label.`,
    '',
    '<!-- stale-release-pr-comment -->',
  ].join('\n');
}

/**
 * Post the stale-close comment on the pull request.
 *
 * @param {object} github - Octokit client from `actions/github-script`.
 * @param {string} owner - Repository owner.
 * @param {string} repo - Repository name.
 * @param {number} pullNumber - Pull request number.
 * @param {string} body - Markdown comment body.
 * @param {object} core - `@actions/core` helpers.
 * @returns {Promise<void>}
 */
async function commentOnPull(github, owner, repo, pullNumber, body, core) {
  try {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  } catch (error) {
    core.warning(
      `Closed #${pullNumber} but failed to comment: ${error.message}`,
    );
  }
}

/**
 * Process a single stale release PR candidate through refresh, close, delete,
 * and comment.
 *
 * @param {object} options - Processing inputs.
 * @param {object} options.github - Octokit client from `actions/github-script`.
 * @param {string} options.owner - Repository owner.
 * @param {string} options.repo - Repository name.
 * @param {object} options.candidate - Candidate from the initial open-PR list.
 * @param {number} options.now - Epoch ms used for the stale window.
 * @param {object} options.core - `@actions/core` helpers.
 * @returns {Promise<void>}
 */
async function processReleasePr({ github, owner, repo, candidate, now, core }) {
  let pr;
  try {
    pr = await getPull(github, owner, repo, candidate.number);
  } catch (error) {
    core.warning(
      `Failed to refresh #${candidate.number} (${candidate.head.ref}): ${error.message}`,
    );
    return;
  }

  const eligibility = evaluateStaleEligibility({ pr, now, core });
  if (!eligibility.eligible) {
    return;
  }

  let mergeState;
  try {
    mergeState = await getMergeState(github, owner, repo, pr.number);
  } catch (error) {
    core.warning(
      `Failed to check merge state for #${pr.number} (${pr.head.ref}): ${error.message}`,
    );
    return;
  }

  if (isMergeInProgress(mergeState)) {
    core.info(`Skipping #${pr.number} (${pr.head.ref}): merge in progress`);
    return;
  }

  const expectedUpdatedAt = pr.updated_at;
  const expectedHeadSha = pr.head.sha;
  const expectedHeadRef = pr.head.ref;
  const expectedLabels = labelKey(pr.labels);
  const inactiveHours = (eligibility.ageMs / (60 * 60 * 1000)).toFixed(1);

  let latestPr;
  try {
    latestPr = await getPull(github, owner, repo, pr.number);
  } catch (error) {
    core.warning(
      `Failed final refresh for #${pr.number} (${expectedHeadRef}): ${error.message}`,
    );
    return;
  }

  const finalEligibility = evaluateStaleEligibility({
    pr: latestPr,
    now: Date.now(),
    core,
    phase: 'before close',
  });
  if (!finalEligibility.eligible) {
    return;
  }

  if (
    !isUnchangedBeforeClose({
      latestPr,
      expectedUpdatedAt,
      expectedHeadSha,
      expectedHeadRef,
      expectedLabels,
      core,
    })
  ) {
    return;
  }

  let latestMergeState;
  try {
    latestMergeState = await getMergeState(
      github,
      owner,
      repo,
      latestPr.number,
    );
  } catch (error) {
    core.warning(
      `Failed final merge-state check for #${latestPr.number} (${latestPr.head.ref}): ${error.message}`,
    );
    return;
  }

  if (isMergeInProgress(latestMergeState)) {
    core.info(
      `Skipping #${latestPr.number} (${latestPr.head.ref}): merge started before close`,
    );
    return;
  }

  // Close before commenting so a failed close does not bump updated_at.
  const closed = await closePullRequest(github, owner, repo, latestPr, core);
  if (!closed) {
    return;
  }

  const branchResult = await deleteBranchIfUnchanged({
    github,
    owner,
    repo,
    pullNumber: latestPr.number,
    expectedHeadRef,
    expectedHeadSha,
    core,
  });

  const body = buildCloseComment({
    inactiveHours,
    expectedHeadRef,
    expectedHeadSha,
    outcome: branchResult.outcome,
    detail: branchResult.detail,
    branchSha: branchResult.branchSha,
  });

  await commentOnPull(github, owner, repo, latestPr.number, body, core);
}

/**
 * Close inactive same-repo `release/*` PRs.
 *
 * @param {object} params - `actions/github-script` runtime bindings.
 * @param {object} params.github - Octokit client from `actions/github-script`.
 * @param {object} params.context - GitHub Actions context.
 * @param {object} params.core - `@actions/core` helpers.
 * @returns {Promise<void>}
 */
module.exports = async function closeStaleReleasePrs({
  github,
  context,
  core,
}) {
  const now = Date.now();
  const { owner, repo } = context.repo;

  const pulls = await github.paginate(github.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  const releasePrs = pulls.filter((pr) =>
    isReleasePrCandidate(pr, owner, repo, core),
  );

  if (releasePrs.length === 0) {
    core.info('No open release PRs to evaluate.');
    return;
  }

  for (const candidate of releasePrs) {
    await processReleasePr({
      github,
      owner,
      repo,
      candidate,
      now,
      core,
    });
  }
};
