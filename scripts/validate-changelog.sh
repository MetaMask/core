#!/usr/bin/env bash

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Missing package name."
  exit 1
fi

package_name="$1"

if [[ "${GITHUB_REF:-}" =~ '^release/' ]]; then
  yarn auto-changelog validate --tag-prefix "${package_name}@" --rc
elif [[ $# -gt 2 ]]; then
  # In case of package rename
  version_before_package_rename="$2"
  tag_prefix_before_package_rename="$3"
  yarn auto-changelog validate --tag-prefix "${package_name}@" --version-before-package-rename "${version_before_package_rename}" --tag-prefix-before-package-rename "${tag_prefix_before_package_rename}@"
else
  yarn auto-changelog validate --tag-prefix "${package_name}@"
fi
