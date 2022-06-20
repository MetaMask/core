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
/**
 * Controller for managing in-app announcements.
 */
export declare class AnnouncementController extends BaseController<AnnouncementConfig, AnnouncementState> {
    /**
     * Creates a AnnouncementController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config: AnnouncementConfig, state?: AnnouncementState);
    /**
     * Compares the announcements in state with the announcements from file
     * to check if there are any new announcements
     * if yes, the new announcement will be added to the state with a flag indicating
     * that the announcement is not seen by the user.
     */
    private _addAnnouncements;
    /**
     * Updates the status of the status of the specified announcements
     * once it is read by the user.
     *
     * @param viewedIds - The announcement IDs to mark as viewed.
     */
    updateViewed(viewedIds: ViewedAnnouncement): void;
}
export {};
