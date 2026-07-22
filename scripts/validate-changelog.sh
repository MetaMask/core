#!/usr/bin/env bash

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Missing package name."
  exit 1
fi

package_name="$1"
shift  # remove package name from arguments

if [[ "${CI:-}" = "true" ]]; then
  if [[ -n "${GITHUB_HEAD_REF:-}" ]]; then
    branch_name="${GITHUB_HEAD_REF}"
  elif [[ -n "${GITHUB_REF_NAME:-}" ]]; then
    branch_name="${GITHUB_REF_NAME}"
  else
    echo "Cannot determine branch name in CI environment, missing GITHUB_HEAD_REF and GITHUB_REF_NAME"
    exit 1
  fi;
else
  branch_name="$(git branch --show-current)"
fi

# A release only bumps a subset of packages. The `--rc` validation requires the
# `[Unreleased]` section to be empty, so it must run only for the packages that
# are actually part of this release. Any other package legitimately keeps
# unreleased entries and would fail `--rc` for no reason.
#
# We detect "part of this release" by comparing the package version against the
# point where this branch diverged from the base branch (the merge base, so it
# stays correct even as the base branch moves on): if this branch bumped the
# version, the package is being released. When we can't determine the base
# version we default to skipping `--rc`, so an undetermined base never blocks a
# release PR.
is_release_candidate=false
if [[ "${branch_name}" =~ ^release/ ]]; then
  base_ref="${CHANGELOG_BASE_REF:-}"
  if [[ -z "${base_ref}" ]]; then
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

  # Compare against the common ancestor, deepening the history if a shallow CI
  # checkout hides it.
  base_commit=""
  if [[ -n "${base_ref}" ]]; then
    base_commit="$(git merge-base "${base_ref}" HEAD 2>/dev/null || true)"
    if [[ -z "${base_commit}" ]]; then
      git fetch --quiet --deepen=100 origin main 2>/dev/null || git fetch --quiet --unshallow origin 2>/dev/null || true
      base_commit="$(git merge-base "${base_ref}" HEAD 2>/dev/null || true)"
    fi
  fi

  current_version="$(node -p "require('./package.json').version")"
  base_version=""
  if [[ -n "${base_commit}" ]]; then
    base_version="$(git show "${base_commit}:./package.json" 2>/dev/null | node -e "const fs=require('fs');try{process.stdout.write(String(JSON.parse(fs.readFileSync(0,'utf8')).version||''))}catch{process.stdout.write('')}" || true)"
  fi

  # Only treat as a release candidate when we positively confirm the version was
  # bumped on this branch. `0.0.0` marks an unpublished package with no released
  # version, so `--rc` (which requires a matching version heading) never applies.
  if [[ -n "${base_version}" && "${current_version}" != "0.0.0" && "${current_version}" != "${base_version}" ]]; then
    is_release_candidate=true
  fi
fi

if [[ "${is_release_candidate}" = "true" ]]; then
  yarn auto-changelog validate --formatter oxfmt --tag-prefix "${package_name}@" --rc "$@"
else
  yarn auto-changelog validate --formatter oxfmt --tag-prefix "${package_name}@" "$@"
fi
