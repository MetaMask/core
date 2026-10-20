/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ProfileController } from './ProfileController.js';

/**
 * Returns the current MetaMask profile from state, or undefined if none has been created.
 *
 * @returns The MetaMask profile, or undefined.
 */
export type ProfileControllerGetProfileAction = {
  type: `ProfileController:getProfile`;
  handler: ProfileController['getProfile'];
};

/**
 * Returns the currently linked X profile from state, or undefined if none has been connected.
 *
 * @returns The X profile, or undefined.
 */
export type ProfileControllerGetXProfileAction = {
  type: `ProfileController:getXProfile`;
  handler: ProfileController['getXProfile'];
};

/**
 * Creates a new MetaMask profile, updates state, and returns the created profile.
 *
 * @param params - The profile creation parameters.
 * @returns The created MetaMask profile.
 */
export type ProfileControllerCreateProfileAction = {
  type: `ProfileController:createProfile`;
  handler: ProfileController['createProfile'];
};

/**
 * Fully replaces the current profile and updates state.
 *
 * @param input - The replacement profile data.
 * @throws If no profile has been created yet.
 */
export type ProfileControllerReplaceProfileAction = {
  type: `ProfileController:replaceProfile`;
  handler: ProfileController['replaceProfile'];
};

/**
 * Partially updates the current profile and updates state.
 *
 * @param input - The fields to update.
 * @throws If no profile has been created yet.
 */
export type ProfileControllerUpdateProfileAction = {
  type: `ProfileController:updateProfile`;
  handler: ProfileController['updateProfile'];
};

/**
 * Deletes the current profile and resets state, including clearing any linked X profile.
 *
 * @throws If no profile has been created yet.
 */
export type ProfileControllerDeleteProfileAction = {
  type: `ProfileController:deleteProfile`;
  handler: ProfileController['deleteProfile'];
};

/**
 * Checks whether a username is available.
 *
 * @param username - The username to check.
 * @returns Availability details including validity and normalized form.
 */
export type ProfileControllerCheckUsernameAvailabilityAction = {
  type: `ProfileController:checkUsernameAvailability`;
  handler: ProfileController['checkUsernameAvailability'];
};

/**
 * Completes the X OAuth flow for the profile in state and returns the
 * linked X profile. Updates controller state with the linked X profile.
 *
 * @param params - The parameters for the X OAuth flow.
 * @param params.code - The OAuth authorization code from the X redirect.
 * @param params.state - The state parameter returned by the X redirect.
 * @returns The linked X profile.
 */
export type ProfileControllerConnectXAction = {
  type: `ProfileController:connectX`;
  handler: ProfileController['connectX'];
};

/**
 * Fetches the X account linked to the authenticated profile, updates state,
 * and returns the X profile. The profile is resolved server-side from the
 * verified bearer token.
 *
 * @returns The linked X profile.
 */
export type ProfileControllerFetchAndUpdateXAccountAction = {
  type: `ProfileController:fetchAndUpdateXAccount`;
  handler: ProfileController['fetchAndUpdateXAccount'];
};

/**
 * Fetches a profile by its identifier and updates state.
 *
 * @param profileId - The profile identifier to fetch.
 * @returns The fetched profile.
 */
export type ProfileControllerFetchAndUpdateProfileAction = {
  type: `ProfileController:fetchAndUpdateProfile`;
  handler: ProfileController['fetchAndUpdateProfile'];
};

/**
 * Initiates the X OAuth flow by fetching the authorization URL from the backend.
 * The profile is resolved server-side from the verified bearer token.
 * Returns session data for the caller to use; nothing is stored in controller state.
 *
 * @returns The X authorization URL and state parameter.
 */
export type ProfileControllerGetXAuthorizationUrlAction = {
  type: `ProfileController:getXAuthorizationUrl`;
  handler: ProfileController['getXAuthorizationUrl'];
};

/**
 * Disconnects the X account linked to the given profile. If the given
 * profile matches the profile in state, clears `xProfile` from state and
 * marks the profile in state as no longer connected to X.
 *
 * @param profileId - The ID of the profile to disconnect the linked X account
 * from (sourced from {@link getProfile}).
 */
export type ProfileControllerDisconnectXAction = {
  type: `ProfileController:disconnectX`;
  handler: ProfileController['disconnectX'];
};

/**
 * Union of all ProfileController action types.
 */
export type ProfileControllerMethodActions =
  | ProfileControllerGetProfileAction
  | ProfileControllerGetXProfileAction
  | ProfileControllerCreateProfileAction
  | ProfileControllerReplaceProfileAction
  | ProfileControllerUpdateProfileAction
  | ProfileControllerDeleteProfileAction
  | ProfileControllerCheckUsernameAvailabilityAction
  | ProfileControllerConnectXAction
  | ProfileControllerFetchAndUpdateXAccountAction
  | ProfileControllerFetchAndUpdateProfileAction
  | ProfileControllerGetXAuthorizationUrlAction
  | ProfileControllerDisconnectXAction;
