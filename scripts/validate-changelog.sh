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

if [[ "${branch_name}" =~ ^release/ ]]; then
  yarn auto-changelog validate --formatter oxfmt --tag-prefix "${package_name}@" --rc "$@"
else
  yarn auto-changelog validate --formatter oxfmt --tag-prefix "${package_name}@" "$@"
fi
