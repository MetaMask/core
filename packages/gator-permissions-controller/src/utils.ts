import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from './logger';
import type { GatorPermissionsList } from './types';

const log = createModuleLogger(projectLogger, 'utils');

/**
 * Serializes a gator permissions list to a string.
 *
 * @param gatorPermissionsList - The gator permissions list to serialize.
 * @returns The serialized gator permissions list.
 */
export function serializeGatorPermissionsList(
  gatorPermissionsList: GatorPermissionsList,
): string {
  try {
    return JSON.stringify(gatorPermissionsList);
  } catch (error) {
    log('Failed to serialize gator permissions list', error);
    throw error;
  }
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
  try {
    return JSON.parse(gatorPermissionsList);
  } catch (error) {
    log('Failed to deserialize gator permissions list', error);
    throw error;
  }
}
