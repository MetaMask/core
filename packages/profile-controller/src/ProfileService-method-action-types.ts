/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ProfileService } from './ProfileService.js';

/**
 * Fetches a profile by its identifier.
 *
 * @param profileId - The profile identifier to fetch.
 * @returns The profile data from the API.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If the response does not match the expected shape.
 */
export type ProfileServiceGetProfileAction = {
  type: `ProfileService:getProfile`;
  handler: ProfileService['getProfile'];
};

/**
 * Creates a new MetaMask profile.
 *
 * @param params - The profile creation parameters.
 * @returns The created profile data.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If the response do not match the expected shape.
 */
export type ProfileServiceCreateProfileAction = {
  type: `ProfileService:createProfile`;
  handler: ProfileService['createProfile'];
};

/**
 * Fully replaces an existing profile (PUT).
 *
 * @param profileId - The identifier of the profile to replace.
 * @param params - The replacement profile data.
 * @returns The updated profile data.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If the response do not match the expected shape.
 */
export type ProfileServiceReplaceProfileAction = {
  type: `ProfileService:replaceProfile`;
  handler: ProfileService['replaceProfile'];
};

/**
 * Partially updates an existing profile (PATCH).
 *
 * @param profileId - The identifier of the profile to update.
 * @param params - The fields to update.
 * @returns The updated profile data.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If the response do not match the expected shape.
 */
export type ProfileServiceUpdateProfileAction = {
  type: `ProfileService:updateProfile`;
  handler: ProfileService['updateProfile'];
};

/**
 * Deletes a profile by its identifier.
 *
 * @param profileId - The identifier of the profile to delete.
 * @returns The result of the mutation.
 * @throws {HttpError} If the API returns a non-2xx response.
 */
export type ProfileServiceDeleteProfileAction = {
  type: `ProfileService:deleteProfile`;
  handler: ProfileService['deleteProfile'];
};

/**
 * Checks whether a username is available.
 *
 * @param username - The username to check.
 * @returns Availability details including validity and normalized form.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If the response does not match the expected shape.
 */
export type ProfileServiceCheckUsernameAvailabilityAction = {
  type: `ProfileService:checkUsernameAvailability`;
  handler: ProfileService['checkUsernameAvailability'];
};

/**
 * Fetches the X OAuth PKCE authorization URL and its associated state parameter.
 * The profile is resolved server-side from the verified bearer token.
 *
 * @param linkedAddress - Optional CAIP-10 account ID to link to the profile
 * when it does not exist yet; sent as the `linked_address` query parameter.
 * @returns An object containing the authorization URL and the state token.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If the response does not match the expected shape.
 */
export type ProfileServiceGetXAuthUrlAction = {
  type: `ProfileService:getXAuthUrl`;
  handler: ProfileService['getXAuthUrl'];
};

/**
 * Completes the X OAuth PKCE flow and links the X account to the profile.
 * The backend creates the profile if it does not exist yet (username derived
 * from the X handle) and reports that via `profile_created`.
 *
 * @param params - The OAuth callback code and state from the X redirect.
 * @returns The linked X account data, plus `profile_created` when the
 * backend created the profile during the connect.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If the response does not match the expected shape.
 */
export type ProfileServiceConnectXAction = {
  type: `ProfileService:connectX`;
  handler: ProfileService['connectX'];
};

/**
 * Fetches the X account currently linked to the authenticated profile.
 * The profile is resolved server-side from the verified bearer token.
 *
 * @returns The linked X account data.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If the response does not match the expected shape.
 */
export type ProfileServiceGetXAccountAction = {
  type: `ProfileService:getXAccount`;
  handler: ProfileService['getXAccount'];
};

/**
 * Disconnects the X account linked to the given profile.
 * A `404` response is treated as success (the X account is already
 * disconnected, or the profile is unknown), making the operation idempotent.
 *
 * @param profileId - The ID of the profile to disconnect the linked X account from.
 * @returns The result of the mutation.
 * @throws {HttpError} If the API returns a non-2xx response other than `404`.
 */
export type ProfileServiceDisconnectXAction = {
  type: `ProfileService:disconnectX`;
  handler: ProfileService['disconnectX'];
};

/**
 * Union of all ProfileService action types.
 */
export type ProfileServiceMethodActions =
  | ProfileServiceGetProfileAction
  | ProfileServiceCreateProfileAction
  | ProfileServiceReplaceProfileAction
  | ProfileServiceUpdateProfileAction
  | ProfileServiceDeleteProfileAction
  | ProfileServiceCheckUsernameAvailabilityAction
  | ProfileServiceGetXAuthUrlAction
  | ProfileServiceConnectXAction
  | ProfileServiceGetXAccountAction
  | ProfileServiceDisconnectXAction;
