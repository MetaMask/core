#!/usr/bin/env bash

set -e
set -o pipefail

if ! output=$(mm-foundryup --binaries anvil 2>&1); then
  echo "$output" >&2
  exit 1
fi
