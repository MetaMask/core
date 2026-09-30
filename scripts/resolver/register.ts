// oxlint-disable-next-line n/no-unsupported-features/node-builtins
import { register } from 'node:module';

// Register a resolver that resolves `.js` to `.ts` (if exists). This is a
// temporary solution until we change all imports to `.ts`.
register('./resolver.ts', import.meta.url);
