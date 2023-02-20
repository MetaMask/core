export const JSON_FIXTURES = {
  valid: [
    null,
    { a: 1 },
    ['a', 2, null],
    [{ a: null, b: 2, c: [{ foo: 'bar' }] }],
  ],
  invalid: [undefined, Symbol('bar'), () => 'foo', [{ a: undefined }]],
};

export const JSON_RPC_NOTIFICATION_FIXTURES = {
  valid: [
    {
      jsonrpc: '2.0',
      method: 'notify',
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      params: {
        foo: 'bar',
      },
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      params: ['foo'],
    },
  ],
  invalid: [
    {},
    [],
    true,
    false,
    null,
    undefined,
    1,
    'foo',
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'notify',
    },
    {
      jsonrpc: '1.0',
      method: 'notify',
    },
    {
      jsonrpc: 2.0,
      method: 'notify',
    },
    {
      jsonrpc: '2.0',
      method: {},
    },
    {
      jsonrpc: '2.0',
      method: [],
    },
    {
      jsonrpc: '2.0',
      method: true,
    },
    {
      jsonrpc: '2.0',
      method: false,
    },
    {
      jsonrpc: '2.0',
      method: null,
    },
    {
      jsonrpc: '2.0',
      method: undefined,
    },
    {
      jsonrpc: '2.0',
      method: 1,
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      params: true,
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      params: false,
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      params: null,
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      params: 1,
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      params: '',
    },
  ],
};

export const JSON_RPC_REQUEST_FIXTURES = {
  valid: [
    {
      jsonrpc: '2.0',
      method: 'notify',
      id: 1,
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      id: '1',
      params: {
        foo: 'bar',
      },
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      id: 'foo',
      params: ['foo'],
    },
    {
      jsonrpc: '2.0',
      method: 'notify',
      id: null,
    },
  ],
  invalid: [
    {},
    [],
    true,
    false,
    null,
    undefined,
    1,
    'foo',
    {
      id: 1,
      jsonrpc: '1.0',
      method: 'notify',
    },
    {
      id: 1,
      jsonrpc: 2.0,
      method: 'notify',
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: {},
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: [],
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: true,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: false,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: null,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: undefined,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: 1,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'notify',
      params: true,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'notify',
      params: false,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'notify',
      params: null,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'notify',
      params: 1,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'notify',
      params: '',
    },
  ],
};

export const JSON_RPC_SUCCESS_FIXTURES = {
  valid: [
    {
      id: 1,
      jsonrpc: '2.0',
      result: 'foo',
    },
    {
      id: '1',
      jsonrpc: '2.0',
      result: {
        foo: 'bar',
      },
    },
    {
      id: 'foo',
      jsonrpc: '2.0',
      result: null,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      result: [
        {
          foo: 'bar',
        },
      ],
    },
  ],
  invalid: [
    {},
    [],
    true,
    false,
    null,
    undefined,
    1,
    'foo',
    {
      jsonrpc: '2.0',
      result: 'foo',
    },
    {
      id: 1,
      result: 'foo',
    },
    {
      id: 1,
      jsonrpc: '2.0',
    },
    {
      id: 1,
      jsonrpc: '1.0',
      result: 'foo',
    },
    {
      id: 1,
      jsonrpc: 2.0,
      result: 'foo',
    },
    {
      id: 1,
      jsonrpc: '2.0',
      result: undefined,
    },
    {
      id: {},
      jsonrpc: '2.0',
      result: 'foo',
    },
    {
      id: [],
      jsonrpc: '2.0',
      result: 'foo',
    },
    {
      id: true,
      jsonrpc: '2.0',
      result: 'foo',
    },
    {
      id: false,
      jsonrpc: '2.0',
      result: 'foo',
    },
    {
      id: undefined,
      jsonrpc: '2.0',
      result: 'foo',
    },
  ],
};

export const JSON_RPC_FAILURE_FIXTURES = {
  valid: [
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: '1',
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Internal error',
        data: {
          foo: 'bar',
        },
      },
    },
    {
      id: 'foo',
      jsonrpc: '2.0',
      error: {
        code: -32002,
        message: 'Internal error',
        data: ['foo'],
        stack: 'bar',
      },
    },
    {
      id: 'foo',
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
        data: 'foo',
      },
    },
    {
      id: 'foo',
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
        data: 1,
      },
    },
  ],
  invalid: [
    {},
    [],
    true,
    false,
    null,
    undefined,
    1,
    'foo',
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
    },
    {
      id: {},
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: [],
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: true,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: false,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: undefined,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '1.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: 2.0,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: {},
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: [],
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: true,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: false,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: null,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: undefined,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: [],
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {},
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: true,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: false,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: null,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: undefined,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: 'foo',
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: 1,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: {},
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: [],
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: true,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: false,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: null,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: undefined,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: 'foo',
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: {},
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: [],
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: true,
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: false,
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: null,
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: undefined,
      },
    },
  ],
};

