export const JSON_FIXTURES = {
  valid: [
    null,
    { a: 1 },
    ['a', 2, null],
    [{ a: null, b: 2, c: [{ foo: 'bar' }] }],
  ],
  invalid: [
    undefined,
    Symbol('bar'),
    Promise.resolve(),
    () => 'foo',
    [{ a: undefined }],
  ],
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

export const COMPLEX_OBJECT = {
  data: {
    account: {
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
        undef: undefined,
        mixed: [
          null,
          undefined,
          null,
          undefined,
          null,
          true,
          null,
          false,
          null,
          undefined,
        ],
        inObject: {
          valueOne: null,
          valueTwo: undefined,
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
};

export const NON_SERIALIZABLE_NESTED_OBJECT = {
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
};

export const ARRAY_OF_DIFFRENT_KINDS_OF_NUMBERS = [
  -5e-11, 5e-9, 0.000000000001, -0.00000000009, 100000.00000008, -100.88888,
  0.333, 1000000000000,
];

export const ARRAY_OF_MIXED_SPECIAL_OBJECTS = [
  null,
  undefined,
  null,
  undefined,
  undefined,
  undefined,
  null,
  null,
  null,
  undefined,
];

export const OBJECT_MIXED_WITH_UNDEFINED_VALUES = {
  a: undefined,
  b: 'b',
  c: undefined,
  d: 'd',
  e: undefined,
  f: 'f',
};
