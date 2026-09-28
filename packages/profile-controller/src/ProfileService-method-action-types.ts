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
 * @throws {StructError} If params or the response do not match the expected shape.
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
 * @throws {StructError} If params or the response do not match the expected shape.
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
 * @throws {StructError} If params or the response do not match the expected shape.
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
 * @throws {StructError} If the profileId is not a string.
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
 * @throws {StructError} If the username or response do not match the expected shape.
 */
export type ProfileServiceCheckUsernameAvailabilityAction = {
  type: `ProfileService:checkUsernameAvailability`;
  handler: ProfileService['checkUsernameAvailability'];
};

/**
 * Fetches the X OAuth PKCE authorization URL and its associated state parameter.
 *
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
 *
 * @param params - The OAuth callback code and state from the X redirect.
 * @returns The linked X account data.
 * @throws {HttpError} If the API returns a non-2xx response.
 * @throws {StructError} If params or the response do not match the expected shape.
 */
export type ProfileServiceConnectXAction = {
  type: `ProfileService:connectX`;
  handler: ProfileService['connectX'];
};

/**
 * Fetches the X account currently linked to the authenticated profile.
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
  | ProfileServiceGetXAccountAction;
