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
  sed pattern for extracting verson numbers from the original repo's tag names. Adjust if the original tag names follow a different naming scheme than 'v0.0.0'.

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
