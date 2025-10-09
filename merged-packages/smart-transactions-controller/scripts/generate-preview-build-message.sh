#!/usr/bin/env bash

main() {
  local package_name
  local package_version

  package_name="$(jq -r '.name' < package.json)"
  package_version="$(jq -r '.version' < package.json)"

  local preview_build_message="\
A preview build for this branch has been published.

You can configure your project to use the preview build with this identifier:

    npm:${package_name}@${package_version}

[See these instructions](https://github.com/MetaMask/smart-transactions-controller/blob/main/README.md#testing-changes-in-other-projects-using-preview-builds) for more information about preview builds.\
"

  echo "$preview_build_message"
}

main "$@"
