import type { GatorPermissionsList } from './types';

/**
 * Serializes a gator permissions list to a string.
 *
 * @param gatorPermissionsList - The gator permissions list to serialize.
 * @returns The serialized gator permissions list.
 */
export function serializeGatorPermissionsList(
  gatorPermissionsList: GatorPermissionsList,
): string {
  return JSON.stringify(gatorPermissionsList);
}

/**
 * Deserializes a gator permissions list from a string.
 *
 * @param gatorPermissionsList - The gator permissions list to deserialize.
 * @returns The deserialized gator permissions list.
 */
export function deserializeGatorPermissionsList(
  gatorPermissionsList: string,
): GatorPermissionsList {
  return JSON.parse(gatorPermissionsList);
}