export const JSON_RPC_ERROR_FIXTURES = {
  valid: JSON_RPC_FAILURE_FIXTURES.valid.map((fixture) => fixture.error),
  invalid: [
    {},
    [],
    true,
    false,
    null,
    undefined,
    1,
    'foo',
    {
      code: {},
      message: 'Internal error',
    },
    {
      code: [],
      message: 'Internal error',
    },
    {
      code: true,
      message: 'Internal error',
    },
    {
      code: false,
      message: 'Internal error',
    },
    {
      code: null,
      message: 'Internal error',
    },
    {
      code: undefined,
      message: 'Internal error',
    },
    {
      code: 'foo',
      message: 'Internal error',
    },
    {
      code: -32000,
      message: {},
    },
    {
      code: -32000,
      message: [],
    },
    {
      code: -32000,
      message: true,
    },
    {
      code: -32000,
      message: false,
    },
    {
      code: -32000,
      message: null,
    },
    {
      code: -32000,
      message: undefined,
    },
    {
      code: -32000.5,
      message: undefined,
    },
  ],
};

export const JSON_RPC_RESPONSE_FIXTURES = {
  valid: [
    ...JSON_RPC_SUCCESS_FIXTURES.valid,
    ...JSON_RPC_FAILURE_FIXTURES.valid,
  ],
  invalid: [
    ...JSON_RPC_SUCCESS_FIXTURES.invalid,
    ...JSON_RPC_FAILURE_FIXTURES.invalid,
  ],
};

export const JSON_RPC_PENDING_RESPONSE_FIXTURES = {
  valid: [
    ...JSON_RPC_SUCCESS_FIXTURES.valid,
    ...JSON_RPC_FAILURE_FIXTURES.valid,
    {
      id: 1,
      jsonrpc: '2.0',
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: undefined,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      result: undefined,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      result: undefined,
      error: undefined,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      result: {
        foo: 'bar',
      },
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
  ],
  invalid: [
    {},
    [],
    true,
    false,
    null,
    undefined,
    1,
    'foo',
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: {},
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: [],
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: true,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: false,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: undefined,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '1.0',
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: 2.0,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: {},
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: [],
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: true,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: false,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: null,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: undefined,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: [],
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {},
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: true,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: false,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: null,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: 'foo',
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: 1,
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: {},
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: [],
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: true,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: false,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: null,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: undefined,
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: 'foo',
        message: 'Internal error',
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: {},
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: [],
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: true,
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: false,
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: null,
      },
    },
    {
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: undefined,
      },
    },
  ],
};

/* eslint-disable @typescript-eslint/naming-convention */
export const CHARACTER_MAP = {
  '"': '\\"',
  '\\': '\\\\',
  '\x00': '\\u0000',
  '\x01': '\\u0001',
  '\x02': '\\u0002',
  '\x03': '\\u0003',
  '\x04': '\\u0004',
  '\x05': '\\u0005',
  '\x06': '\\u0006',
  '\x07': '\\u0007',
  '\x08': '\\b',
  '\x09': '\\t',
  '\x0A': '\\n',
  '\x0B': '\\u000b',
  '\x0C': '\\f',
  '\x0D': '\\r',
  '\x0E': '\\u000e',
  '\x0F': '\\u000f',
  '\x10': '\\u0010',
  '\x11': '\\u0011',
  '\x12': '\\u0012',
  '\x13': '\\u0013',
  '\x14': '\\u0014',
  '\x15': '\\u0015',
  '\x16': '\\u0016',
  '\x17': '\\u0017',
  '\x18': '\\u0018',
  '\x19': '\\u0019',
  '\x1A': '\\u001a',
  '\x1B': '\\u001b',
  '\x1C': '\\u001c',
  '\x1D': '\\u001d',
  '\x1E': '\\u001e',
  '\x1F': '\\u001f',
};
/* eslint-enable @typescript-eslint/naming-convention */

const DIRECT_CIRCULAR_REFERENCE_ARRAY: unknown[] = [];
DIRECT_CIRCULAR_REFERENCE_ARRAY.push(DIRECT_CIRCULAR_REFERENCE_ARRAY);

const INDIRECT_CIRCULAR_REFERENCE_ARRAY: unknown[] = [];
INDIRECT_CIRCULAR_REFERENCE_ARRAY.push([[INDIRECT_CIRCULAR_REFERENCE_ARRAY]]);

