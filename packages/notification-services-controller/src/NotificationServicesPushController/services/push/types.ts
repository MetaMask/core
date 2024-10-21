import type * as Web from './push-web';

export type CreateRegToken = typeof Web.createRegToken;
export type DeleteRegToken = typeof Web.deleteRegToken;
export type ListenToPushNotificationsReceived =
  typeof Web.listenToPushNotificationsReceived;
export type ListenToPushNotificationsClicked =
  typeof Web.listenToPushNotificationsClicked;
