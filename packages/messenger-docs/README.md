# `@metamask/messenger-docs`

Generate and serve Messenger API documentation for MetaMask controller packages.

## Installation

`yarn add @metamask/messenger-docs`

or

`npm install @metamask/messenger-docs`

## Usage

```bash
# Default: scans cwd for node_modules/@metamask controller/service packages
npx @metamask/messenger-docs

# Scan a specific project
npx @metamask/messenger-docs /path/to/project

# Generate + build static site
npx @metamask/messenger-docs --build

# Generate + serve (build + http server)
npx @metamask/messenger-docs --serve

# Generate + dev server (hot reload)
npx @metamask/messenger-docs --dev

# Scan source .ts files instead of .d.cts (for monorepo development)
npx @metamask/messenger-docs --source

# Custom output directory (default: .messenger-docs)
npx @metamask/messenger-docs --output ./my-docs
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
