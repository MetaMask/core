#!/usr/bin/env bash

source "$PWD/scripts/semver.sh"

remote='test'
version_before_package_rename='0.0.0'
tag_prefix_before_package_rename="$1"
tmp_dir='/tmp'
sed_pattern='s/^v//'
dry_run=true

print-usage() {
  cat <<EOF

Migrates tags.

$0 [OPTIONS] PACKAGE_NAME

OPTIONS:

-r REMOTE
--remote REMOTE
  Specifies the remote git repo where the tags will be pushed.

-v VERSION_BEFORE_PACKAGE_RENAME
--version-before-package-rename VERSION_BEFORE_PACKAGE_RENAME
  The version before the package rename. If package was never renamed, omit this and all tag names will be prepended with the '@metamask/' namespace.

-t TAG_PREFIX_BEFORE_PACKAGE_RENAME
--tag-prefix-before-package-rename TAG_PREFIX_BEFORE_PACKAGE_RENAME
  Specifies the tag prefix before the package rename. Defaults to the package name.

-d TMP_DIR
--tmp-dir TMP_DIR
  Specifies the temporary directory where the $(git-filter-repo)-applied clone of the original repo is located. Defaults to '/tmp'.

-p SED_PATTERN
--sed-pattern SED_PATTERN
  sed pattern for extracting version numbers from the original repo's tag names. Adjust if the original tag names follow a different naming scheme than 'v0.0.0'.

--no-dry-run
  If specified, the tags will be created and pushed to the remote repo. Otherwise, the tags and associated release commit hashes will only be printed to stdout.
EOF
}

while [[ $# -gt 0 ]]; do
  key="$1"

  case $key in
  -h | --help)
    print-usage
    exit 0
    ;;
  -r | --remote)
    remote="$2"
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

get-version-message-pairs() {
  local version
  local message
  while IFS=$'\t' read -r tag commit; do
    version="$(echo "$tag" | sed "$sed_pattern")"
    message="$(cd $tmp_dir/$package_name && git log $commit -n 1 --oneline --format='%s')"
    echo "$version"$'\t'"$message"
  done <<<"$(get-tag-commit-pairs)"
}

find-commits-matching-message() {
  local expected_message="$1"
  while IFS=$'\t' read -r commit actual_message; do
    if [[ $actual_message == $expected_message ]]; then
      echo "$commit"
    fi
  done <<<"$(git log --oneline --format='%H%x09%s' --grep="$expected_message" --fixed-strings)"
}

get-version-commit-pairs() {
  local commits
  local num_commits
  local commits_as_string
  local error
  while IFS=$'\t' read -r version message; do
    commits="$(find-commits-matching-message "$message")"
    num_commits="$(echo $commits | wc -l | sed -E 's/^[ ]+//')"
    commits_as_string="$(echo $commits | awk '{ if(FNR == 1) { printf "%s", $0 } else { printf ", %s", $0 } }')"
    if [[ $num_commits -eq 0 ]]; then
      error="Could not find commit for version '$version' and message '$message'."
    elif [[ $num_commits -gt 1 ]]; then
      error="More than one commit found for '$version' and message '$message': $commits_as_string"
    else
      error=""
    fi
    echo "$version"$'\t'"$commits"$'\t'"$message"$'\t'"$error"
  done <<<"$(get-version-message-pairs)"
}

get-commit-tagname-pairs() {
  local tag_name
  while IFS=$'\t' read -r version commit message error; do
    if semverLT "$version" "$version_before_package_rename" || semverEQ "$version" "$version_before_package_rename"; then
      tag_name="$tag_prefix_before_package_rename@$version"
    else
      tag_name="@metamask/$package_name@$version"
    fi
    echo "$tag_name"$'\t'"$commit"$'\t'"$message"$'\t'"$error"
  done <<<"$(get-version-commit-pairs)"
}

main() {
  if [[ -z $package_name ]]; then
    echo "Missing package name."
    print-usage
    exit 1
  fi
  while IFS=$'\t' read -r tag_name commit message error; do
    if [[ -n $error ]]; then
      echo "ERROR: $error" >&2
    elif [[ $dry_run == true ]]; then
      echo "$commit"$'\t'"$tag_name"$'\t'"$message"
    else
      echo "Creating tag '$tag_name'..."
      git tag "$tag_name" "$commit"
      git push "$remote" "$tag_name"
    fi
  done <<<"$(get-commit-tagname-pairs)"
}

main
