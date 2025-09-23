import { GatorPermissionsMapSerializationError } from './errors';
import { utilsLog } from './logger';
import type { GatorPermissionsMap } from './types';

/**
 * Serializes a gator permissions map to a string.
 *
 * @param gatorPermissionsMap - The gator permissions map to serialize.
 * @returns The serialized gator permissions map.
 */
export function serializeGatorPermissionsMap(
  gatorPermissionsMap: GatorPermissionsMap,
): string {
  try {
    return JSON.stringify(gatorPermissionsMap);
  } catch (error) {
    utilsLog('Failed to serialize gator permissions map', error);
    throw new GatorPermissionsMapSerializationError({
      cause: error as Error,
      message: 'Failed to serialize gator permissions map',
      data: gatorPermissionsMap,
    });
  }
}

/**
 * Deserializes a gator permissions map from a string.
 *
 * @param gatorPermissionsMap - The gator permissions map to deserialize.
 * @returns The deserialized gator permissions map.
 */
export function deserializeGatorPermissionsMap(
  gatorPermissionsMap: string,
): GatorPermissionsMap {
  try {
    return JSON.parse(gatorPermissionsMap);
  } catch (error) {
    utilsLog('Failed to deserialize gator permissions map', error);
    throw new GatorPermissionsMapSerializationError({
      cause: error as Error,
      message: 'Failed to deserialize gator permissions map',
      data: gatorPermissionsMap,
    });
  }
}
