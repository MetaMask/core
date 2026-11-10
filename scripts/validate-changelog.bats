#!/usr/bin/env bats

# Tests for scripts/validate-changelog.sh. The script guards its `main` behind a
# `BASH_SOURCE`/`$0` check, so sourcing it here loads the functions without
# running validation.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/validate-changelog.sh"
  # shellcheck source=/dev/null
  source "${SCRIPT}"
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

@test "base version uses CHANGELOG_MERGE_BASE without needing the base branch" {
  setup_release_repo
  merge_base="$(git rev-parse HEAD)"
  echo '{"name":"@metamask/foo","version":"1.1.0"}' >packages/foo/package.json
  git add -A
  git commit -qm "bump foo"
  git branch -q -D main

  cd packages/foo
  run env CHANGELOG_MERGE_BASE="${merge_base}" bash -c "source '${SCRIPT}'; resolve_base_version"
  [ "$status" -eq 0 ]
  [ "$output" = "1.0.0" ]
}

# --- should_validate_as_release_candidate (real git history) -----------------

# Run `should_validate_as_release_candidate` for the `foo` package of the repo
# built by `setup_release_repo`, with `main` as the base branch.
run_should_validate() {
  cd "${REPO}/packages/foo"
  run env CHANGELOG_BASE_REF="${BASE_REF:-main}" bash -c "source '${SCRIPT}'; should_validate_as_release_candidate '$1'"
}

# Commit the given version of `foo` on the current branch.
commit_foo_version() {
  echo "{\"name\":\"@metamask/foo\",\"version\":\"$1\"}" >"${REPO}/packages/foo/package.json"
  git -C "${REPO}" add -A
  git -C "${REPO}" commit -qm "set foo to $1"
}

@test "release candidate: release branch with a bumped version" {
  setup_release_repo
  commit_foo_version "1.1.0"
  run_should_validate "release/1.0.0"
  [ "$status" -eq 0 ]
}

@test "not a release candidate: release branch with an unchanged version" {
  setup_release_repo
  run_should_validate "release/1.0.0"
  [ "$status" -eq 1 ]
}

@test "not a release candidate: non-release branch even with a changed version" {
  setup_release_repo
  commit_foo_version "1.1.0"
  run_should_validate "feature/some-work"
  [ "$status" -eq 1 ]
}

@test "not a release candidate: main branch" {
  setup_release_repo
  commit_foo_version "1.1.0"
  run_should_validate "main"
  [ "$status" -eq 1 ]
}

@test "not a release candidate: unpublished 0.0.0 package" {
  setup_release_repo
  commit_foo_version "0.0.0"
  run_should_validate "release/1.0.0"
  [ "$status" -eq 1 ]
}

@test "not a release candidate: package added on the branch" {
  setup_release_repo
  mkdir -p "${REPO}/packages/bar"
  echo '{"name":"@metamask/bar","version":"1.0.0"}' >"${REPO}/packages/bar/package.json"
  git add -A
  git commit -qm "add bar"

  cd "${REPO}/packages/bar"
  run env CHANGELOG_BASE_REF=main bash -c "source '${SCRIPT}'; should_validate_as_release_candidate release/1.0.0"
  [ "$status" -eq 1 ]
}

@test "not a release candidate: base version cannot be resolved" {
  setup_release_repo
  commit_foo_version "1.1.0"
  BASE_REF="does-not-exist" run_should_validate "release/1.0.0"
  [ "$status" -eq 1 ]
}

# --- resolve_rc_flag ---------------------------------------------------------

@test "rc flag is printed for a package bumped on the release branch" {
  setup_release_repo
  echo '{"name":"@metamask/foo","version":"1.1.0"}' >packages/foo/package.json
  git add -A
  git commit -qm "bump foo"

  cd packages/foo
  run env CHANGELOG_BASE_REF=main bash -c "source '${SCRIPT}'; resolve_rc_flag release/1.0.0"
  [ "$status" -eq 0 ]
  [ "$output" = "--rc" ]
}

@test "rc flag is empty for a package not bumped on the release branch" {
  setup_release_repo

  cd packages/foo
  run env CHANGELOG_BASE_REF=main bash -c "source '${SCRIPT}'; resolve_rc_flag release/1.0.0"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "rc flag is empty outside a release branch" {
  setup_release_repo
  echo '{"name":"@metamask/foo","version":"1.1.0"}' >packages/foo/package.json
  git add -A
  git commit -qm "bump foo"

  cd packages/foo
  run env CHANGELOG_BASE_REF=main bash -c "source '${SCRIPT}'; resolve_rc_flag feature/some-work"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
