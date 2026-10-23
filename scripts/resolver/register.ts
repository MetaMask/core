// oxlint-disable-next-line n/no-unsupported-features/node-builtins
import { registerHooks } from 'node:module';

import { resolve } from './resolver.ts';

// Register a resolver that resolves `.js` to `.ts` (if exists). This is a
// temporary solution until we change all imports to `.ts`.
registerHooks({ resolve });
