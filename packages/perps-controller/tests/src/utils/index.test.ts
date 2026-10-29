import { afterEach, describe, expect, it, vi } from 'vitest';

import { getEnvironment } from '../../../src/utils/index.js';

describe('getEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns PROD in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(getEnvironment()).toBe('PROD');
  });

  it('returns PROD when NODE_ENV is not set', () => {
    vi.stubEnv('NODE_ENV', undefined);

    expect(getEnvironment()).toBe('PROD');
  });

  it.each(['development', 'test'])('returns DEV in %s', (env) => {
    vi.stubEnv('NODE_ENV', env);

    expect(getEnvironment()).toBe('DEV');
  });
});
