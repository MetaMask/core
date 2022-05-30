import type { Patch } from 'immer';
import { Json } from '@metamask/types';
import { BaseController } from '../BaseControllerV2';
import { RestrictedControllerMessenger } from '../ControllerMessenger';
import type { PermissionSubjectMetadata, HasPermissions } from '../permissions';
declare const controllerName = "SubjectMetadataController";
declare type SubjectOrigin = string;
export declare type SubjectMetadata = PermissionSubjectMetadata & {
    [key: string]: Json;
    name: string | null;
    extensionId: string | null;
    iconUrl: string | null;
};
declare type SubjectMetadataToAdd = PermissionSubjectMetadata & {
    name?: string | null;
    extensionId?: string | null;
    iconUrl?: string | null;
} & Record<string, Json>;
export declare type SubjectMetadataControllerState = {
    subjectMetadata: Record<SubjectOrigin, SubjectMetadata>;
};
export declare type GetSubjectMetadataState = {
    type: `${typeof controllerName}:getState`;
    handler: () => SubjectMetadataControllerState;
};
export declare type SubjectMetadataControllerActions = GetSubjectMetadataState;
export declare type SubjectMetadataStateChange = {
    type: `${typeof controllerName}:stateChange`;
    payload: [SubjectMetadataControllerState, Patch[]];
};
export declare type SubjectMetadataControllerEvents = SubjectMetadataStateChange;
declare type AllowedActions = HasPermissions;
export declare type SubjectMetadataControllerMessenger = RestrictedControllerMessenger<typeof controllerName, SubjectMetadataControllerActions | AllowedActions, SubjectMetadataControllerEvents, AllowedActions['type'], never>;
declare type SubjectMetadataControllerOptions = {
    messenger: SubjectMetadataControllerMessenger;
    subjectCacheLimit: number;
    state?: Partial<SubjectMetadataControllerState>;
};
/**
 * A controller for storing metadata associated with permission subjects. More
 * or less, a cache.
 */
export declare class SubjectMetadataController extends BaseController<typeof controllerName, SubjectMetadataControllerState, SubjectMetadataControllerMessenger> {
    private subjectCacheLimit;
    private subjectsWithoutPermissionsEcounteredSinceStartup;
    private subjectHasPermissions;
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
