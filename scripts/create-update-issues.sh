#!/bin/bash

set -euo pipefail

DEFAULT_REF="HEAD"
DEFAULT_LABEL="client-controller-update"
EXTENSION_REPO="MetaMask/metamask-extension"
MOBILE_REPO="MetaMask/metamask-mobile"

print-usage() {
  cat <<EOT
Detects major-bumped packages in a release commit and creates tickets in clients
that instructs engineers to upgrade to them.

Usage: $0 [--ref REF] [--no-dry-run]

OPTIONS:

--ref REF, -r REF       The release commit to inspect.
--no-dry-run            By default, this script won't do anything, to allow you
                        to test it. Pass this option to override that.
--help, -h              You're looking at it ;)
EOT
}

existing-issue-found() {
  local repo="$1"
  local package_name="$2"
  local version="$3"
  local all_issues="$4"

  if [[ -z "$all_issues" || "$all_issues" == "[]" ]]; then
    echo "Found no issues in the repo."
    return 1
  fi

  local package_name_without_at="${package_name#@}"
  local package_name_escaped="${package_name//./\\.}"
  local package_name_without_at_escaped="${package_name_without_at//./\\.}"
  local regex_pattern="^(Update|Upgrade) (${package_name_escaped}|${package_name_without_at_escaped}) to version ${version//./\\.}$"

  local matching_issues
  matching_issues=$(echo "$all_issues" | jq --raw-output --arg pattern "$regex_pattern" '.[] | select(.title | test($pattern)) | "- #\(.number): \(.title) (\(.url))"')

  if [[ -n "$matching_issues" ]]; then
    local issue_count
    issue_count=$(echo "$matching_issues" | wc -l | sed 's/^[[:space:]]*//')
    echo "Found $issue_count existing issue(s) matching pattern: \"$regex_pattern\""
    echo "$matching_issues"
    return 0
  fi

  echo "Found no existing issues matching pattern: \"$regex_pattern\""
  return 1
}

run-create-issue-command() {
  local dry_run="$1"
  local repo="$2"
  local title="$3"
  local body="$4"
  local labels="$5"

  if [[ $dry_run -eq 1 ]]; then
    echo "> gh issue create --title \"$title\" --body \"$body\" --repo \"$repo\" --label \"$labels\""
  else
    gh issue create --title "$title" --body "$body" --repo "$repo" --label "$labels"
  fi
}

create-issue() {
  local dry_run="$1"
  local repo="$2"
  local package_name="$3"
  local version="$4"
  local team_labels="$5"

  local title="Upgrade ${package_name} to version ${version}"
  local body="A new major version of \`${package_name}\`, ${version}, is now available. This issue has been assigned to you and your team because you code-own this package in the \`core\` repo. If this package is present in this project, please prioritize upgrading it soon to unblock new features and bugfixes."
  local labels="$DEFAULT_LABEL"
  if [[ -n $team_labels ]]; then
    labels+=",$team_labels"
  fi

  local exitcode

  echo
  echo "Creating issue in ${repo} with labels: \"${labels}\"..."

  echo "----------------------------------------"
  set +e
  run-create-issue-command "$dry_run" "$repo" "$title" "$body" "$labels"
  exitcode=$?
  set -e
  echo "----------------------------------------"

  if [[ $exitcode -eq 0 ]]; then
    if [[ -n $team_labels ]]; then
      if [[ $dry_run -eq 1 ]]; then
        echo "✅ Would have successfully created issue!"
      else
        echo "✅ Successfully created issue!"
      fi
    else
      if [[ $dry_run -eq 1 ]]; then
        echo "⚠️ Would have successfully created issue, but you would need to assign the correct team label."
      else
        echo "⚠️ Successfully created issue, but you will need to assign the correct team label (see URL above)."
      fi
    fi
  else
    echo "❌ Issue was not created. Please create an issue manually which requests that ${package_name} be updated to version ${version}, assigning the correct team labels."
  fi

  return $exitcode
}

