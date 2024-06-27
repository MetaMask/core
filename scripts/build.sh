#!/usr/bin/env bash

set -euo pipefail

blue() {
  printf "\x1B[34m"
  echo -n "$@"
  printf "\x1B[0m"
}

banner() {
  blue "=== $@ ===" $'\n'
}

banner "Cleaning files from previous builds"

yarn build:clean-only

echo
banner "Generating JavaScript implementation files and source maps"

yarn build:source

echo
banner "Generating type declaration files"

yarn run build:types
