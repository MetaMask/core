import { greeter } from '../index.js';

describe('greeter', () => {
  it('should greet', () => {
    expect(greeter('World')).toBe('Hello, World!');
  });
});
