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
 * Completes the X OAuth flow, updates xProfile and profile in state, and
 * returns the connect result. The backend creates the profile if it does
 * not exist yet (username derived from the X handle), so the profile is
 * always fetched from the backend after a successful connect.
 *
 * The linked X profile is persisted in state immediately after the connect
 * succeeds. If the follow-up profile fetch fails, the X link remains
 * persisted and a clear error is thrown — the profile in state may then be
 * stale until the next successful fetch.
 *
 * @param params - The parameters for the X OAuth flow.
 * @param params.code - The OAuth authorization code from the X redirect.
 * @param params.state - The state parameter returned by the X redirect.
 * @param params.profileId - The canonical profile ID the X account is
 * linked to (sourced from the auth session).
 * @returns The refreshed profile, the linked X profile, and whether the
 * backend created the profile during the connect.
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
 * Initiates the X OAuth flow by fetching the authorization URL from the backend.
 * The profile is resolved server-side from the verified bearer token.
 * Returns session data for the caller to use; nothing is stored in controller state.
 *
 * @param params - Optional parameters for initiating the X OAuth flow.
 * @param params.linkedAddress - Optional CAIP-10 account ID to link to the
 * profile when it does not exist yet.
 * @returns The X authorization URL and state parameter.
 */
export type ProfileControllerStartXConnectAction = {
  type: `ProfileController:startXConnect`;
  handler: ProfileController['startXConnect'];
};

/**
 * Disconnects the X account linked to the given profile, clears xProfile from
 * state, and marks the profile in state as no longer connected to X.
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
  | ProfileControllerStartXConnectAction
  | ProfileControllerDisconnectXAction;
