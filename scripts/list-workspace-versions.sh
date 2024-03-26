#!/usr/bin/env bash

if [[ "$1" == "--json" ]]; then
  yarn workspaces list --json --no-private | \
    jq --raw-output '.location' | \
    xargs -I{} cat '{}/package.json' | \
    jq --slurp 'map({name, version})'
else
  yarn workspaces list --json --no-private | \
    jq --raw-output '.location' | \
    xargs -I{} cat '{}/package.json' | \
    jq --raw-output '"\(.name) \(.version)"' | \
    xargs printf '%40s %s\n'
fi
