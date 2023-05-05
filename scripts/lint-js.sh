#!/usr/bin/env bash

set -euo pipefail

# Parse arguments

mode="check"
show_help=0
patterns=()

while [[ "${1:-}" ]]; do
  case $1 in
    --fix)
      mode="fix"
      shift
      ;;
    --help)
      show_help=1
      shift
      ;;
    *)
      patterns+=("$1")
      shift
      ;;
  esac
done

if [[ $show_help -eq 1 ]]; then
  echo "Run ESLint."
  echo "USAGE: $0 [--fix]"
fi

if [[ ${#patterns[@]} -eq 0 ]]; then
  patterns=("*")
fi

# Build the command

command=(yarn eslint --cache --ext "js,ts" "${patterns[@]}")

if [[ $mode == "fix" ]]; then
  command+=(--fix)
fi

# Run the command

if [[ ${#patterns[@]} -eq 1 && ${patterns[0]} == "*" ]]; then
  echo "Running ESLint on all files..."
else
  echo "Running ESLint on a subset of files..."
fi

"${command[@]}"
