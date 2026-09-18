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
  --strategy <name>        How to find actions and events: "scan" (default) or
                           "root-messenger" (see below)
  --scan-dir <dir>         Extra source directory to scan (repeatable; --strategy scan only)
  --root-actions <ref>     Type aliasing the union of every action, as "<file>#<TypeName>"
                           (required with --strategy root-messenger)
  --root-events <ref>      Type aliasing the union of every event, as "<file>#<TypeName>"
                           (required with --strategy root-messenger)
  --output <dir>           Output directory (default: <project-path>/.platform-api-docs)
  --project-label <label>  Short label identifying the project (e.g. "Core", "Extension")
  --help                   Show this help message
```

## Strategies

Which strategy to use depends on whether the project has a single messenger carrying every action and event.

### `scan` (default)

Parses every TypeScript source and declaration file it can find — the scan directories, `packages/*/src`, and `node_modules/@metamask/*/dist` — and reads every `*Messenger` type alias it encounters.

Use this when no single messenger aggregates every capability, as in a monorepo of independently published packages.

### `root-messenger`

Resolves the two types the project declares for its root messenger capabilities — the collection of every action and the collection of every event — and lets the TypeScript type checker walk them. Only the files named on the command line are opened.

Use this when the project has one root messenger carrying every action and event, as a client application built on these packages does. It is substantially faster than `scan`, because it reads what the project already declares instead of re-deriving it, and it documents only what is reachable through that messenger.

```
platform-api-docs \
  --strategy root-messenger \
  --root-actions 'src/messenger.ts#RootActions' \
  --root-events 'src/messenger.ts#RootEvents'
```

Each reference names a type alias, written by hand or computed — the type checker resolves either.

The docs contain exactly what the named types contain, so those types should be the ones carrying every capability rather than a narrowed subset. Capability types that can't be documented are reported rather than dropped silently: those declared inline in the capability collection type (with no name or JSDoc to document), and those whose shape can't be read (most often a `type` property that isn't a namespaced string literal).

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
