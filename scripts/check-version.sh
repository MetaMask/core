#!/usr/bin/env bash

set -x
set -e
set -o pipefail

BEFORE="${1}"

if [[ -z $BEFORE ]]; then
  echo "Error: Before SHA not specified."
  exit 1
fi

VERSION_BEFORE="$(git show "$BEFORE":package.json | jq --raw-output .version)"
VERSION_AFTER="$(jq --raw-output .version package.json)"
if [[ "$VERSION_BEFORE" == "$VERSION_AFTER" ]]; then
  echo "Notice: version unchanged. Skipping release."
  exit 1
fi
