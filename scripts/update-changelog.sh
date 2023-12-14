#!/usr/bin/env bash

set -euo pipefail

# Check if the current directory is a Git repository
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not in a git repository."
  exit 1
fi

# Get the current Git branch
branch=$(git rev-parse --abbrev-ref HEAD)

# Check if if we are not i a release branch
if [[ ! $branch =~ ^release/ ]]; then
  echo "Not in a release branch."
  exit 1
else
  # Get the current package name
  if [[ $# -eq 0 ]]; then
    echo "Missing package name."
    exit 1
  fi

  package_name="$1"
  shift # remove package name from arguments

  yarn auto-changelog update --tag-prefix "${package_name}@" --rc "$@"

fi
