# `@metamask/messenger-docs`

Produces documentation for the platform API, the set of actions and events available in clients through the message bus.

When run within a project (such as `metamask-extension` or `metamask-mobile`), this tool looks for messenger action and event types declared within TypeScript source and declaration files within MetaMask NPM packages. It extracts all of the JSDoc from these actions and events, then outputs them into a searchable Docusaurus site.

## Installation

1. Add this package as a dependency (`yarn add --dev @metamask/messenger-docs` or `npm install --save-dev @metamask/messenger-docs`).
2. Add a script to your project's `package.json`:
   ```json
   {
     "scripts": {
       "docs:messenger": "messenger-docs"
     }
   }
   ```
3. (Optional) Configure the tool by adding a `messenger-docs` section to `package.json`. For instance, you can override the directory that should be scanned (default: `["src/"]`):
   ```json
   {
     "messenger-docs": {
       "scanDirs": ["app", "src"]
     }
   }
   ```

## Usage

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
