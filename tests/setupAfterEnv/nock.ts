import { afterEach, beforeEach } from '@jest/globals';
import { disableNetConnect, cleanAll, enableNetConnect } from 'nock';

// `beforeEach`/`afterEach` are imported from `@jest/globals` rather than read off
// the ambient global, so that this file type-checks even when it is pulled into
// the program of a package that has migrated to Vitest and no longer declares
// Jest's types.

beforeEach(() => {
  disableNetConnect();
});

afterEach(() => {
  cleanAll();
  enableNetConnect();
});
