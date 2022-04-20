import { BaseController, BaseConfig, BaseState } from '../BaseController';

interface ViewedAnnouncement {
  [id: number]: boolean;
}

interface Announcement {
  id: number;
  date: string;
}

interface StateAnnouncement extends Announcement {
  isShown: boolean;
}

/**
 * A map of announcement ids to Announcement objects
 */
interface AnnouncementMap {
  [id: number]: Announcement;
}

/**
 * A map of announcement ids to StateAnnouncement objects
 */
export interface StateAnnouncementMap {
  [id: number]: StateAnnouncement;
}

/**
 * AnnouncementConfig will hold the active announcements
 */
export interface AnnouncementConfig extends BaseConfig {
  allAnnouncements: AnnouncementMap;
}

/**
 * Announcement state will hold all the seen and unseen announcements
 * that are still active
 */
export interface AnnouncementState extends BaseState {
  announcements: StateAnnouncementMap;
}

const defaultState = {
  announcements: {},
};

/**
 * Controller for managing in-app announcements.
 */
export class AnnouncementController extends BaseController<
  AnnouncementConfig,
  AnnouncementState
> {
  /**
   * Creates a AnnouncementController instance.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(config: AnnouncementConfig, state?: AnnouncementState) {
    super(config, state || defaultState);
    this.initialize();
    this.#addAnnouncements();
  }

  /**
   * Compares the announcements in state with the announcements from file
   * to check if there are any new announcements
   * if yes, the new announcement will be added to the state with a flag indicating
   * that the announcement is not seen by the user.
   */
  #addAnnouncements(): void {
    const newAnnouncements: StateAnnouncementMap = {};
    const { allAnnouncements } = this.config;
    Object.values(allAnnouncements).forEach(
      (announcement: StateAnnouncement) => {
        newAnnouncements[announcement.id] = this.state.announcements[
          announcement.id
        ]
          ? this.state.announcements[announcement.id]
          : {
              ...announcement,
              isShown: false,
            };
      },
    );
    this.update({ announcements: newAnnouncements });
  }

  /**
   * Updates the status of the status of the specified announcements
   * once it is read by the user.
   *
   * @param viewedIds - The announcement IDs to mark as viewed.
   */
  updateViewed(viewedIds: ViewedAnnouncement): void {
    const stateAnnouncements = this.state.announcements;

    for (const id of Object.keys(viewedIds).map(Number)) {
      stateAnnouncements[id].isShown = viewedIds[id];
    }
    this.update({ announcements: stateAnnouncements }, true);
  }
}
