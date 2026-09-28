/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ProfileController } from './ProfileController';

export type ProfileControllerGetMetaMaskProfileAction = {
  type: `ProfileController:getMetaMaskProfile`;
  handler: ProfileController['getMetaMaskProfile'];
};

export type ProfileControllerGetXprofileAction = {
  type: `ProfileController:getXprofile`;
  handler: ProfileController['getXprofile'];
};

export type ProfileControllerCreateProfileAction = {
  type: `ProfileController:createProfile`;
  handler: ProfileController['createProfile'];
};

export type ProfileControllerReplaceProfileAction = {
  type: `ProfileController:replaceProfile`;
  handler: ProfileController['replaceProfile'];
};

export type ProfileControllerUpdateProfileAction = {
  type: `ProfileController:updateProfile`;
  handler: ProfileController['updateProfile'];
};

export type ProfileControllerDeleteProfileAction = {
  type: `ProfileController:deleteProfile`;
  handler: ProfileController['deleteProfile'];
};

export type ProfileControllerCheckUsernameAvailabilityAction = {
  type: `ProfileController:checkUsernameAvailability`;
  handler: ProfileController['checkUsernameAvailability'];
};

export type ProfileControllerGetXAuthUrlAction = {
  type: `ProfileController:getXAuthUrl`;
  handler: ProfileController['getXAuthUrl'];
};

export type ProfileControllerConnectXAction = {
  type: `ProfileController:connectX`;
  handler: ProfileController['connectX'];
};

export type ProfileControllerGetXAccountAction = {
  type: `ProfileController:getXAccount`;
  handler: ProfileController['getXAccount'];
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
  | ProfileControllerGetXAccountAction;
