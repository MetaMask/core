export const complexObject = {
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
        -5e-11,
        5e-9,
        0.000000000001,
        -0.00000000009,
        100000.00000008,
        -100.88888,
        0.333,
        1000000000000,
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

export const nonSerializableNestedObject = {
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

export const arrayOfDifferentKindsOfNumbers = [
  -5e-11,
  5e-9,
  0.000000000001,
  -0.00000000009,
  100000.00000008,
  -100.88888,
  0.333,
  1000000000000,
];

export const arrayOfMixedSpecialObjects = [
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

export const objectMixedWithUndefinedValues = {
  a: undefined,
  b: 'b',
  c: undefined,
  d: 'd',
  e: undefined,
  f: 'f',
};
