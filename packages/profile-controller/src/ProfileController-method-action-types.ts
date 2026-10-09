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
 * If the user had previously connected X, also updates xProfile in state.
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
 * Completes the X OAuth PKCE flow, updates xProfile in state, and returns the X profile.
 *
 * @param params - The parameters for the X OAuth PKCE flow.
 * @param params.code - The OAuth authorization code from the X redirect.
 * @param params.state - The state parameter returned by the X redirect.
 * @returns The linked X profile.
 */
export type ProfileControllerConnectXAction = {
  type: `ProfileController:connectX`;
  handler: ProfileController['connectX'];
};

/**
 * Fetches the X account linked to the current profile, updates state, and returns the X profile.
 *
 * @returns The linked X profile.
 */
export type ProfileControllerFetchAndUpdateXAccountAction = {
  type: `ProfileController:fetchAndUpdateXAccount`;
  handler: ProfileController['fetchAndUpdateXAccount'];
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
  | ProfileControllerFetchAndUpdateXAccountAction;
