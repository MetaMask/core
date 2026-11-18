import { describe, expect, it } from 'vitest';

import { createBip39KeyFromSeed, mnemonicToSeed } from './index.js';

describe('index', () => {
  it('has expected exports', () => {
    expect(createBip39KeyFromSeed).toBeDefined();
    expect(mnemonicToSeed).toBeDefined();
  });
});
