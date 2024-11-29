import { getIfEntriesHaveDifferentSalts } from './utils';

describe('utils - getIfEntriesHaveDifferentSalts()', () => {
  it('should return true if entries have different salts', () => {
    const entries = [
      '{"v":"1","t":"scrypt","d":"1yC/ZXarV57HbqEZ46nH0JWgXfPl86nTHD7kai2g5gm290FM9tw5QjOaAAwIuQESEE8TIM/J9pIj7nmlGi+BZrevTtK3DXWXwnUQsCP7amKd5Q4gs3EEQgXpA0W+WJUgyElj869rwIv/C6tl5E2pK4j/0EAjMSIm1TGoj9FPohyRgZsOIt8VhZfb7w0GODsjPwPIkN6zazvJ3gAFYFPh7yRtebFs86z3fzqCWZ9zakdCHntchC2oZiaApXR9yzaPlGgnPg==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      '{"v":"1","t":"scrypt","d":"x7QqsdqsdEtUo7q/jG+UNkD/HOxQARGGRXsGPrLsDlkwDfgfoYlPI0To/M3pJRBlKD0RLEFIPHtHBEA5bv/2izB21VljvhMnhHfo0KgQ+e8Uq1t7grwa+r+ge3qbPNY+w78Xt8GtC+Hkrw5fORKvCn+xjzaCHYV6RxKYbp1TpyCJq7hDrr1XiyL8kqbpE0hAHALrrQOoV9/WXJi9pC5J118kquXx8CNA1P5wO/BXKp1AbryGR6kVW3lsp1sy3lYE/TApa5lTj+","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
    ];

    const result = getIfEntriesHaveDifferentSalts(entries);
    expect(result).toBe(true);
  });

  it('should return false if entries have the same salts', () => {
    const entries = [
      '{"v":"1","t":"scrypt","d":"+nhJkMMjQljyyyytsnhO4dIzFL/hGR4Y6hb2qUGrPb/hjxHVJUk1jcJAyHP9eUzgZQ==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      '{"v":"1","t":"scrypt","d":"+nhJkMMjQljyyyytsnhO4XYxpF0N3IXuhCpPM9dAyw5pO2gcqcXNucJs60rBtgKttA==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
    ];

    const result = getIfEntriesHaveDifferentSalts(entries);
    expect(result).toBe(false);
  });

  it('should return false if entries do not have salts', () => {
    const entries = [
      '{"v":"1","t":"scrypt","d":"CgHcOM6xCaaNFnPCr0etqyxCq4xoJNQ9gfP9+GRn94hGtKurbOuXzyDoHJgzaJxDKd1zQHJhDwLjnH6oCZvC8XKvZZ6RcrN9BicZHpzpojon+HwpcPHceM/pvoMabYfiXqbokYHXZymGTxE5X+TjFo+HB7/Y6xOCU1usz47bru9vfyZrdQ66qGlMO2MUFx00cnh8xHOksDNC","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":0}',
      '{"v":"1","t":"scrypt","d":"OCrYnCFkt7a33cjaAL65D/WypM+oVxIiGVwMk+mjijcpnG4r3vzPl6OzFpx2LNKHj6YN59wcLje3QK2hISU0R8iXyZubdkeAiY89SsI7owLda96ysF+q6PuyxnWfNfWe+5a1+4O8BVkR8p/9PYimwTN0QGhX2lkfLt5r0aYgsLnWld/5k9G7cB4yqoduIopzpojS5ZGI8PFW","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":0}',
    ];

    const result = getIfEntriesHaveDifferentSalts(entries);
    expect(result).toBe(false);
  });
});
