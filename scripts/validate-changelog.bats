#!/usr/bin/env bats

# Tests for scripts/validate-changelog.sh. The script guards its `main` behind a
# `BASH_SOURCE`/`$0` check, so sourcing it here loads the functions without
# running validation.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/validate-changelog.sh"
  # shellcheck source=/dev/null
  source "${SCRIPT}"
}

# --- should_validate_as_release_candidate (pure decision) --------------------

@test "release candidate: release branch with a bumped version" {
  run should_validate_as_release_candidate "release/1136.0.0" "69.2.0" "69.1.0"
  [ "$status" -eq 0 ]
}

@test "not a release candidate: release branch with an unchanged version" {
  run should_validate_as_release_candidate "release/1136.0.0" "9.1.2" "9.1.2"
  [ "$status" -eq 1 ]
}

@test "not a release candidate: non-release branch even with a changed version" {
  run should_validate_as_release_candidate "feature/some-work" "2.0.0" "1.0.0"
  [ "$status" -eq 1 ]
}

@test "not a release candidate: main branch" {
  run should_validate_as_release_candidate "main" "2.0.0" "1.0.0"
  [ "$status" -eq 1 ]
}

@test "not a release candidate: unpublished 0.0.0 package" {
  run should_validate_as_release_candidate "release/1136.0.0" "0.0.0" ""
  [ "$status" -eq 1 ]
}

@test "not a release candidate: base version could not be determined" {
  run should_validate_as_release_candidate "release/1136.0.0" "1.0.0" ""
  [ "$status" -eq 1 ]
}

# --- resolve_branch_name -----------------------------------------------------

@test "branch name in CI comes from GITHUB_HEAD_REF for pull requests" {
  CI=true GITHUB_HEAD_REF="release/1136.0.0" GITHUB_REF_NAME="refs/pull/1/merge" run resolve_branch_name
  [ "$status" -eq 0 ]
  [ "$output" = "release/1136.0.0" ]
}

@test "branch name in CI falls back to GITHUB_REF_NAME for pushes" {
  CI=true GITHUB_HEAD_REF="" GITHUB_REF_NAME="release/1136.0.0" run resolve_branch_name
  [ "$status" -eq 0 ]
  [ "$output" = "release/1136.0.0" ]
}

@test "branch name in CI fails when no ref variables are set" {
  CI=true GITHUB_HEAD_REF="" GITHUB_REF_NAME="" run resolve_branch_name
  [ "$status" -ne 0 ]
}

# --- resolve_base_version (real git history) ---------------------------------

# Build a throwaway repo with a `main` branch and a `release/x` branch, so the
# merge-base logic runs against real history.
setup_release_repo() {
  REPO="${BATS_TEST_TMPDIR}/repo"
  mkdir -p "${REPO}/packages/foo"
  cd "${REPO}"
  git init -q -b main
  git config user.email "test@example.com"
  git config user.name "Test"
  echo '{"name":"@metamask/foo","version":"1.0.0"}' >packages/foo/package.json
  git add -A
  git commit -qm "initial"
  git checkout -q -b release/1.0.0
}

@test "base version is the version at the merge base when bumped on the branch" {
  setup_release_repo
  echo '{"name":"@metamask/foo","version":"1.1.0"}' >packages/foo/package.json
  git add -A
  git commit -qm "bump foo"
  # Advance main after branching to prove we compare against the merge base, not
  # the base branch tip.
  git checkout -q main
  echo '{"name":"@metamask/foo","version":"2.0.0"}' >packages/foo/package.json
  git add -A
  git commit -qm "unrelated main bump"
  git checkout -q release/1.0.0

  cd packages/foo
  run env CHANGELOG_BASE_REF=main bash -c "source '${SCRIPT}'; resolve_base_version"
  [ "$status" -eq 0 ]
  [ "$output" = "1.0.0" ]
}

@test "package that was not bumped on the branch is not a release candidate" {
  setup_release_repo
  # No bump on the release branch.
  cd packages/foo
  base_version="$(env CHANGELOG_BASE_REF=main bash -c "source '${SCRIPT}'; resolve_base_version")"
  [ "$base_version" = "1.0.0" ]

  run should_validate_as_release_candidate "release/1.0.0" "1.0.0" "${base_version}"
  [ "$status" -eq 1 ]
}

@test "package bumped on the branch is a release candidate end to end" {
  setup_release_repo
  echo '{"name":"@metamask/foo","version":"1.1.0"}' >packages/foo/package.json
  git add -A
  git commit -qm "bump foo"

  cd packages/foo
  base_version="$(env CHANGELOG_BASE_REF=main bash -c "source '${SCRIPT}'; resolve_base_version")"
  [ "$base_version" = "1.0.0" ]

  run should_validate_as_release_candidate "release/1.0.0" "1.1.0" "${base_version}"
  [ "$status" -eq 0 ]
}
