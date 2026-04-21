// This is a placeholder test file. The real unit tests for PerpsController
// live in Mobile (source of truth). This file exists solely to satisfy
// Core's CI requirement that every package has at least one test.
//
// It lives in tests/ (not src/) so the Mobile sync script (which uses
// rsync --delete on src/) does not remove it.
//
// Remove this file when tests are migrated from Mobile to Core.

// Satisfies import-x/unambiguous (file must be an ES module).
import type { PerpsControllerState } from '../src';

describe('PerpsController', () => {
  it('exports PerpsControllerState type', () => {
    const stub: PerpsControllerState | undefined = undefined;
    expect(stub).toBeUndefined();
  });
});
