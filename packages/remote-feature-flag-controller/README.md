# `@metamask/remote-feature-flag-controller`

The RemoteFeatureFlagController manages the retrieval and caching of remote feature flags. It fetches feature flags from a remote API, caches them, and provides methods to access and manage these flags. The controller ensures that feature flags are refreshed based on a specified interval and handles cases where the controller is disabled or the network is unavailable.

## Threshold-scoped variation ordering

Threshold-scoped variations are evaluated in array order, and the first variation with
`threshold <= scope.value` is selected.

Because selection is order-dependent, threshold variations **must be sorted in ascending order**
by `scope.value` to get expected bucket behavior.

```jsonc
// Correct: ascending order (0.1, then 1.0)
[
  {
    "name": "Control is OFF",
    "scope": { "type": "threshold", "value": 0.1 },
    "value": { "minimumVersion": "7.67.0", "variant": "treatment" }
  },
  {
    "name": "Control is ON",
    "scope": { "type": "threshold", "value": 1.0 },
    "value": { "minimumVersion": "7.67.0", "variant": "control" }
  }
]
```

```jsonc
// Incorrect: descending order (1.0, then 0.1)
// The first entry will always match first.
[
  {
    "name": "Control is ON",
    "scope": { "type": "threshold", "value": 1.0 },
    "value": { "minimumVersion": "7.67.0", "variant": "control" }
  },
  {
    "name": "Control is OFF",
    "scope": { "type": "threshold", "value": 0.1 },
    "value": { "minimumVersion": "7.67.0", "variant": "treatment" }
  }
]
```

## Installation

`yarn add @metamask/remote-feature-flag-controller`

or

`npm install @metamask/remote-feature-flag-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
