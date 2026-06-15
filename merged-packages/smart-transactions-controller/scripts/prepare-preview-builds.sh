#!/usr/bin/env bash

# This script prepares a package to be published as a preview build to NPM.

set -euo pipefail

prepare-preview-manifest() {
  local manifest_file="$1"
  local npm_scope="$2"
  local short_commit_id="$3"

  # jq does not support in-place modification of files, so a temporary file is
  # used to store the result of the operation. The original file is then
  # overwritten with the temporary file.
  jq --raw-output --arg npm_scope "$npm_scope" --arg short_commit_id "$short_commit_id" --from-file scripts/prepare-preview-builds.jq "$manifest_file" > temp.json
  mv temp.json "$manifest_file"
}

main() {
  if [[ $# -lt 2 ]]; then
    echo "USAGE: $0 NPM_SCOPE SHORT_GIT_COMMIT_HASH"
    exit 1
  fi

  # We don't want to assume that preview builds will be published alongside
  # "production" versions. There are security- and aesthetic-based advantages to
  # keeping them separate.
  local npm_scope="$1"

  # We use the short commit ID as the prerelease version. This ensures each
  # preview build is unique and can be linked to a specific commit.
  local short_commit_id="$2"

  echo "Preparing manifest..."
  prepare-preview-manifest "package.json" "$npm_scope" "$short_commit_id"

  echo "Installing dependencies..."
  yarn install --no-immutable
}

main "$@"
