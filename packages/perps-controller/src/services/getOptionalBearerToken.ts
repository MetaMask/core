import type { PerpsControllerMessengerBase } from '../types/messenger.js';
import { isMissingActionHandlerError } from './missingActionHandler.js';

/**
 * Get the bearer token through the authentication controller.
 *
 * @param messenger - Controller messenger.
 * @returns The bearer token, or undefined when the host does not provide
 * `AuthenticationController:getBearerToken`. Reporting is optional: a host
 * without authentication skips it rather than logging and retrying a call
 * that can never succeed.
 */
export async function getOptionalBearerToken(
  messenger: PerpsControllerMessengerBase,
): Promise<string | undefined> {
  try {
    return await messenger.call('AuthenticationController:getBearerToken');
  } catch (error) {
    if (
      isMissingActionHandlerError(
        error,
        'AuthenticationController:getBearerToken',
      )
    ) {
      return undefined;
    }
    throw error;
  }
}
