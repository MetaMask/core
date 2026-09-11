import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts', 'src/node.ts'],
  project: ['src/**/*.ts'],
  // Both are wired in through the Yarn plugin and the `lavamoat.allowScripts`
  // field rather than imported, so knip cannot see the usage.
  ignoreDependencies: [
    '@lavamoat/allow-scripts',
    '@lavamoat/preinstall-always-fail',
  ],
};

export default config;
