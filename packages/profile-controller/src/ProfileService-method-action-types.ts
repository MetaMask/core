/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ProfileService } from './ProfileService.js';

export type ProfileServiceGetProfileAction = {
  type: `ProfileService:getProfile`;
  handler: ProfileService['getProfile'];
};

export type ProfileServiceCreateProfileAction = {
  type: `ProfileService:createProfile`;
  handler: ProfileService['createProfile'];
};

export type ProfileServiceReplaceProfileAction = {
  type: `ProfileService:replaceProfile`;
  handler: ProfileService['replaceProfile'];
};

export type ProfileServiceUpdateProfileAction = {
  type: `ProfileService:updateProfile`;
  handler: ProfileService['updateProfile'];
};

export type ProfileServiceDeleteProfileAction = {
  type: `ProfileService:deleteProfile`;
  handler: ProfileService['deleteProfile'];
};

export type ProfileServiceCheckUsernameAvailabilityAction = {
  type: `ProfileService:checkUsernameAvailability`;
  handler: ProfileService['checkUsernameAvailability'];
};

export type ProfileServiceGetXAuthUrlAction = {
  type: `ProfileService:getXAuthUrl`;
  handler: ProfileService['getXAuthUrl'];
};

export type ProfileServiceConnectXAction = {
  type: `ProfileService:connectX`;
  handler: ProfileService['connectX'];
};

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