main() {
  local tag_array
  local package_name
  local package_name_without_leading_at
  local version
  local found_team_labels
  local team_labels

  local exitcode=0
  local dry_run=1
  local ref="$DEFAULT_REF"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ref|-r)
        if [[ "$2" =~ ^- ]]; then
          echo "ERROR: Invalid argument for $1."
          echo "---------------------"
          print-usage
          exit 1
        fi
        if [[ -n "${2:-}" ]]; then
          ref="$2"
          shift 2
        else
          ref="$DEFAULT_REF"
          shift
        fi
        ;;
      --no-dry-run)
        dry_run=0
        shift
        ;;
      --help|-h)
        print-usage
        exit 0
        ;;
      *)
        echo "ERROR: Unknown argument: $1"
        echo "---------------------"
        print-usage
        exit 1
        ;;
    esac
  done

  local full_ref
  if ! full_ref="$(git rev-parse "$ref" 2>/dev/null)"; then
    echo "ERROR: Unknown ref \"$ref\"."
    echo "---------------------"
    print-usage
    exit 1
  fi

  if [[ $dry_run -eq 1 ]]; then
    echo "[[[ DRY-RUN MODE ]]]"
    echo
  fi

  if [[ "$full_ref" == "$ref" ]]; then
    echo "Looking for release tags pointing to $full_ref for major-bumped packages..."
  else
    echo "Looking for release tags pointing to $ref ($full_ref) for major-bumped packages..."
  fi
  tag_array=()
  while IFS= read -r line; do
    if [[ "$line" =~ ^@metamask/[^@]+@[0-9]+\.0\.0$ ]]; then
      tag_array+=("$line")
    fi
  done < <(git tag --points-at "$full_ref" 2>/dev/null || true)

  if [[ "${#tag_array[@]}" -eq 0 ]]; then
    echo "No tags to process, nothing to do."
    exit 0
  fi

  echo

  local all_issues_extension
  echo "Fetching issues on $EXTENSION_REPO with label $DEFAULT_LABEL..."
  if ! all_issues_extension="$(gh issue list --repo "$EXTENSION_REPO" --label "$DEFAULT_LABEL" --state all --json number,title,url 2>&1)"; then
    echo "❌ Failed to fetch issues from ${EXTENSION_REPO}"
    echo "$all_issues_extension"
    exit 1
  fi

  local all_issues_mobile
  echo "Fetching issues on $MOBILE_REPO with label $DEFAULT_LABEL..."
  if ! all_issues_mobile="$(gh issue list --repo "$MOBILE_REPO" --label "$DEFAULT_LABEL" --state all --json number,title,url 2>&1)"; then
    echo "❌ Failed to fetch issues from ${MOBILE_REPO}"
    echo "$all_issues_mobile"
    exit 1
  fi

  for tag in "${tag_array[@]}"; do
    # The tag name looks like "<package_name>@<version>",
    # and "<package_name>" looks like "@metamask/*"
    package_name="${tag%@*}"
    package_name_without_leading_at="${package_name#@}"
    version="${tag##*@}"

    echo
    echo "=== ${package_name} ${version} ==="
    echo

    # Use teams.json to determine which teams code-own this package, and what their labels are
    found_team_labels=$(jq --raw-output --arg key "${package_name_without_leading_at}" '.[$key]' teams.json)
    if [[ $found_team_labels == "null" ]]; then
      echo "Did not find team labels for ${package_name}. Creating issues anyway..."
      team_labels=""
      exitcode=1
    else
      echo "Found team labels for ${package_name}: \"${found_team_labels}\". Creating issues..."
      team_labels="$found_team_labels"
    fi

    # Create the extension issue, if it doesn't exist yet
    echo
    echo "Checking for existing issues in ${EXTENSION_REPO}..."
    if existing-issue-found "${EXTENSION_REPO}" "$package_name" "$version" "$all_issues_extension"; then
      if [[ $dry_run -eq 1 ]]; then
        echo "⏭️ Would not have created issue because it already exists"
      else
        echo "⏭️ Not creating issue because it already exists"
      fi
    elif ! create-issue "$dry_run" "$EXTENSION_REPO" "$package_name" "$version" "$team_labels"; then
      exitcode=1
    fi

    # Create the mobile issue, if it doesn't exist yet
    echo
    echo "Checking for existing issues in ${MOBILE_REPO}..."
    if existing-issue-found "${MOBILE_REPO}" "$package_name" "$version" "$all_issues_mobile"; then
      if [[ $dry_run -eq 1 ]]; then
        echo "⏭️ Would not have created issue because it already exists"
      else
        echo "⏭️ Not creating issue because it already exists"
      fi
    elif ! create-issue "$dry_run" "$MOBILE_REPO" "$package_name" "$version" "$team_labels"; then
      exitcode=1
    fi
  done

  if [[ $exitcode -ne 0 ]]; then
    echo
    echo "One or more warnings or errors were found. See above for details."
  fi

  return $exitcode
}

main "$@"
