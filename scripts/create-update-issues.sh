#!/bin/bash

DEFAULT_LABEL="client-controller-update"

run-create-issue-command() {
  local dry_run="$1"
  local repo="$2"
  local title="$3"
  local body="$4"
  local labels="$5"

  if [[ $dry_run -eq 1 ]]; then
    if [[ -n $labels ]]; then
      echo "> gh issue create --title \"$title\" --body \"$body\" --repo \"$repo\" --label \"$labels\""
    else
      echo "> gh issue create --title \"$title\" --body \"$body\" --repo \"$repo\""
    fi
  else
    if [[ -n $labels ]]; then
      gh issue create --title "$title" --body "$body" --repo "$repo" --label "$labels"
    else
      gh issue create --title "$title" --body "$body" --repo "$repo"
    fi
  fi
}

create-issue() {
  local dry_run="$1"
  local repo="$2"
  local package_name="$3"
  local version="$4"
  local labels="$5"

  local title="Upgrade ${package_name} to version ${version}"
  local body="A new major version of \`${package_name}\`, ${version}, is now available. This issue has been assigned to you and your team because you code-own this package in the \`core\` repo. If this package is present in this project, please prioritize upgrading it soon to unblock new features and bugfixes."

  echo "Creating issue in ${repo} with labels: ${labels}"

  local exitcode

  run-create-issue-command "$dry_run" "$repo" "$title" "$body" "$labels"
  exitcode=$?

  if [[ $exitcode -ne 0 ]]; then
    echo "That didn't work, trying to create issue in ${repo} for ${package_name} ${version} without labels"

    run-create-issue-command "$dry_run" "$repo" "$title" "$body"
    exitcode=$?
  fi

  if [[ $exitcode -eq 0 ]]; then
    echo "Successfully created issue!"
  else
    echo "That didn't work, please create the issue manually"
  fi

  return $exitcode
}

main() {
  local tag_array
  local exitcode
  local package_name
  local package_name_without_leading_at
  local version
  local team_labels
  local labels

  local dry_run=1
  local ref="HEAD"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ref)
        ref="$2"
        shift 2
        ;;
      --no-dry-run)
        dry_run=0
        shift
        ;;
      *)
        echo "Unknown argument: $1"
        echo "Usage: $0 [--ref=REF] [--no-dry-run]"
        exit 1
        ;;
    esac
  done

  if [[ $dry_run -eq 1 ]]; then
    echo "[[[ DRY-RUN MODE ]]]"
    echo
  fi

  local full_ref
  full_ref="$(git rev-parse "$ref")"

  echo "Looking for release tags pointing to $full_ref for major-bumped packages..."
  IFS=$'\n' read -r -d '' -a tag_array < <(git tag --points-at "$full_ref" | grep -E '^@metamask/[a-z0-9-]+@[0-9]+\.0\.0$' && printf '\0')

  if [[ "${#tag_array[@]}" -eq 0 ]]; then
    echo "No tags to process, nothing to do."
    exit
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
    team_labels=$(jq -r --arg key "$package_name_without_leading_at" '.[$key]' teams.json)
    labels="$DEFAULT_LABEL"
    if [[ $team_labels == "null" ]]; then
      echo "Did not find team labels for ${package_name}, will create issues anyway"
    else
      echo "Found team labels for ${package_name}: ${team_labels}"
      labels+=",$team_labels"
    fi

    # Create the issues
    echo
    create-issue "$dry_run" "MetaMask/metamask-extension" "$package_name" "$version" "$labels"
    echo
    create-issue "$dry_run" "MetaMask/metamask-mobile" "$package_name" "$version" "$labels"
  done
}

main "$@"
