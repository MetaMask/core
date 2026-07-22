#!/usr/bin/env bash

# Determine the branch name, both in CI (from the event's ref variables) and
# locally (from git).
resolve_branch_name() {
  if [[ "${CI:-}" = "true" ]]; then
    if [[ -n "${GITHUB_HEAD_REF:-}" ]]; then
      echo "${GITHUB_HEAD_REF}"
    elif [[ -n "${GITHUB_REF_NAME:-}" ]]; then
      echo "${GITHUB_REF_NAME}"
    else
      echo "Cannot determine branch name in CI environment, missing GITHUB_HEAD_REF and GITHUB_REF_NAME" >&2
      return 1
    fi
  else
    git branch --show-current
  fi
}

# Print the version of the package (in the current working directory) as it was
# at the point this branch diverged from the base branch. Prints nothing when
# the base cannot be determined (e.g. an unrelated history or a base branch that
# isn't available).
#
# Comparing against the merge base rather than the base branch tip keeps the
# result correct even as the base branch moves on.
resolve_base_version() {
  local base_ref="${CHANGELOG_BASE_REF:-}"
  if [[ -z "${base_ref}" ]]; then
    local candidate
    for candidate in "origin/main" "main"; do
      if git rev-parse --verify --quiet "${candidate}" >/dev/null; then
        base_ref="${candidate}"
        break
      fi
    done
    if [[ -z "${base_ref}" ]] && git fetch --quiet --depth=1 origin main 2>/dev/null; then
      base_ref="FETCH_HEAD"
    fi
  fi

  local base_commit=""
  if [[ -n "${base_ref}" ]]; then
    base_commit="$(git merge-base "${base_ref}" HEAD 2>/dev/null || true)"
    # Deepen the history if a shallow CI checkout hides the common ancestor.
    if [[ -z "${base_commit}" ]]; then
      git fetch --quiet --deepen=100 origin main 2>/dev/null || git fetch --quiet --unshallow origin 2>/dev/null || true
      base_commit="$(git merge-base "${base_ref}" HEAD 2>/dev/null || true)"
    fi
  fi

  if [[ -n "${base_commit}" ]]; then
    git show "${base_commit}:./package.json" 2>/dev/null | node -e "const fs=require('fs');try{process.stdout.write(String(JSON.parse(fs.readFileSync(0,'utf8')).version||''))}catch{process.stdout.write('')}" || true
  fi
}

# Decide whether a package should be validated as a release candidate (`--rc`).
#
# A release only bumps a subset of packages, but `changelog:validate` runs
# across every workspace. The `--rc` validation requires an empty `[Unreleased]`
# section, so it must run only for the packages that are actually part of this
# release; any other package legitimately keeps unreleased entries and would
# fail `--rc` for no reason.
#
# A package is part of the release when it is on a release branch and its
# version was bumped on that branch (its current version differs from the base
# version). `0.0.0` marks an unpublished package with no released version, so
# `--rc` (which requires a matching version heading) never applies. An empty
# base version means the base could not be determined, in which case we skip
# `--rc` so an undetermined base never blocks a release PR.
should_validate_as_release_candidate() {
  local branch_name="$1"
  local current_version="$2"
  local base_version="$3"

  [[ "${branch_name}" =~ ^release/ ]] || return 1
  [[ -n "${base_version}" ]] || return 1
  [[ "${current_version}" != "0.0.0" ]] || return 1
  [[ "${current_version}" != "${base_version}" ]] || return 1
  return 0
}

main() {
  if [[ $# -eq 0 ]]; then
    echo "Missing package name."
    exit 1
  fi

  local package_name="$1"
  shift # remove package name from arguments

  local branch_name
  branch_name="$(resolve_branch_name)"

  local current_version
  current_version="$(node -p "require('./package.json').version")"

  local base_version=""
  if [[ "${branch_name}" =~ ^release/ ]]; then
    base_version="$(resolve_base_version)"
  fi

  if should_validate_as_release_candidate "${branch_name}" "${current_version}" "${base_version}"; then
    yarn auto-changelog validate --formatter oxfmt --tag-prefix "${package_name}@" --rc "$@"
  else
    yarn auto-changelog validate --formatter oxfmt --tag-prefix "${package_name}@" "$@"
  fi
}

# Only run when executed directly, so tests can source the functions above.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
  main "$@"
fi
