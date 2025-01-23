#!/bin/bash

red() {
  printf "\x1B[31m"
  echo -n "$@"
  printf "\x1B[0m"
}

diff="$(git diff --stat --exit-code --color)"
exitcode=$?

if [[ $exitcode -ne 0 ]]; then
  red "ERROR: The working tree is dirty. Please commit or remove these changes to continue:" $'\n'
  echo "$diff"
  exit 1
fi
