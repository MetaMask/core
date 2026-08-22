import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('@metamask/eth-block-tracker package manifest', () => {
  it('declares @metamask/json-rpc-engine as a production dependency', () => {
    // `PollingBlockTracker.ts` imports the `ContextConstraint` and
    // `MiddlewareContext` types from `@metamask/json-rpc-engine/v2` with a
    // type-only import. Those types leak into the published declaration files
    // through `PollingBlockTrackerOptions` and the `PollingBlockTracker` class
    // generic, so consumers need `@metamask/json-rpc-engine` resolvable when
    // type-checking against this package. It must therefore be a production
    // dependency rather than only a devDependency.
    //
    // Regression test for https://github.com/MetaMask/core/issues/6864
    const packageJsonPath = resolve(__dirname, '..', 'package.json');
    const { dependencies } = JSON.parse(
      readFileSync(packageJsonPath, 'utf8'),
    ) as { dependencies: Record<string, string> };

    expect(dependencies['@metamask/json-rpc-engine']).toBeDefined();
  });
});
