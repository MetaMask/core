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
  local manifest_file="$1"

  # jq does not support in-place modification of files, so a temporary file is
  # used to store the result of the operation. The original file is then
  # overwritten with the temporary file.
  jq --raw-output --arg npm_scope "$npm_scope" --arg hash "$shorthash" --from-file scripts/prepare-preview-builds.jq "$manifest_file" > temp.json
  mv temp.json "$manifest_file"
}

# Add resolutions to the root manifest so that @metamask/* imports continue
# to resolve from the local workspace after packages are renamed to the
# preview scope. Without this, yarn resolves @metamask/* from the npm
# registry, which causes build failures when workspace packages contain
# type changes not yet published.
echo "Adding workspace resolutions to root manifest..."
resolutions="{}"
while IFS=$'\t' read -r location name; do
  resolutions=$(echo "$resolutions" | jq --arg orig "$name" --arg loc "$location" '. + {($orig): ("portal:./" + $loc)}')
done < <(yarn workspaces list --no-private --json | jq --slurp --raw-output 'map(select(.location != ".")) | map([.location, .name]) | map(@tsv) | .[]')
jq --argjson resolutions "$resolutions" '.resolutions = ((.resolutions // {}) + $resolutions)' package.json > temp.json
mv temp.json package.json

echo "Preparing manifests..."
while IFS=$'\t' read -r location name; do
  echo "- $name"
  prepare-preview-manifest "$location/package.json"
done < <(yarn workspaces list --no-private --json | jq --slurp --raw-output 'map(select(.location != ".")) | map([.location, .name]) | map(@tsv) | .[]')

echo "Installing dependencies..."
yarn install --no-immutable
