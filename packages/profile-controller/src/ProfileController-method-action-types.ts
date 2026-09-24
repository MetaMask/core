/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ProfileController } from './ProfileController.js';

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

export type ProfileControllerUpdateProfileAction = {
  type: `ProfileController:updateProfile`;
  handler: ProfileController['updateProfile'];
};

export type ProfileControllerCheckUsernameAvailabilityAction = {
  type: `ProfileController:checkUsernameAvailability`;
  handler: ProfileController['checkUsernameAvailability'];
};

/**
 * Union of all ProfileController action types.
 */
export type ProfileControllerMethodActions =
  | ProfileControllerGetMetaMaskProfileAction
  | ProfileControllerGetXprofileAction
  | ProfileControllerCreateProfileAction
  | ProfileControllerUpdateProfileAction
  | ProfileControllerCheckUsernameAvailabilityAction;
