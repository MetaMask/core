#!/usr/bin/env bash

source "$PWD/scripts/semver.sh"

remote='test'
tmp_dir='/tmp'
sed_pattern='s/^v//'
version_before_package_rename='0.0.0'
tag_prefix_before_package_rename="$1"
dry_run=true

while [[ $# -gt 0 ]]; do
  key="$1"

  case $key in
  -r | --remote)
    remote="$2"
    shift # past argument
    shift # past value
    ;;
  -d | --tmp-dir)
    tmp_dir="$2"
    shift # past argument
    shift # past value
    ;;
  -p | --sed-pattern)
    sed_pattern="$2"
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
  --no-dry-run)
    dry_run=false
    shift # past argument
    shift # past value
    ;;
  *) # package name
    package_name="$1"
    shift # past argument
    ;;
  esac
done

get-tag-commit-pairs() {
  echo "$(cd $tmp_dir/$package_name && git tag --format="%(refname:short)"$'\t'"%(objectname)")"
}

get-version-subject-pairs() {
  while IFS=$'\t' read -r tag commit; do
    version="$(echo "$tag" | sed "$sed_pattern")"
    subject="$(cd $tmp_dir/$package_name && git log $commit -n 1 --oneline --format='%H%x09%s' | cut -f2)"
    echo "$version"$'\t'"$subject"
  done <<<"$(get-tag-commit-pairs)"
}

get-version-commit-pairs() {
  while IFS=$'\t' read -r version subject; do
    commit="$(git log --oneline --format='%H%x09%s' --grep="^$subject$" | cut -f1)"
    echo "$version"$'\t'"$commit"
  done <<<"$(get-version-subject-pairs)"
}

prepend-tag-name() {
  while IFS=$'\t' read -r version commit; do
    local tag_name
    if semverLT "$version" "$version_before_package_rename" || semverEQ "$version" "$version_before_package_rename"; then
      tag_name="$tag_prefix_before_package_rename@$version"
    else
      tag_name="@metamask/$package_name@$version"
    fi
    echo "$commit"$'\t'"$tag_name"
  done <<<"$(get-version-commit-pairs)"
}

if [[ -z $package_name ]]; then
  echo "Missing package name."
  exit 1
fi
while IFS=$'\t' read -r commit tag_name; do
  if [[ $dry_run == true ]]; then
    echo "$commit"$'\t'"$tag_name"
  else
    echo "Creating tag '$tag_name'..."
    git tag "$tag_name" "$commit"
    git push "$remote" "$tag_name"
  fi
done <<<"$(prepend-tag-name)"
