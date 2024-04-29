#!/bin/bash

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

previous-release-commit() {
  git tag --sort=version:refname --list "$1@*" | tail -n 1
}

determine-commit-range() {
  if [[ "$1" =~ ^release/ ]]; then
    echo "$previous_release_commit..main"
  else
    echo "$previous_release_commit..HEAD"
  fi
}

since-previous-release() {
  local package_name
  local package_directory
  local git_command
  local current_branch
  local previous_release_commit
  local commit_range

  package_name="$npm_package_name"
  package_directory="$PWD"

  git_command=("$@")
  if [[ ${#git_command[@]} -eq 0 ]]; then
    git_command=(log --oneline)
  fi

  current_branch="$(git branch --show-current)"
  previous_release_commit="$(previous-release-commit "$npm_package_name")"
  commit_range="$(determine-commit-range "$current_branch")"

  echo "$(magenta "$(bold "Package:")" "$package_name")"
  echo "$(magenta "$(bold "Directory:")" "$package_directory")"
  echo "$(magenta "$(bold "Commit range:")" "$commit_range")"
  echo

  git "${git_command[@]}" "$commit_range" -- "$PWD"
}

since-previous-release "$@"
