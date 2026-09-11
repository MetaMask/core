# Assets controller architecture diagrams

Scratch space for diagrams that explain how this package actually behaves. Nothing here
is built, published, or imported by the package.

Each diagram exists in four forms:

- `*.<type>.json` — the source of truth, authored against the
  [Archify](https://tt-a1i.github.io/archify/) schemas.
- `*.html` — a self-contained interactive viewer: guided views, light and dark themes,
  hover focus, and an export menu.
- `*.png` — a flat raster of the diagram alone, for pasting into issues and docs.
- `*.svg` — the same, as self-contained vector output.

| Diagram                                                | Kind         | Question it answers                                                         |
| ------------------------------------------------------ | ------------ | --------------------------------------------------------------------------- |
| [`01-component-map`](./01-component-map.png)           | architecture | What exists, how callers reach it, and which data source claims which chain |
| [`02-fetch-pipeline`](./02-fetch-pipeline.png)         | workflow     | What `getAssets` awaits, and what it defers to a background lane            |
| [`03-fallback-cascade`](./03-fallback-cascade.png)     | sequence     | How one EVM chain degrades from Accounts API to RPC to per-asset calls      |
| [`04-tracking-lifecycle`](./04-tracking-lifecycle.png) | lifecycle    | Why tracking is or is not running, and what stop and destroy each release   |
| [`05-evm-rpc-dataflow`](./05-evm-rpc-dataflow.png)     | dataflow     | How tracked state becomes one `aggregate3` call and then decoded balances   |
| [`06-event-stack`](./06-event-stack.png)               | workflow     | How `handleAssetsUpdate` composes a different middleware stack per source   |
| [`07-token-filtering`](./07-token-filtering.png)       | workflow     | The three moments a spam token can be filtered out, and what each removes   |
| [`08-spam-verdict`](./08-spam-verdict.png)             | dataflow     | How one candidate token turns into a keep or drop verdict                   |
| [`09-visibility-gate`](./09-visibility-gate.png)       | workflow     | Why a token that is in state still does not come back from a read           |

Diagrams 02 and 06 are the two halves of the middleware architecture: 02 is the fetch
stack that a caller drives, 06 is the event stack that an incoming update drives.

Diagrams 07, 08 and 09 cover token filtering. 07 is _when_ a token is judged as spam and
08 is _how_ that verdict is reached — both are write-path filters that decide what
reaches state. 09 is the separate read-path filter that decides what a caller gets back
out of state, and it deletes nothing.

## Regenerating

```bash
archify deliver <kind> <source.json> <output.html> --quality showcase
archify visual-check <output.html> --json
```

All nine pass `deliver` at the `showcase` quality profile. All except
`04-tracking-lifecycle` also pass `visual-check` containment at 1440×900, 1600×1000,
1920×1080, and 2048×1320 in both themes; the lifecycle renderer's band geometry has a
fixed vertical budget that makes the page scroll vertically below 1920px wide, which the
bundled Archify lifecycle example does too.
