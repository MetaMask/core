/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AnnouncementController } from './AnnouncementController';

/**
 * Resets the isShown status for all announcements
 */
export type AnnouncementControllerResetViewedAction = {
  type: `AnnouncementController:resetViewed`;
  handler: AnnouncementController['resetViewed'];
};

/**
 * Updates the status of the status of the specified announcements
 * once it is read by the user.
 *
 * @param viewedIds - The announcement IDs to mark as viewed.
 */
export type AnnouncementControllerUpdateViewedAction = {
  type: `AnnouncementController:updateViewed`;
  handler: AnnouncementController['updateViewed'];
};

/**
 * Union of all AnnouncementController action types.
 */
export type AnnouncementControllerMethodActions =
  | AnnouncementControllerResetViewedAction
  | AnnouncementControllerUpdateViewedAction;
