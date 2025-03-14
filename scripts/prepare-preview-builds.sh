#!/usr/bin/env bash

set -euo pipefail

# This script prepares a package to be published as a preview build
# to GitHub Packages.

if [[ $# -eq 0 ]]; then
  echo "Missing commit hash."
  exit 1
fi

# We don't want to assume that preview builds will be published alongside
# "production" versions. There are security- and aesthetic-based advantages to
# keeping them separate.
npm_scope="$1"

# We use the short commit hash as the prerelease version. This ensures each
# preview build is unique and can be linked to a specific commit.
shorthash="$2"

prepare-preview-manifest() {
  local name="$1"
  local location="$2"

  local name_without_scope="${name##@metamask/}"
  local manifest_file="$location/package.json"
  local version="$(jq --raw-output '.version' "$manifest_file")"

  echo "- $name ($version)"

  # jq does not support in-place modification of files, so a temporary file is
  # used to store the result of the operation. The original file is then
  # overwritten with the temporary file.
  jq --raw-output --arg npm_scope "$npm_scope" --arg hash "$shorthash" --from-file scripts/prepare-preview-builds.jq "$manifest_file" > temp.json
  mv temp.json "$manifest_file"

  # Allow for publishing preview builds of unreleased packages
  # TODO: This won't work because we also need to update dependency lines in dependents of unreleased packages
  local regex1="s!^\"$name@npm:\\^$version, $name@workspace:$location\":\$!\"$npm_scope/$name_without_scope@npm:^$version, $npm_scope/$name_without_scope@workspace:$location\":!"
  local regex2="s!^\"$name@workspace:$location\":\$!\"$npm_scope/$name_without_scope@workspace:$location\":!"
  local regex3="s!^  resolution: \"$name@workspace:$location\"\$!  resolution: \"$npm_scope/$name_without_scope@workspace:$location\"!"
  local regex4="s!^    \"$name\": \"npm:\\^$version\"\$!    \"$npm_scope/$name_without_scope\": \"npm:^$version\"!"

  sed -i '' -E "$regex1" yarn.lock
  sed -i '' -E "$regex2" yarn.lock
  sed -i '' -E "$regex3" yarn.lock
  if [[ "$version" == "0.0.0" ]]; then
    sed -i '' -E "$regex4" yarn.lock
  fi
}

echo "Preparing manifests..."
while IFS=$'\t' read -r location name; do
  prepare-preview-manifest "$name" "$location"
done < <(yarn workspaces list --no-private --json | jq --slurp --raw-output 'map(select(.location != ".")) | map([.location, .name]) | map(@tsv) | .[]')

echo "Installing dependencies..."
yarn install --no-immutable
