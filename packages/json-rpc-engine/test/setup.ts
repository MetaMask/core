import cloneDeep from 'lodash/cloneDeep';

import '../../../tests/setup';

// Polyfill structuredClone if it's not available.
globalThis.structuredClone =
  typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone
    : cloneDeep;
