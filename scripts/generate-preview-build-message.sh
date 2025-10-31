#!/usr/bin/env bash

main() {
  local identifiers="$(./scripts/list-workspace-versions.sh --json | jq --raw-output 'map("npm:" + .name + "@" + .version) | .[]')"

  cat <<EOT
Preview builds for this branch have been published. You can use the following identifiers to configure your project:

<details>

<summary>Expand for the full list.</summary>

```
${identifiers}
```

</details>

[Learn more about preview builds.](https://github.com/MetaMask/core/blob/main/docs/contributing.md#testing-changes-against-other-projects-using-preview-builds)
EOT
}

main "$@"
