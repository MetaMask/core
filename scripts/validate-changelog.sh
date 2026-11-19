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
# at the point this branch diverged from the base branch (the merge base, so the
# result stays correct even as the base branch moves on). Prints nothing when the
# package did not exist at that point (a newly added package).
#
# Exits non-zero when the base branch history isn't available, so a misconfigured
# checkout fails loudly rather than silently skipping validation. CI must check
# out with enough history for the merge base to resolve, or set
# `CHANGELOG_MERGE_BASE` to an already-known merge base commit, in which case
# only that commit needs to be available.
resolve_base_version() {
  local base_commit="${CHANGELOG_MERGE_BASE:-}"

  if [[ -z "${base_commit}" ]]; then
    local base_ref="${CHANGELOG_BASE_REF:-origin/main}"
    if ! base_commit="$(git merge-base "${base_ref}" HEAD 2>/dev/null)"; then
      echo "Could not find a common ancestor between HEAD and \"${base_ref}\". Make sure \"${base_ref}\" is available with enough history." >&2
      return 1
    fi
  fi

  # A newly added package won't exist at the base commit; that just means there
  # is no base version to compare against.
  local base_package_json
  if base_package_json="$(git show "${base_commit}:./package.json" 2>/dev/null)"; then
    printf '%s' "${base_package_json}" | jq --raw-output '.version // empty'
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
# base version means the package is newly added (it did not exist at the base),
# so there is nothing to compare against and `--rc` is skipped.
#
# Operates on the package in the current working directory.
should_validate_as_release_candidate() {
  local branch_name="$1"

  [[ "${branch_name}" =~ ^release/ ]] || return 1

  local current_version
  current_version="$(jq --raw-output '.version' package.json)"

  local base_version
  base_version="$(resolve_base_version)" || return 1

  [[ -n "${base_version}" ]] || return 1
  [[ "${current_version}" != "0.0.0" ]] || return 1
  [[ "${current_version}" != "${base_version}" ]] || return 1
  return 0
}

resolve_rc_flag() {
  if should_validate_as_release_candidate "$1"; then
    echo "--rc"
  fi
}

validate_package() {
  local package_name
  package_name="$(jq --raw-output '.name' package.json)"

  local branch_name
  branch_name="$(resolve_branch_name)"

  local rc_flag
  rc_flag="$(resolve_rc_flag "${branch_name}")"

  # `rc_flag` is intentionally unquoted so that it expands to nothing when empty.
  # shellcheck disable=SC2086
  yarn auto-changelog validate --formatter oxfmt --tag-prefix "${package_name}@" ${rc_flag} "$@"
}

validate_all() {
  local branch_name
  branch_name="$(resolve_branch_name)"

  local root_directory
  root_directory="$(pwd)"

  # Packages without a changelog are skipped, like `--all` does.
  local locations=()
  local location
  while IFS= read -r location; do
    if [[ -f "${root_directory}/${location}/CHANGELOG.md" ]]; then
      locations+=("${location}")
    fi
  done < <(yarn workspaces list --no-private --json | jq --raw-output '.location')

  # `--all` applies `--rc` to every package or none, so it can only be used when
  # no package is a release candidate.
  local has_release_candidate=false
  for location in "${locations[@]}"; do
    if (cd "${root_directory}/${location}" && should_validate_as_release_candidate "${branch_name}"); then
      has_release_candidate=true
      break
    fi
  done

  if [[ "${has_release_candidate}" == false ]]; then
    yarn auto-changelog validate --all --formatter oxfmt "$@"
    return 0
  fi

  # Otherwise, validate each package once, deciding `--rc` per package.
  for location in "${locations[@]}"; do
    (
      cd "${root_directory}/${location}"
      validate_package "$@"
    )
  done
}

main() {
  if jq --exit-status 'has("workspaces")' package.json >/dev/null; then
    validate_all "$@"
  else
    validate_package "$@"
  fi
}

# Only run when executed directly, so tests can source the functions above.
# `set` lives here rather than at the top of the file so that sourcing the
# script doesn't turn on `errexit` in the caller's (test) shell.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
  main "$@"
fi
