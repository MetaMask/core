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
});
