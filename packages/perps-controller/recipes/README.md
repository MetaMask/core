# Perps validation recipes

This folder contains structured validation recipes for agentic development loops.

Recipes are small, reviewable workflows that let an agent or reviewer run the same
checks repeatedly and collect machine-readable evidence. They are intentionally
kept separate from package scripts so the published controller API and normal
workspace command surface stay unchanged.

The current headless smoke recipe mirrors how MetaMask Mobile and Extension use
the package: a client calls `PerpsController:*` messenger actions, and the
controller delegates to its services/providers. The recipe must not call
protocol SDKs such as HyperLiquid directly.

Recipe evidence is written under the repo-root `temp/` directory (gitignored).
From `packages/perps-controller`, that path is `../../temp/perps-controller/...`.

Run manually from the repository root with:

```bash
yarn workspace @metamask/perps-controller exec farmslot-recipe run \
  recipes/client-smoke.recipe.json \
  --artifacts-dir ../../temp/perps-controller/client-smoke \
  --action-manifest recipes/headless.action-manifest.json \
  --project-root .
```

This shape is compatible with the way Extension and Mobile validation recipes are
used during agentic loops: the recipe defines intent and evidence, while the
project-native test remains the source of truth for the actual behavior.
