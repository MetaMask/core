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

/**
 * A map of announcement ids to Announcement objects
 */
export type AnnouncementMap = {
  [id: number]: Announcement;
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
export type AnnouncementControllerState = {
  announcements: StateAnnouncementMap;
};

export type AnnouncementControllerActions =
  AnnouncementControllerGetStateAction;
export type AnnouncementControllerEvents =
  AnnouncementControllerStateChangeEvent;

export type AnnouncementControllerGetStateAction = {
  type: `${typeof controllerName}:getState`;
  handler: () => AnnouncementControllerState;
};

export type AnnouncementControllerStateChangeEvent = {
  type: `${typeof controllerName}:stateChange`;
  payload: [AnnouncementControllerState, Patch[]];
};

const controllerName = 'AnnouncementController';

const defaultState = {
  announcements: {},
};

const metadata = {
  announcements: {
    persist: true,
    anonymous: true,
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
  AnnouncementControllerState,
  AnnouncementControllerMessenger
> {
  /**
   * Creates a AnnouncementController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   * @param args.allAnnouncements - Announcements to be passed through to #addAnnouncements
   */
  constructor({
    messenger,
    state,
    allAnnouncements,
  }: {
    messenger: AnnouncementControllerMessenger;
    state?: AnnouncementControllerState;
    allAnnouncements: AnnouncementMap;
  }) {
    const mergedState = { ...defaultState, ...state };
    super({ messenger, metadata, name: controllerName, state: mergedState });
    this.#addAnnouncements(allAnnouncements);
  }

  /**
   * Compares the announcements in state with the announcements from file
   * to check if there are any new announcements
   * if yes, the new announcement will be added to the state with a flag indicating
   * that the announcement is not seen by the user.
   *
   * @param allAnnouncements - all announcements to compare with the announcements from state
   */
  #addAnnouncements(allAnnouncements: AnnouncementMap): void {
    this.update((state) => {
      Object.values(allAnnouncements).forEach((announcement: Announcement) => {
        state.announcements[announcement.id] = state.announcements[
          announcement.id
        ] ?? { ...announcement, isShown: false };
      });
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
