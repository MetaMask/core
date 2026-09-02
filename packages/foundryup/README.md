# `@metamask/foundryup`

foundryup

## Installation

`yarn add @metamask/foundryup`

or

`npm install @metamask/foundryup`

## Usage

Once installed into a package you can do `yarn bin mm-foundryup`.

This will install the latest version of Foundry things by default.

Try `yarn bin mm-foundryup --help` for more options.

### Retry configuration

Foundry archive downloads retry transient failures with exponential backoff and equal jitter. The retry policy can be
configured with CLI flags or equivalent environment variables:

| CLI flag                   | Environment variable               | Default | Description                                    |
| -------------------------- | ---------------------------------- | ------: | ---------------------------------------------- |
| `--max-attempts`           | `FOUNDRYUP_MAX_ATTEMPTS`           |       5 | Total download attempts, including the first   |
| `--initial-retry-delay-ms` | `FOUNDRYUP_INITIAL_RETRY_DELAY_MS` |   1,000 | Initial delay before exponential growth, in ms |
| `--max-retry-delay-ms`     | `FOUNDRYUP_MAX_RETRY_DELAY_MS`     |  30,000 | Maximum delay before applying jitter, in ms    |

Set `--max-attempts 1` to disable retries.

Once you have the binaries installed, you have to figure out how to get to them.

Probably best to just add each as a `package.json` script:

```json
"scripts": {
  "anvil": "node_modules/.bin/anvil",
}
```

Kind of weird, but it seems to work okay. You can probably use `npx anvil` in place of `node_modules/.bin/anvil`, but
getting it to work in all scenarios (cross platform and in CI) wasn't straightforward. `yarn bin anvil` doesn't work
in yarn v4 because it isn't a bin of `@metamask/foundryup`, so yarn pretends it doesn't exist.

This all needs to work.

---

You can try it here in the monorepo by running `yarn workspace @metamask/foundryup anvil`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
