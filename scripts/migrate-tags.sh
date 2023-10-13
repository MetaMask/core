#!/usr/bin/env bash

package_name="$1"
remote=${2:-'origin'}
release_commits_regex=${3:-'^\d\{1,3\}\.\d\{1,3\}\.\d\{1,3\}'}

get-version-commit-pairs() {
  for log in "$(git log --oneline --grep $release_commits_regex merged-packages/$package_name)"; do
    echo "$log" | cut -d' ' -f1,2 | sed 's/\([^ ]*\)\([ ]*\) \([^ ]*\)\([ ]*\)/\3\4 \1\2/'
  done
}

prepend-package-name() {
  for pair in "$(get-version-commit-pairs)"; do
    echo "$pair" | sed "s/\([^ ]*\)\([ ]*\) \([^ ]*\)\([ ]*\)/@metamask\/$package_name@\1\2 \3\4/"
  done
}

tag_commit_pairs=$(prepend-package-name)

for pair in "$tag_commit_pairs"; do
  echo "$pair" | xargs -n 2 bash -c 'git tag "$0" "$1"'
done

for pair in "$tag_commit_pairs"; do
  echo "$pair" | cut -d' ' -f1 | xargs -n 1 bash -c 'git push '"$remote"' "$0"'
done
