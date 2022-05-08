"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementController = void 0;
const BaseController_1 = require("../BaseController");
const defaultState = {
    announcements: {},
};
/**
 * Controller for managing in-app announcements.
 */
class AnnouncementController extends BaseController_1.BaseController {
    /**
     * Creates a AnnouncementController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config, state) {
        super(config, state || defaultState);
        this.initialize();
        this._addAnnouncements();
    }
    /**
     * Compares the announcements in state with the announcements from file
     * to check if there are any new announcements
     * if yes, the new announcement will be added to the state with a flag indicating
     * that the announcement is not seen by the user.
     */
    _addAnnouncements() {
        const newAnnouncements = {};
        const { allAnnouncements } = this.config;
        Object.values(allAnnouncements).forEach((announcement) => {
            newAnnouncements[announcement.id] = this.state.announcements[announcement.id]
                ? this.state.announcements[announcement.id]
                : Object.assign(Object.assign({}, announcement), { isShown: false });
        });
        this.update({ announcements: newAnnouncements });
    }
    /**
     * Updates the status of the status of the specified announcements
     * once it is read by the user.
     *
     * @param viewedIds - The announcement IDs to mark as viewed.
     */
    updateViewed(viewedIds) {
        const stateAnnouncements = this.state.announcements;
        for (const id of Object.keys(viewedIds).map(Number)) {
            stateAnnouncements[id].isShown = viewedIds[id];
        }
        this.update({ announcements: stateAnnouncements }, true);
    }
}
exports.AnnouncementController = AnnouncementController;
//# sourceMappingURL=AnnouncementController.js.map