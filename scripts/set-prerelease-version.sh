#!/usr/bin/env bash

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Missing prerelease version"
  exit 1
fi

prerelease_version="$1"

jq --raw-output ".version |= split(\"-\")[0] + \"-${prerelease_version}\"" ./package.json > temp.json

jq --raw-output ".publishConfig.registry = \"https://npm.pkg.github.com\"" ./temp.json > package.json

rm temp.json

