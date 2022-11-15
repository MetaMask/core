import type { Patch } from 'immer';
import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';

type ViewedAnnouncement = {
  [id: number]: boolean;
};

type Announcement = {
  id: number;
  date: string;
};

type StateAnnouncement = Announcement & { isShown: boolean };

/**
 * A map of announcement ids to StateAnnouncement objects
 */
export type StateAnnouncementMap = {
  [id: number]: StateAnnouncement;
};

/**
 * Announcement state will hold all the seen and unseen announcements
 * that are still active
 */
export type AnnouncementState = {
  announcements: StateAnnouncementMap;
};

export type AnnouncementControllerActions = GetAnnouncementState;
export type AnnouncementControllerEvents = AnnouncementStateChange;

export type GetAnnouncementState = {
  type: `${typeof controllerName}:getState`;
  handler: () => AnnouncementState;
};

export type AnnouncementStateChange = {
  type: `${typeof controllerName}:stateChange`;
  payload: [AnnouncementState, Patch[]];
};

const controllerName = 'AnnouncementController';

const defaultState = {
  announcements: {},
};

const metadata = {
  announcements: {
    persist: true,
    anonymous: false,
  },
};

export type AnnouncementControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AnnouncementControllerActions,
  AnnouncementControllerEvents,
  never,
  never
>;

/**
 * Controller for managing in-app announcements.
 */
export class AnnouncementController extends BaseControllerV2<
  typeof controllerName,
  AnnouncementState,
  AnnouncementControllerMessenger
> {
  /**
   * Creates a AnnouncementController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: AnnouncementControllerMessenger;
    state?: AnnouncementState;
  }) {
    const mergedState = { ...defaultState, ...state };
    super({ messenger, metadata, name: controllerName, state: mergedState });
    this._addAnnouncements(mergedState.announcements);
  }

  /**
   * Compares the announcements in state with the announcements from file
   * to check if there are any new announcements
   * if yes, the new announcement will be added to the state with a flag indicating
   * that the announcement is not seen by the user.
   *
   * @param allAnnouncements - all announcements to
   */
  private _addAnnouncements(allAnnouncements: StateAnnouncementMap): void {
    const newAnnouncements: StateAnnouncementMap = {};
    this.update(({ announcements }) => {
      Object.values(allAnnouncements).forEach(
        (announcement: StateAnnouncement) => {
          newAnnouncements[announcement.id] = announcements[
            announcement.id
          ] || { ...announcement, isShown: false };
        },
      );
      announcements = newAnnouncements;
    });
  }

  /**
   * Updates the status of the status of the specified announcements
   * once it is read by the user.
   *
   * @param viewedIds - The announcement IDs to mark as viewed.
   */
  updateViewed(viewedIds: ViewedAnnouncement): void {
    this.update(({ announcements }) => {
      for (const id of Object.keys(viewedIds).map(Number)) {
        announcements[id].isShown = viewedIds[id];
      }
    });
  }
}
