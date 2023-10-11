#!/usr/bin/env bash

package_name="$1"
release_commits_regex=${2:-'^\d\{1,3\}\.\d\{1,3\}\.\d\{1,3\}'}

get-version-commit-pairs() {
  for log in "$(git log --oneline --grep $release_commits_regex merged-packages/$package_name)"; do
    echo "$log" | cut -d' ' -f1,2 | sed 's/\([^ ]*\)\([ ]*\) \([^ ]*\)\([ ]*\)/\3\4 \1\2/'
  done
}
