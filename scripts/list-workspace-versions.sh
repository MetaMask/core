#!/usr/bin/env bash

list-workspace-names-and-versions() {
  yarn workspaces list --json --no-private | \
    jq --raw-output '.location' | \
    xargs -I{} cat '{}/package.json'
}

if [[ "$1" == "--json" ]]; then
  list-workspace-names-and-versions | \
    jq --slurp 'map({name, version})'
else
  list-workspace-names-and-versions | \
    jq --raw-output '"\(.name) \(.version)"' | \
    xargs printf '%-50s%s\n' | \
    tr ' ' '.'
fi
