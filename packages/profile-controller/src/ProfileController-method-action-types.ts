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
export type ProfileControllerGetMetaMaskProfileAction = {
  type: `ProfileController:getMetaMaskProfile`;
  handler: ProfileController['getMetaMaskProfile'];
};

/**
 * Returns the currently linked X profile from state, or undefined if none has been connected.
 *
 * @returns The X profile, or undefined.
 */
export type ProfileControllerGetXprofileAction = {
  type: `ProfileController:getXprofile`;
  handler: ProfileController['getXprofile'];
};

/**
 * Creates a new MetaMask profile and updates state.
 *
 * @param params - The profile creation parameters.
 * @returns The created MetaMask profile.
 */
export type ProfileControllerCreateProfileAction = {
  type: `ProfileController:createProfile`;
  handler: ProfileController['createProfile'];
};

/**
 * Fully replaces an existing profile and updates state.
 *
 * @param profileId - The profile identifier (the canonical profile ID).
 * @param input - The replacement profile data.
 */
export type ProfileControllerReplaceProfileAction = {
  type: `ProfileController:replaceProfile`;
  handler: ProfileController['replaceProfile'];
};

/**
 * Partially updates an existing profile and updates state.
 *
 * @param profileId - The profile identifier (the canonical profile ID).
 * @param input - The fields to update.
 */
export type ProfileControllerUpdateProfileAction = {
  type: `ProfileController:updateProfile`;
  handler: ProfileController['updateProfile'];
};

/**
 * Deletes a profile and resets state, including clearing any linked X profile.
 *
 * @param profileId - The profile identifier (the canonical profile ID) to delete.
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
 * Fetches the X OAuth authorization URL to begin the PKCE flow.
 *
 * @returns An object containing the authorization URL and its associated state token.
 */
export type ProfileControllerGetXAuthUrlAction = {
  type: `ProfileController:getXAuthUrl`;
  handler: ProfileController['getXAuthUrl'];
};

/**
 * Completes the X OAuth PKCE flow and updates the X profile in state.
 *
 * @param params - The parameters for the X OA  uth PKCE flow.
 * @param params.code - The OAuth authorization code from the X redirect.
 * @param params.state - The state parameter returned by the X redirect.
 * @returns The X profile.
 */
export type ProfileControllerConnectXAction = {
  type: `ProfileController:connectX`;
  handler: ProfileController['connectX'];
};

/** Fetches the X account linked to the current profile and updates state. */
export type ProfileControllerFetchAndUpdateXAccountAction = {
  type: `ProfileController:fetchAndUpdateXAccount`;
  handler: ProfileController['fetchAndUpdateXAccount'];
};

/**
 * Union of all ProfileController action types.
 */
export type ProfileControllerMethodActions =
  | ProfileControllerGetMetaMaskProfileAction
  | ProfileControllerGetXprofileAction
  | ProfileControllerCreateProfileAction
  | ProfileControllerReplaceProfileAction
  | ProfileControllerUpdateProfileAction
  | ProfileControllerDeleteProfileAction
  | ProfileControllerCheckUsernameAvailabilityAction
  | ProfileControllerGetXAuthUrlAction
  | ProfileControllerConnectXAction
  | ProfileControllerFetchAndUpdateXAccountAction;
