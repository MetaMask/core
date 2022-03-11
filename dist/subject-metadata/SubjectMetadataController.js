"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubjectMetadataController = void 0;
const BaseControllerV2_1 = require("../BaseControllerV2");
const controllerName = 'SubjectMetadataController';
const stateMetadata = {
    subjectMetadata: { persist: true, anonymous: false },
};
const defaultState = {
    subjectMetadata: {},
};
/**
 * A controller for storing metadata associated with permission subjects. More
 * or less, a cache.
 */
class SubjectMetadataController extends BaseControllerV2_1.BaseController {
    constructor({ messenger, subjectCacheLimit, state = {}, }) {
        if (!Number.isInteger(subjectCacheLimit) || subjectCacheLimit < 1) {
            throw new Error(`subjectCacheLimit must be a positive integer. Received: "${subjectCacheLimit}"`);
        }
        const hasPermissions = (origin) => {
            return messenger.call('PermissionController:hasPermissions', origin);
        };
        super({
            name: controllerName,
            metadata: stateMetadata,
            messenger,
            state: Object.assign({}, SubjectMetadataController.getTrimmedState(state, hasPermissions)),
        });
        this.subjectHasPermissions = hasPermissions;
        this.subjectCacheLimit = subjectCacheLimit;
        this.subjectsWithoutPermissionsEcounteredSinceStartup = new Set();
    }
    /**
     * Clears the state of this controller. Also resets the cache of subjects
     * encountered since startup, so as to not prematurely reach the cache limit.
     */
    clearState() {
        this.subjectsWithoutPermissionsEcounteredSinceStartup.clear();
        this.update((_draftState) => {
            return Object.assign({}, defaultState);
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
        const newMetadata = Object.assign(Object.assign({}, metadata), { extensionId: metadata.extensionId || null, iconUrl: metadata.iconUrl || null, name: metadata.name || null });
        let originToForget = null;
        // We only delete the oldest encountered subject from the cache, again to
        // ensure that the user's experience isn't degraded by missing icons etc.
        if (this.subjectsWithoutPermissionsEcounteredSinceStartup.size >=
            this.subjectCacheLimit) {
            const cachedOrigin = this.subjectsWithoutPermissionsEcounteredSinceStartup
                .values()
                .next().value;
            this.subjectsWithoutPermissionsEcounteredSinceStartup.delete(cachedOrigin);
            if (!this.subjectHasPermissions(cachedOrigin)) {
                originToForget = cachedOrigin;
            }
        }
        this.subjectsWithoutPermissionsEcounteredSinceStartup.add(origin);
        this.update((draftState) => {
            // Typecast: ts(2589)
            draftState.subjectMetadata[origin] = newMetadata;
            if (typeof originToForget === 'string') {
                delete draftState.subjectMetadata[originToForget];
            }
        });
    }
    /**
     * Deletes all subjects without permissions from the controller's state.
     */
    trimMetadataState() {
        this.update((draftState) => {
            return SubjectMetadataController.getTrimmedState(
            // Typecast: ts(2589)
            draftState, this.subjectHasPermissions);
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
            }, {}),
        };
    }
}
exports.SubjectMetadataController = SubjectMetadataController;
//# sourceMappingURL=SubjectMetadataController.js.map