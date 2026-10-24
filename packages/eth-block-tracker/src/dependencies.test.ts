import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('@metamask/eth-block-tracker package manifest', () => {
  it('declares @metamask/json-rpc-engine as a production dependency', () => {
    // `PollingBlockTracker.ts` imports the `ContextConstraint` and
    // `MiddlewareContext` types from `@metamask/json-rpc-engine/v2`. Those
    // types appear in the published declaration files through
    // `PollingBlockTrackerOptions` and the `PollingBlockTracker` class
    // generic, so consumers need `@metamask/json-rpc-engine` installed to
    // type-check against this package.
    //
    // Regression test for https://github.com/MetaMask/core/issues/6864
    const packageJsonPath = path.resolve(
      import.meta.dirname,
      '..',
      'package.json',
    );
    const { dependencies } = JSON.parse(
      readFileSync(packageJsonPath, 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };

    expect(dependencies['@metamask/json-rpc-engine']).toBeDefined();
  });
});
