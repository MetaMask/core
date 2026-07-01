// TEMPORARY dev-link helper: bundles src -> dist (cjs + mjs) so a local symlink
// consumer (e.g. the extension) can use this package without the full monorepo
// ts-bridge build. Run with `--watch` to rebuild on every src change.
import esbuild from 'esbuild';

const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  packages: 'external',
  platform: 'node',
  logLevel: 'info',
};

const watch = process.argv.includes('--watch');

const contexts = await Promise.all([
  esbuild.context({ ...shared, format: 'cjs', outfile: 'dist/index.cjs' }),
  esbuild.context({ ...shared, format: 'esm', outfile: 'dist/index.mjs' }),
]);

if (watch) {
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('[client-shared] dev-link watching src for changes...');
} else {
  await Promise.all(contexts.map((context) => context.rebuild()));
  await Promise.all(contexts.map((context) => context.dispose()));
  console.log('[client-shared] dev-link build complete.');
}
