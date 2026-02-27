# `@metamask/messenger-docs`

Generate and serve Messenger API documentation for MetaMask controller packages.

Scans TypeScript source files and declaration files for messenger action/event types, then generates a searchable Docusaurus site with per-namespace documentation.

## Installation

`yarn add @metamask/messenger-docs`

or

`npm install @metamask/messenger-docs`

## Usage

### Core monorepo

The package includes workspace scripts for development:

```bash
# Generate docs from all packages
yarn workspace @metamask/messenger-docs docs:generate

# Generate + start dev server with hot reload
yarn workspace @metamask/messenger-docs docs:dev

# Generate + build static site
yarn workspace @metamask/messenger-docs docs:build

# Generate + build + serve
yarn workspace @metamask/messenger-docs docs:serve
```

### Client projects (Extension, Mobile)

Add `@metamask/messenger-docs` as a dev dependency, then add a script to your `package.json`:

```json
{
  "scripts": {
    "docs:messenger": "messenger-docs --serve"
  }
}
```

By default, the tool scans `src/` for `.ts` files and `node_modules/@metamask/` for `.d.cts` declaration files. If your project has source files in other directories, configure `scanDirs` in `package.json`:

```json
{
  "messenger-docs": {
    "scanDirs": ["app", "src"]
  }
}
```

Or pass `--scan-dir` flags:

```bash
messenger-docs --scan-dir app --scan-dir shared --serve
```

### CLI options

```
messenger-docs [project-path] [options]

Arguments:
  project-path      Path to the project to scan (default: current directory)

Options:
  --build           Generate docs and build static site
  --serve           Generate docs, build, and serve static site
  --dev             Generate docs and start dev server with hot reload
  --scan-dir <dir>  Extra source directory to scan (repeatable)
  --output <dir>    Output directory (default: <project-path>/.messenger-docs)
  --help            Show this help message
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
