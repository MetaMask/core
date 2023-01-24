import { arrayFromEntries, objectFromEntries } from './object';

describe('objectFromEntries', () => {
  it('returns an object from an entry array', () => {
    const object = {
      foo: {
        bar: 'baz',
      },
      bar: {
        baz: 'qux',
      },
      qux: 1,
      quux: 'foo',
    };

    const obj = objectFromEntries(Object.entries(object));
    expect(obj).toStrictEqual(object);
  });
});

describe('arrayFromEntries', () => {
  it('returns an array from an entry array', () => {
    const array = [
      {
        foo: 'bar',
      },
      {
        bar: 'baz',
      },
      1,
      'foo',
    ];

    const arr = arrayFromEntries(Object.entries(array));
    expect(arr).toStrictEqual(array);
  });
});
