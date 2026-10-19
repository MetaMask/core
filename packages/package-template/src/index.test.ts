import { describe, expect, it } from 'vitest';

import greeter from './index.js';

describe('Test', () => {
  it('greets', () => {
    const name = 'Huey';
    const result = greeter(name);
    expect(result).toBe('Hello, Huey!');
  });
});
