/**
 * Close inactive same-repo `release/*` PRs, comment with the outcome, and
 * delete the branch when the tip is unchanged.
 *
 * Intended to be invoked from `actions/github-script`:
 * `await require('./.github/scripts/close-stale-release-prs.cjs')({ github, context, core });`
 *
 * @param {object} params
 * @param {object} params.github - Octokit client from `actions/github-script`.
 * @param {object} params.context - GitHub Actions context.
 * @param {object} params.core - `@actions/core` helpers.
 */
module.exports = async function closeStaleReleasePrs({
  github,
  context,
  core,
}) {
  // Optional escape hatch for long-running releases that must stay open.
  const STALE_HOURS = 3;
  const EXEMPT_LABEL = 'release:keep-open';

  const staleMs = STALE_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  const { owner, repo } = context.repo;

  const labelKey = (labels) =>
    labels
      .map((label) => label.name)
      .sort()
      .join('\0');

  const getMergeState = async (pullNumber) => {
    const mergeQueue = await github.graphql(
      `
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
      `,
      { owner, repo, number: pullNumber },
    );
    return mergeQueue.repository.pullRequest;
  };

  const pulls = await github.paginate(github.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  const releasePrs = pulls.filter((pr) => {
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
  });

  if (releasePrs.length === 0) {
    core.info('No open release PRs to evaluate.');
    return;
  }

  for (const candidate of releasePrs) {
    // Re-fetch before acting: the initial list is a snapshot and the
    // PR may have merged/closed (or become active) since then.
    let pr;
    try {
      ({ data: pr } = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: candidate.number,
      }));
    } catch (error) {
      core.warning(
        `Failed to refresh #${candidate.number} (${candidate.head.ref}): ${error.message}`,
      );
      continue;
    }

    if (pr.state !== 'open') {
      core.info(`Skipping #${pr.number} (${pr.head.ref}): no longer open`);
      continue;
    }

    if (pr.labels.some((label) => label.name === EXEMPT_LABEL)) {
      core.info(
        `Skipping #${pr.number} (${pr.head.ref}): exempt label "${EXEMPT_LABEL}"`,
      );
      continue;
    }

    const ageMs = now - Date.parse(pr.updated_at);
    if (ageMs < staleMs) {
      core.info(
        `Skipping #${pr.number} (${pr.head.ref}): updated ${Math.round(ageMs / 60000)}m ago`,
      );
      continue;
    }

    let pullRequest;
    try {
      pullRequest = await getMergeState(pr.number);
    } catch (error) {
      core.warning(
        `Failed to check merge state for #${pr.number} (${pr.head.ref}): ${error.message}`,
      );
      continue;
    }

    if (pullRequest.isInMergeQueue || pullRequest.autoMergeRequest) {
      core.info(`Skipping #${pr.number} (${pr.head.ref}): merge in progress`);
      continue;
    }

    const expectedUpdatedAt = pr.updated_at;
    const expectedHeadSha = pr.head.sha;
    const expectedHeadRef = pr.head.ref;
    const expectedLabels = labelKey(pr.labels);
    const inactiveHours = (ageMs / (60 * 60 * 1000)).toFixed(1);

    // Final recheck immediately before destructive ops: activity,
    // head SHA, labels, or merge state may have changed since the
    // earlier refresh / GraphQL query.
    let latestPr;
    try {
      ({ data: latestPr } = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
      }));
    } catch (error) {
      core.warning(
        `Failed final refresh for #${pr.number} (${expectedHeadRef}): ${error.message}`,
      );
      continue;
    }

    if (latestPr.state !== 'open') {
      core.info(
        `Skipping #${pr.number} (${latestPr.head.ref}): no longer open before close`,
      );
      continue;
    }

    if (labelKey(latestPr.labels) !== expectedLabels) {
      core.info(
        `Skipping #${pr.number} (${latestPr.head.ref}): labels changed before close`,
      );
      continue;
    }

    if (
      latestPr.updated_at !== expectedUpdatedAt ||
      latestPr.head.sha !== expectedHeadSha ||
      latestPr.head.ref !== expectedHeadRef
    ) {
      core.info(
        `Skipping #${pr.number} (${latestPr.head.ref}): activity or head changed before close`,
      );
      continue;
    }

    if (Date.now() - Date.parse(latestPr.updated_at) < staleMs) {
      core.info(
        `Skipping #${pr.number} (${latestPr.head.ref}): no longer stale before close`,
      );
      continue;
    }

    let latestMergeState;
    try {
      latestMergeState = await getMergeState(latestPr.number);
    } catch (error) {
      core.warning(
        `Failed final merge-state check for #${latestPr.number} (${latestPr.head.ref}): ${error.message}`,
      );
      continue;
    }

    if (latestMergeState.isInMergeQueue || latestMergeState.autoMergeRequest) {
      core.info(
        `Skipping #${latestPr.number} (${latestPr.head.ref}): merge started before close`,
      );
      continue;
    }

    // Close before commenting so a failed close does not bump
    // updated_at and postpone the next stale attempt.
    try {
      await github.rest.pulls.update({
        owner,
        repo,
        pull_number: latestPr.number,
        state: 'closed',
      });
    } catch (error) {
      core.warning(
        `Failed to close #${latestPr.number} (${latestPr.head.ref}): ${error.message}`,
      );
      continue;
    }

    // Re-fetch the branch tip immediately before delete so a push
    // that landed after close is not discarded. Comment afterward
    // so the message matches whether the branch was actually removed.
    let branchOutcome = 'deleted';
    let branchOutcomeDetail = '';
    let branchSha;

    try {
      const { data: branchRef } = await github.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${expectedHeadRef}`,
      });
      branchSha = branchRef.object.sha;
    } catch (error) {
      branchOutcome = 'kept-refresh-failed';
      branchOutcomeDetail = error.message;
      core.warning(
        `Closed #${latestPr.number} but failed to refresh ${expectedHeadRef} before delete: ${error.message}`,
      );
    }

    if (branchOutcome === 'deleted' && branchSha !== expectedHeadSha) {
      branchOutcome = 'kept-head-moved';
      branchOutcomeDetail = `head moved from ${expectedHeadSha} to ${branchSha}`;
      core.warning(
        `Closed #${latestPr.number} but skipped deleting ${expectedHeadRef}: ${branchOutcomeDetail}`,
      );
    }

    if (branchOutcome === 'deleted') {
      try {
        await github.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${expectedHeadRef}`,
        });
        core.info(
          `Closed #${latestPr.number} and deleted branch ${expectedHeadRef}`,
        );
      } catch (error) {
        branchOutcome = 'kept-delete-failed';
        branchOutcomeDetail = error.message;
        core.warning(
          `Closed #${latestPr.number} but failed to delete ${expectedHeadRef}: ${error.message}`,
        );
      }
    }

    let branchStatusLines;
    if (branchOutcome === 'deleted') {
      branchStatusLines = [
        `The release branch \`${expectedHeadRef}\` has been deleted. If you still need to publish these packages, start a fresh release with \`yarn create-release-branch\`.`,
      ];
    } else if (branchOutcome === 'kept-head-moved') {
      branchStatusLines = [
        `The release branch \`${expectedHeadRef}\` was **not** deleted because its tip changed after close (\`${expectedHeadSha}\` → \`${branchSha}\`).`,
        '',
        'Delete the branch manually if it is no longer needed, or open a new release PR from the updated tip.',
      ];
    } else {
      branchStatusLines = [
        `The release branch \`${expectedHeadRef}\` was **not** deleted (${branchOutcomeDetail}).`,
        '',
        'Delete the branch manually if it is no longer needed, or start a fresh release with `yarn create-release-branch`.',
      ];
    }

    const body = [
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

    try {
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: latestPr.number,
        body,
      });
    } catch (error) {
      core.warning(
        `Closed #${latestPr.number} but failed to comment: ${error.message}`,
      );
    }
  }
};
