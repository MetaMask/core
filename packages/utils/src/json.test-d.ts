/* eslint-disable @typescript-eslint/consistent-type-definitions */

import type { Infer } from '@metamask/superstruct';
import { boolean, number, optional, string } from '@metamask/superstruct';
import { describe, expectTypeOf, test } from 'vitest';

import { exactOptional, object } from './index.js';

describe('exactOptional', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Type-level test fixture; consumed via `typeof`.
  const exactOptionalObject = object({
    a: number(),
    b: optional(string()),
    c: exactOptional(boolean()),
  });

  type ExactOptionalObject = Infer<typeof exactOptionalObject>;

  test('distinguishes optional from exactOptional members', () => {
    expectTypeOf({ a: 0 }).toExtend<ExactOptionalObject>();
    expectTypeOf({ a: 0, b: 'test' }).toExtend<ExactOptionalObject>();
    expectTypeOf({
      a: 0,
      b: 'test',
      c: true,
    }).toExtend<ExactOptionalObject>();
    expectTypeOf({
      a: 0,
      b: 'test',
      c: 0,
    }).not.toExtend<ExactOptionalObject>();
    expectTypeOf({
      a: 0,
      b: 'test',
      c: undefined,
    }).not.toExtend<ExactOptionalObject>();
  });
});
