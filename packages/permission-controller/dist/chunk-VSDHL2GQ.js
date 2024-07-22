"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/SubjectMetadataController.ts
var _basecontroller = require('@metamask/base-controller');
var controllerName = "SubjectMetadataController";
var SubjectType = /* @__PURE__ */ ((SubjectType2) => {
  SubjectType2["Extension"] = "extension";
  SubjectType2["Internal"] = "internal";
  SubjectType2["Unknown"] = "unknown";
  SubjectType2["Website"] = "website";
  SubjectType2["Snap"] = "snap";
  return SubjectType2;
})(SubjectType || {});
var stateMetadata = {
  subjectMetadata: { persist: true, anonymous: false }
};
var defaultState = {
  subjectMetadata: {}
};
var SubjectMetadataController = class _SubjectMetadataController extends _basecontroller.BaseController {
  constructor({
    messenger,
    subjectCacheLimit,
    state = {}
  }) {
    if (!Number.isInteger(subjectCacheLimit) || subjectCacheLimit < 1) {
      throw new Error(
        `subjectCacheLimit must be a positive integer. Received: "${subjectCacheLimit}"`
      );
    }
    const hasPermissions = (origin) => {
      return messenger.call("PermissionController:hasPermissions", origin);
    };
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: {
        ..._SubjectMetadataController.getTrimmedState(state, hasPermissions)
      }
    });
    this.subjectHasPermissions = hasPermissions;
    this.subjectCacheLimit = subjectCacheLimit;
    this.subjectsWithoutPermissionsEncounteredSinceStartup = /* @__PURE__ */ new Set();
    this.messagingSystem.registerActionHandler(
      // ESLint is confused by the string literal type.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getSubjectMetadata`,
      this.getSubjectMetadata.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      // ESLint is confused by the string literal type.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:addSubjectMetadata`,
      this.addSubjectMetadata.bind(this)
    );
  }
  /**
   * Clears the state of this controller. Also resets the cache of subjects
   * encountered since startup, so as to not prematurely reach the cache limit.
   */
  clearState() {
    this.subjectsWithoutPermissionsEncounteredSinceStartup.clear();
    this.update((_draftState) => {
      return { ...defaultState };
    });
  }
  /**
   * Stores domain metadata for the given origin (subject). Deletes metadata for
   * subjects without permissions in a FIFO manner once more than
   * {@link SubjectMetadataController.subjectCacheLimit} distinct origins have
   * been added since boot.
   *
   * In order to prevent a degraded user experience,
   * metadata is never deleted for subjects with permissions, since metadata
   * cannot yet be requested on demand.
   *
   * @param metadata - The subject metadata to store.
   */
  addSubjectMetadata(metadata) {
    const { origin } = metadata;
    const newMetadata = {
      ...metadata,
      extensionId: metadata.extensionId || null,
      iconUrl: metadata.iconUrl || null,
      name: metadata.name || null,
      subjectType: metadata.subjectType || null
    };
    let originToForget = null;
    if (this.subjectsWithoutPermissionsEncounteredSinceStartup.size >= this.subjectCacheLimit) {
      const cachedOrigin = this.subjectsWithoutPermissionsEncounteredSinceStartup.values().next().value;
      this.subjectsWithoutPermissionsEncounteredSinceStartup.delete(
        cachedOrigin
      );
      if (!this.subjectHasPermissions(cachedOrigin)) {
        originToForget = cachedOrigin;
      }
    }
    this.subjectsWithoutPermissionsEncounteredSinceStartup.add(origin);
    this.update((draftState) => {
      draftState.subjectMetadata[origin] = newMetadata;
      if (typeof originToForget === "string") {
        delete draftState.subjectMetadata[originToForget];
      }
    });
  }
  /**
   * Gets the subject metadata for the given origin, if any.
   *
   * @param origin - The origin for which to get the subject metadata.
   * @returns The subject metadata, if any, or `undefined` otherwise.
   */
  getSubjectMetadata(origin) {
    return this.state.subjectMetadata[origin];
  }
  /**
   * Deletes all subjects without permissions from the controller's state.
   */
  trimMetadataState() {
    this.update((draftState) => {
      return _SubjectMetadataController.getTrimmedState(
        draftState,
        this.subjectHasPermissions
      );
    });
  }
  /**
   * Returns a new state object that only includes subjects with permissions.
   * This method is static because we want to call it in the constructor, before
   * the controller's state is initialized.
   *
   * @param state - The state object to trim.
   * @param hasPermissions - A function that returns a boolean indicating
   * whether a particular subject (identified by its origin) has any
   * permissions.
   * @returns The new state object. If the specified `state` object has no
   * subject metadata, the returned object will be equivalent to the default
   * state of this controller.
   */
  static getTrimmedState(state, hasPermissions) {
    const { subjectMetadata = {} } = state;
    return {
      subjectMetadata: Object.keys(subjectMetadata).reduce((newSubjectMetadata, origin) => {
        if (hasPermissions(origin)) {
          newSubjectMetadata[origin] = subjectMetadata[origin];
        }
        return newSubjectMetadata;
      }, {})
    };
  }
};




exports.SubjectType = SubjectType; exports.SubjectMetadataController = SubjectMetadataController;
//# sourceMappingURL=chunk-VSDHL2GQ.js.map