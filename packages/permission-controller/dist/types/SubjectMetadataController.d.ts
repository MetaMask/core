import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';
import type { HasPermissions, PermissionSubjectMetadata } from './PermissionController';
declare const controllerName = "SubjectMetadataController";
type SubjectOrigin = string;
/**
 * The different kinds of subjects that MetaMask may interact with, including
 * third parties and itself (e.g., when the background communicated with the UI).
 */
export declare enum SubjectType {
    Extension = "extension",
    Internal = "internal",
    Unknown = "unknown",
    Website = "website",
    Snap = "snap"
}
export type SubjectMetadata = PermissionSubjectMetadata & {
    [key: string]: Json;
    name: string | null;
    subjectType: SubjectType | null;
    extensionId: string | null;
    iconUrl: string | null;
};
type SubjectMetadataToAdd = PermissionSubjectMetadata & {
    name?: string | null;
    subjectType?: SubjectType | null;
    extensionId?: string | null;
    iconUrl?: string | null;
} & Record<string, Json>;
export type SubjectMetadataControllerState = {
    subjectMetadata: Record<SubjectOrigin, SubjectMetadata>;
};
export type GetSubjectMetadataState = ControllerGetStateAction<typeof controllerName, SubjectMetadataControllerState>;
export type GetSubjectMetadata = {
    type: `${typeof controllerName}:getSubjectMetadata`;
    handler: (origin: SubjectOrigin) => SubjectMetadata | undefined;
};
export type AddSubjectMetadata = {
    type: `${typeof controllerName}:addSubjectMetadata`;
    handler: (metadata: SubjectMetadataToAdd) => void;
};
export type SubjectMetadataControllerActions = GetSubjectMetadataState | GetSubjectMetadata | AddSubjectMetadata;
export type SubjectMetadataStateChange = ControllerStateChangeEvent<typeof controllerName, SubjectMetadataControllerState>;
export type SubjectMetadataControllerEvents = SubjectMetadataStateChange;
type AllowedActions = HasPermissions;
export type SubjectMetadataControllerMessenger = RestrictedControllerMessenger<typeof controllerName, SubjectMetadataControllerActions | AllowedActions, SubjectMetadataControllerEvents, AllowedActions['type'], never>;
type SubjectMetadataControllerOptions = {
    messenger: SubjectMetadataControllerMessenger;
    subjectCacheLimit: number;
    state?: Partial<SubjectMetadataControllerState>;
};
/**
 * A controller for storing metadata associated with permission subjects. More
 * or less, a cache.
 */
export declare class SubjectMetadataController extends BaseController<typeof controllerName, SubjectMetadataControllerState, SubjectMetadataControllerMessenger> {
    private readonly subjectCacheLimit;
    private readonly subjectsWithoutPermissionsEncounteredSinceStartup;
    private readonly subjectHasPermissions;
    constructor({ messenger, subjectCacheLimit, state, }: SubjectMetadataControllerOptions);
    /**
     * Clears the state of this controller. Also resets the cache of subjects
     * encountered since startup, so as to not prematurely reach the cache limit.
     */
    clearState(): void;
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
    addSubjectMetadata(metadata: SubjectMetadataToAdd): void;
    /**
     * Gets the subject metadata for the given origin, if any.
     *
     * @param origin - The origin for which to get the subject metadata.
     * @returns The subject metadata, if any, or `undefined` otherwise.
     */
    getSubjectMetadata(origin: SubjectOrigin): SubjectMetadata | undefined;
    /**
     * Deletes all subjects without permissions from the controller's state.
     */
    trimMetadataState(): void;
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
    private static getTrimmedState;
}
export {};
//# sourceMappingURL=SubjectMetadataController.d.ts.map