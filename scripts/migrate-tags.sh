#!/usr/bin/env bash

source "$PWD/scripts/semver.sh"

remote='origin'
release_commits_regex='^\d\{1,3\}\.\d\{1,3\}\.\d\{1,3\}'
version_before_package_rename='0.0.0'
tag_prefix_before_package_rename="$1"
dry_run=false

while [[ $# -gt 0 ]]; do
  key="$1"

  case $key in
  -r | --remote)
    remote="$2"
    shift # past argument
    shift # past value
    ;;
  -p | --regex-pattern)
    release_commits_regex="$2"
    shift # past argument
    shift # past value
    ;;
  -v | --version-before-package-rename)
    version_before_package_rename="$2"
    shift # past argument
    shift # past value
    ;;
  -t | --tag-prefix-before-package-rename)
    tag_prefix_before_package_rename="$2"
    shift # past argument
    shift # past value
    ;;
  -d | --dry-run)
    dry_run=true
    shift # past argument
    shift # past value
    ;;
  *) # package name
    package_name="$1"
    shift # past argument
    ;;
  esac
done

get-version-commit-pairs() {
  while read -r log; do
    echo "$log" | cut -d' ' -f1,2
  done <<<"$(git log --oneline --grep $release_commits_regex merged-packages/$package_name)"
}

prepend-tag-name() {
  while read -r pair; do
    commit="$(echo "$pair" | cut -d' ' -f1)"
    version="$(echo "$pair" | cut -d' ' -f2)"
    if semverLT "$version" "$version_before_package_rename" || semverEQ "$version" "$version_before_package_rename"; then
      tag_name="$tag_prefix_before_package_rename@$version"
    else
      tag_name="@metamask/$package_name@$version"
    fi
    echo "$commit $tag_name"
  done <<<"$(get-version-commit-pairs)"
}

while read -r pair; do
  commit="$(echo "$pair" | cut -d' ' -f1)"
  tag_name="$(echo "$pair" | cut -d' ' -f2)"
  if [ "$dry_run" = true ]; then
    echo "$commit $tag_name"
  else
    if ! git tag "$tag_name" "$commit"; then
      echo "Error creating tag $tag_name for commit $commit" >&2
      exit 1
    fi
    if ! git push "$remote" "$tag_name"; then
      echo "Error pushing tag $tag_name to remote $remote" >&2
      exit 1
    fi
  fi
done <<<"$(prepend-tag-name)"
