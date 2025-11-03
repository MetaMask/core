import type { GatorPermissionsMap } from './types';
import {
  deserializeGatorPermissionsMap,
  serializeGatorPermissionsMap,
} from './utils';

const defaultGatorPermissionsMap: GatorPermissionsMap = {
  'native-token-stream': {},
  'native-token-periodic': {},
  'erc20-token-stream': {},
  'erc20-token-periodic': {},
  other: {},
};

describe('utils - serializeGatorPermissionsMap() tests', () => {
  it('serializes a gator permissions list to a string', () => {
    const serializedGatorPermissionsMap = serializeGatorPermissionsMap(
      defaultGatorPermissionsMap,
    );

    expect(serializedGatorPermissionsMap).toStrictEqual(
      JSON.stringify(defaultGatorPermissionsMap),
    );
  });

  it('throws an error when serialization fails', () => {
    // Create a valid GatorPermissionsMap structure but with circular reference
    const gatorPermissionsMap = {
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
      'erc20-token-periodic': {},
      other: {},
    };

    // Add circular reference to cause JSON.stringify to fail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gatorPermissionsMap as any).circular = gatorPermissionsMap;

    expect(() => {
      serializeGatorPermissionsMap(gatorPermissionsMap);
    }).toThrow('Failed to serialize gator permissions map');
  });
});

describe('utils - deserializeGatorPermissionsMap() tests', () => {
  it('deserializes a gator permissions list from a string', () => {
    const serializedGatorPermissionsMap = serializeGatorPermissionsMap(
      defaultGatorPermissionsMap,
    );

    const deserializedGatorPermissionsMap = deserializeGatorPermissionsMap(
      serializedGatorPermissionsMap,
    );

    expect(deserializedGatorPermissionsMap).toStrictEqual(
      defaultGatorPermissionsMap,
    );
  });

  it('throws an error when deserialization fails', () => {
    const invalidJson = '{"invalid": json}';

    expect(() => {
      deserializeGatorPermissionsMap(invalidJson);
    }).toThrow('Failed to deserialize gator permissions map');
  });
});