const DIRECT_CIRCULAR_REFERENCE_OBJECT: Record<string, unknown> = {};
DIRECT_CIRCULAR_REFERENCE_OBJECT.prop = DIRECT_CIRCULAR_REFERENCE_OBJECT;

const INDIRECT_CIRCULAR_REFERENCE_OBJECT: Record<string, unknown> = {
  p1: {
    p2: {
      get p3() {
        return INDIRECT_CIRCULAR_REFERENCE_OBJECT;
      },
    },
  },
};

const TO_JSON_CIRCULAR_REFERENCE = {
  toJSON() {
    return {};
  },
};

const CIRCULAR_REFERENCE = { prop: TO_JSON_CIRCULAR_REFERENCE };
TO_JSON_CIRCULAR_REFERENCE.toJSON = function () {
  return CIRCULAR_REFERENCE;
};

const DUPLICATE_DATE = new Date();
const DUPLICATE_OBJECT = {
  value: 'foo',
};

const DUPLICATE_REFERENCE = {
  a: DUPLICATE_DATE,
  b: DUPLICATE_DATE,
  c: DUPLICATE_DATE,
  testOne: DUPLICATE_OBJECT,
  testTwo: DUPLICATE_OBJECT,
  testThree: {
    nestedObjectTest: {
      multipleTimes: {
        valueOne: DUPLICATE_OBJECT,
        valueTwo: DUPLICATE_OBJECT,
        valueThree: DUPLICATE_OBJECT,
        valueFour: DUPLICATE_OBJECT,
        valueFive: DUPLICATE_DATE,
        valueSix: {},
      },
    },
  },
  testFour: {},
  testFive: {
    something: null,
    somethingElse: null,
    anotherValue: null,
    somethingAgain: DUPLICATE_OBJECT,
    anotherOne: {
      nested: {
        multipleTimes: {
          valueOne: DUPLICATE_OBJECT,
        },
      },
    },
  },
};

const REVOKED_ARRAY_PROXY = Proxy.revocable([], {});
REVOKED_ARRAY_PROXY.revoke();

const REVOKED_OBJECT_PROXY = Proxy.revocable({}, {});
REVOKED_OBJECT_PROXY.revoke();

