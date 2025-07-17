import {
  deserializeGatorPermissionsList,
  serializeGatorPermissionsList,
} from './utils';

describe('utils - serializeGatorPermissionsList() tests', () => {
  it('serializes a gator permissions list to a string', () => {
    const gatorPermissionsList = {
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
    };

    const serializedGatorPermissionsList =
      serializeGatorPermissionsList(gatorPermissionsList);

    expect(serializedGatorPermissionsList).toStrictEqual(
      JSON.stringify(gatorPermissionsList),
    );
  });

  it('throws an error when serialization fails', () => {
    // Create a valid GatorPermissionsList structure but with circular reference
    const gatorPermissionsList = {
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
    };

    // Add circular reference to cause JSON.stringify to fail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gatorPermissionsList as any).circular = gatorPermissionsList;

    expect(() => {
      serializeGatorPermissionsList(gatorPermissionsList);
    }).toThrow('Converting circular structure to JSON');
  });
});

describe('utils - deserializeGatorPermissionsList() tests', () => {
  it('deserializes a gator permissions list from a string', () => {
    const gatorPermissionsList = {
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
    };

    const serializedGatorPermissionsList =
      serializeGatorPermissionsList(gatorPermissionsList);

    const deserializedGatorPermissionsList = deserializeGatorPermissionsList(
      serializedGatorPermissionsList,
    );

    expect(deserializedGatorPermissionsList).toStrictEqual(
      gatorPermissionsList,
    );
  });

  it('throws an error when deserialization fails', () => {
    const invalidJson = '{"invalid": json}';

    expect(() => {
      deserializeGatorPermissionsList(invalidJson);
    }).toThrow('Unexpected token');
  });
});
