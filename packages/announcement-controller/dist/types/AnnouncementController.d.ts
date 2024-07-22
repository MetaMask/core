import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
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
type StateAnnouncement = Announcement & {
    isShown: boolean;
};
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
export type AnnouncementControllerActions = AnnouncementControllerGetStateAction;
export type AnnouncementControllerEvents = AnnouncementControllerStateChangeEvent;
export type AnnouncementControllerGetStateAction = ControllerGetStateAction<typeof controllerName, AnnouncementControllerState>;
export type AnnouncementControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, AnnouncementControllerState>;
declare const controllerName = "AnnouncementController";
export type AnnouncementControllerMessenger = RestrictedControllerMessenger<typeof controllerName, AnnouncementControllerActions, AnnouncementControllerEvents, never, never>;
/**
 * Controller for managing in-app announcements.
 */
export declare class AnnouncementController extends BaseController<typeof controllerName, AnnouncementControllerState, AnnouncementControllerMessenger> {
    #private;
    /**
     * Creates a AnnouncementController instance.
     *
     * @param args - The arguments to this function.
     * @param args.messenger - Messenger used to communicate with BaseV2 controller.
     * @param args.state - Initial state to set on this controller.
     * @param args.allAnnouncements - Announcements to be passed through to #addAnnouncements
     */
    constructor({ messenger, state, allAnnouncements, }: {
        messenger: AnnouncementControllerMessenger;
        state?: AnnouncementControllerState;
        allAnnouncements: AnnouncementMap;
    });
    /**
     * Resets the isShown status for all announcements
     */
    resetViewed(): void;
    /**
     * Updates the status of the status of the specified announcements
     * once it is read by the user.
     *
     * @param viewedIds - The announcement IDs to mark as viewed.
     */
    updateViewed(viewedIds: ViewedAnnouncement): void;
}
export {};
//# sourceMappingURL=AnnouncementController.d.ts.map