export const JSON_VALIDATION_FIXTURES = [
  {
    value: {
      a: 'bc',
    },
    valid: true,
    size: 10,
  },
  {
    value: {
      a: 1234,
    },
    valid: true,
    size: 10,
  },
  {
    value: {
      a: 'bcšečf',
    },
    valid: true,
    size: 16,
  },
  {
    value: [
      -5e-11, 5e-9, 0.000000000001, -0.00000000009, 100000.00000008, -100.88888,
      0.333, 1000000000000,
    ],
    valid: true,
    size: 73,
  },
  {
    value: {
      data: {
        account: {
          /* eslint-disable @typescript-eslint/naming-convention */
          __typename: 'Account',
          registrations: [
            {
              __typename: 'Registration',
              domain: {
                __typename: 'Domain',
                isMigrated: true,
                labelName: 'mycrypto',
                labelhash:
                  '0x9a781ca0d227debc3ee76d547c960b0803a6c9f58c6d3b4722f12ede7e6ef7c9',
                name: 'mycrypto.eth',
                parent: { __typename: 'Domain', name: 'eth' },
              },
              expiryDate: '1754111315',
            },
          ],
          /* eslint-enable @typescript-eslint/naming-convention */
        },
        moreComplexity: {
          numbers: [
            -5e-11, 5e-9, 0.000000000001, -0.00000000009, 100000.00000008,
            -100.88888, 0.333, 1000000000000,
          ],
          moreNestedObjects: {
            nestedAgain: {
              nestedAgain: {
                andAgain: {
                  andAgain: {
                    value: true,
                    again: {
                      value: false,
                    },
                  },
                },
              },
            },
          },
          differentEncodings: {
            ascii:
              '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
            utf8: 'šđćčžЀЂЇЄЖФћΣΩδλ',
            mixed: 'ABCDEFGHIJ KLMNOPQRST UVWXYZšđćč žЀЂЇЄЖФћΣΩδλ',
            specialCharacters: '"\\\n\r\t',
            stringWithSpecialEscapedCharacters:
              "this\nis\nsome\"'string\r\nwith\tspecial\\escaped\tcharacters'",
          },
          specialObjectsTypesAndValues: {
            t: [true, true, true],
            f: [false, false, false],
            nulls: [null, null, null],
            undef: null,
            mixed: [
              null,
              null,
              null,
              null,
              null,
              true,
              null,
              false,
              null,
              null,
            ],
            inObject: {
              valueOne: null,
              valueTwo: null,
              t: true,
              f: false,
            },
            dates: {
              someDate: new Date(),
              someOther: new Date(2022, 0, 2, 15, 4, 5),
              invalidDate: new Date('bad-date-format'),
            },
          },
        },
      },
    },
    valid: true,
    size: 1288,
  },
  {
    value: {
      dates: {
        someDate: new Date(),
        someOther: new Date(2022, 0, 2, 15, 4, 5),
        invalidDate: new Date('bad-date-format'),
      },
    },
    valid: true,
    size: 107,
  },
  {
    value: ['foo', 'bar', null, ['foo', 'bar', null]],
    valid: true,
    size: 37,
  },
  {
    value: null,
    valid: true,
    size: 4,
  },
  {
    value: true,
    valid: true,
    size: 4,
  },
  {
    value: false,
    valid: true,
    size: 5,
  },
  {
    value: 'str',
    valid: true,
    size: 5,
  },
  {
    value: 123,
    valid: true,
    size: 3,
  },

  {
    value: {
      a: undefined,
    },
    valid: false,
    size: 0,
  },
  {
    value: {
      levelOne: {
        levelTwo: {
          levelThree: {
            levelFour: {
              levelFive: () => {
                return 'anything';
              },
            },
          },
        },
      },
    },
    valid: false,
    size: 0,
  },
  {
    value: {
      mySymbol: Symbol('MySymbol'),
    },
    valid: false,
    size: 0,
  },
  {
    value: [
      function () {
        return 'whatever';
      },
    ],
    valid: false,
    size: 0,
  },

  // These tests are taken from ECMA TC39 (test262) test scenarios used for
  // testing the `JSON.stringify` function.
  // https://github.com/tc39/test262/tree/main/test/built-ins/JSON/stringify
  /* eslint-disable no-new-wrappers */
  {
    value: new Boolean(true),
    valid: true,
    size: 4,
  },
  {
    value: { key: new Boolean(false) },
    valid: true,
    size: 13,
  },
  {
    value: new Boolean(false),
    valid: true,
    size: 5,
  },
  {
    value: new Number(3.14),
    valid: true,
    size: 4,
  },
  {
    value: new String('str'),
    valid: true,
    size: 5,
  },
  /* eslint-enable no-new-wrappers */
  {
    value: -0,
    valid: true,
    size: 1,
  },
  {
    value: ['-0', 0, -0],
    valid: true,
    size: 10,
  },
  {
    value: { key: -0 },
    valid: true,
    size: 9,
  },
  {
    value: Infinity,
    valid: false,
    size: 0,
  },
  {
    value: { key: -Infinity },
    valid: false,
    size: 0,
  },
  {
    value: CHARACTER_MAP,
    valid: true,
    size: 593,
  },
  {
    value: Object.keys(CHARACTER_MAP).join(''),
    valid: true,
    size: 178,
  },
  {
    value: Object.keys(CHARACTER_MAP).reverse().join(''),
    valid: true,
    size: 178,
  },
  {
    value: Object.values(CHARACTER_MAP).join(''),
    valid: true,
    size: 214,
  },
  {
    value: Object.values(CHARACTER_MAP).reverse().join(''),
    valid: true,
    size: 214,
  },
  {
    value: {
      toJSON: null,
    },
    valid: true,
    size: 15,
  },
  {
    value: { toJSON: false },
    valid: true,
    size: 16,
  },
  {
    value: { toJSON: [] },
    valid: true,
    size: 13,
  },
  {
    value: DUPLICATE_REFERENCE,
    valid: true,
    size: 552,
  },
  {
    value: { a: { b: REVOKED_OBJECT_PROXY.proxy } },
    valid: false,
    size: 0,
  },
  {
    value: {
      get key() {
        throw new Error();
      },
    },
    valid: false,
    size: 0,
  },
  {
    value: undefined,
    valid: false,
    size: 0,
  },
  {
    value: DIRECT_CIRCULAR_REFERENCE_ARRAY,
    valid: false,
    size: 0,
  },
  {
    value: INDIRECT_CIRCULAR_REFERENCE_ARRAY,
    valid: false,
    size: 0,
  },
  {
    value: DIRECT_CIRCULAR_REFERENCE_OBJECT,
    valid: false,
    size: 0,
  },
  {
    value: INDIRECT_CIRCULAR_REFERENCE_OBJECT,
    valid: false,
    size: 0,
  },
];
