#!/bin/bash

set -uo pipefail

DEFAULT_BRANCH_NAME=main

already_printed_banner=0

red() {
  printf "\x1B[31m"
  echo -n "$@"
  printf "\x1B[0m"
}

magenta() {
  printf "\x1B[35m"
  echo -n "$@"
  printf "\x1B[0m"
}

bold() {
  printf "\x1B[1m"
  echo -n "$@"
  printf "\x1B[22m"
}

banner() {
  if [[ $already_printed_banner -eq 1 ]]; then
    echo
  fi
  printf '%s\n' "$(magenta "===" "$@" "===")"
  already_printed_banner=1
}

error() {
  printf '%s\n' "$(red "ERROR:" "$@")"
}

print-usage() {
  cat <<EOT
$(bold "SUMMARY")
    Runs checks on files, or applies fixes to files that violate checks.

$(bold "USAGE")
    $0 <mode> [--relative-to-branch]

$(bold "ARGUMENTS")
    -r, --relative-to-branch          Filters the set of files that will be
                                      checked or fixed to only those which have
                                      been added, changed, or deleted on this
                                      branch relative to the base branch. If
                                      omitted, all files will be processed.

    <mode>                            How to process the files in this repo.
                                      Whether to only run checks ($(bold "check")
                                      or to fix files that violate checks ($(bold "fix")).
EOT
}

get-base-branch() {
  local current_branch_name="$1"

  # 1. Print the name of the refs attached to commits that have taken place on
  # this branch.
  # 2. Split the output so each line = one ref, excluding empty lines.
  # 3. Exclude tags and remote branches.
  # 4. Choose the first local branch name that is not the current branch name.
  git log --pretty=format:'%D' | \
    tr ',' '\n' | \
    grep -v '^$' | \
    sed -E 's/^[ ]+|[ ]+$//' | \
    grep -E -v '^tag: ' | \
    grep -E -v '^origin/' | \
    grep -E -v '\b'"$current_branch_name"'\b' | \
    head -n 1
}

get-files-to-lint() {
  local current_branch_name="$1"

  local base_branch
  if [[ "$current_branch_name" == "$DEFAULT_BRANCH_NAME" ]]; then
    base_branch="origin/$current_branch_name"
  else
    base_branch="$(get-base-branch "$current_branch_name")"
  fi

  if [[ -z "$base_branch" ]]; then
    echo "<ERROR_NO_BASE_BRANCH>"
  else
    # List files in commits that have occurred on this branch
    git diff "$base_branch...HEAD" --name-only
    # List unstaged files
    git diff --name-only
  fi
}

get-unique-files-to-lint() {
  get-files-to-lint "$@" | uniq
}

run-eslint() {
  local mode="$1"
  local relative_to_branch="$2"
  local files_to_lint="$3"

  local extra_eslint_options
  if [[ "$mode" == "fix" ]]; then
    extra_eslint_options="--fix"
  else
    extra_eslint_options=""
  fi

  if [[ $relative_to_branch -eq 1 ]]; then
    echo "$files_to_lint" | while IFS=$'\n' read -r line; do
      printf '%s\0' "$line"
    done | grep --null-data -E '\.[jt]s$' | xargs -0 yarn eslint --cache $extra_eslint_options
  else
    yarn eslint --cache --ext js,ts $extra_eslint_options .
  fi
}

run-prettier() {
  local mode="$1"
  local relative_to_branch="$2"
  local files_to_lint="$3"

  local extra_prettier_options
  if [[ "$mode" == "fix" ]]; then
    extra_prettier_options="--write"
  else
    extra_prettier_options="--check"
  fi

  if [[ $relative_to_branch -eq 1 ]]; then
    echo "$files_to_lint" | while IFS=$'\n' read -r line; do
      printf '%s\0' "$line"
    done | xargs -0 yarn prettier --ignore-unknown $extra_prettier_options
  else
    yarn prettier $extra_prettier_options .
  fi
}

run-yarn-constraints() {
  local mode="$1"

  local extra_yarn_constraints_options
  if [[ "$mode" == "fix" ]]; then
    extra_yarn_constraints_options="--fix"
  else
    extra_yarn_constraints_options=""
  fi

  yarn constraints $extra_yarn_constraints_options
}

run-yarn-depcheck() {
  yarn depcheck
}

run-yarn-dedupe() {
  local mode="$1"
  local extra_yarn_dedupe_options

  if [[ "$mode" == "fix" ]]; then
    extra_yarn_dedupe_options=""
  else
    extra_yarn_dedupe_options="--check"
  fi

  yarn dedupe --check $extra_yarn_dedupe_options
}

main() {
  local mode=
  local relative_to_branch=0
  local current_branch_name
  local files_to_lint=""
  local eslint_result
  local prettier_result
  local yarn_constraints_result
  local yarn_depcheck_result
  local yarn_dedupe_result

  while [[ $# -gt 0 ]]; do
    case "${1:-}" in
      -r | --relative-to-branch)
        relative_to_branch=1
        shift
        ;;
      -*)
        error "Unknown argument '$1'."
        echo
        print-usage
        exit 1
        ;;
      *)
        if [[ -n $mode ]]; then
          error "Unknown argument '$1'."
          echo
          print-usage
          exit 1
        else
          mode="$1"
          shift
        fi
        ;;
    esac
  done

  if [[ -z "$mode" ]]; then
    error "Missing 'mode'."
    echo
    print-usage
    exit 1
  fi

  if [[ $relative_to_branch -eq 1 ]]; then
    current_branch_name="$(git branch --show-current)"

    if [[ -z "$current_branch_name" ]]; then
      error "Current branch not detected. Perhaps you're in detached HEAD state or in the middle of an operation?"
      exit 1
    fi

    files_to_lint="$(get-unique-files-to-lint "$current_branch_name")"

    if [[ "$files_to_lint" == "<ERROR_NO_BASE_BRANCH>" ]]; then
      error "Could not find base branch."
      exit 1
    fi

    if [[ -n "$files_to_lint" ]]; then
      banner "Files to $mode"
      echo "$files_to_lint" | while IFS=$'\n' read -r line; do
        echo "- $line"
      done
    fi
  fi

  if [[ $relative_to_branch -eq 1 ]]; then
    banner "Processing branch-specific files via ESLint"
  else
    banner "Processing all files via ESLint"
  fi
  run-eslint "$mode" "$relative_to_branch" "$files_to_lint"
  eslint_result=$?

  if [[ $relative_to_branch -eq 1 ]]; then
    banner "Processing branch-specific files via Prettier"
  else
    banner "Processing all files via Prettier"
  fi
  run-prettier "$mode" "$relative_to_branch" "$files_to_lint"
  prettier_result=$?

  banner "Processing Yarn constraints"
  run-yarn-constraints "$mode"
  yarn_constraints_result=$?

  banner "Processing dependencies"
  run-yarn-depcheck "$mode"
  yarn_depcheck_result=$?
  run-yarn-dedupe "$mode"
  yarn_dedupe_result=$?

  [[
    $eslint_result -eq 0 &&
    $prettier_result -eq 0 &&
    $yarn_constraints_result -eq 0 &&
    $yarn_depcheck_result -eq 0 &&
    $yarn_dedupe_result -eq 0
  ]]
}

main "$@"
