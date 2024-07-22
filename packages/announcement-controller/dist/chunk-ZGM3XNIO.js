"use strict";Object.defineProperty(exports, "__esModule", {value: true});var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/AnnouncementController.ts
var _basecontroller = require('@metamask/base-controller');
var controllerName = "AnnouncementController";
var defaultState = {
  announcements: {}
};
var metadata = {
  announcements: {
    persist: true,
    anonymous: true
  }
};
var _addAnnouncements, addAnnouncements_fn;
var AnnouncementController = class extends _basecontroller.BaseController {
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
    allAnnouncements
  }) {
    const mergedState = { ...defaultState, ...state };
    super({ messenger, metadata, name: controllerName, state: mergedState });
    /**
     * Compares the announcements in state with the announcements from file
     * to check if there are any new announcements
     * if yes, the new announcement will be added to the state with a flag indicating
     * that the announcement is not seen by the user.
     *
     * @param allAnnouncements - all announcements to compare with the announcements from state
     */
    __privateAdd(this, _addAnnouncements);
    __privateMethod(this, _addAnnouncements, addAnnouncements_fn).call(this, allAnnouncements);
  }
  /**
   * Resets the isShown status for all announcements
   */
  resetViewed() {
    this.update(({ announcements }) => {
      for (const announcement of Object.values(announcements)) {
        announcement.isShown = false;
      }
    });
  }
  /**
   * Updates the status of the status of the specified announcements
   * once it is read by the user.
   *
   * @param viewedIds - The announcement IDs to mark as viewed.
   */
  updateViewed(viewedIds) {
    this.update(({ announcements }) => {
      for (const id of Object.keys(viewedIds).map(Number)) {
        announcements[id].isShown = viewedIds[id];
      }
    });
  }
};
_addAnnouncements = new WeakSet();
addAnnouncements_fn = function(allAnnouncements) {
  this.update((state) => {
    Object.values(allAnnouncements).forEach((announcement) => {
      state.announcements[announcement.id] = state.announcements[announcement.id] ?? { ...announcement, isShown: false };
    });
  });
};



exports.AnnouncementController = AnnouncementController;
//# sourceMappingURL=chunk-ZGM3XNIO.js.map