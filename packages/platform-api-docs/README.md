# `@metamask/platform-api-docs`

Produces documentation for the platform API, the set of actions and events available in clients through the message bus.

When run within a project (such as `metamask-extension` or `metamask-mobile`), this tool looks for messenger action and event types declared within TypeScript source and declaration files within MetaMask NPM packages. It extracts all of the JSDoc from these actions and events, then outputs them into a searchable Docusaurus site.

## Installation

1. Add this package as a development dependency:

   `yarn add @metamask/platform-api-docs`

   or

   `npm install @metamask/platform-api-docs`

2. Add a script to your project's `package.json`. For example:
   ```json
   {
     "scripts": {
       "docs:platform-api:build": "platform-api-docs --build --project-label MyProject"
     }
   }
   ```

## Usage

```
platform-api-docs [project-path] [options]

Arguments:
  project-path             Path to the project to scan (default: current directory)

Options:
  --build                  Generate docs and build static site
  --serve                  Generate docs, build, and serve static site
  --dev                    Generate docs and start dev server with hot reload
  --scan-dir <dir>         Extra source directory to scan (repeatable)
  --output <dir>           Output directory (default: <project-path>/.platform-api-docs)
  --project-label <label>  Short label identifying the project (e.g. "Core", "Extension")
  --help                   Show this help message
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
