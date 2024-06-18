import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';

import type {
  GenericPermissionController,
  HasPermissions,
  PermissionSubjectMetadata,
} from './PermissionController';

const controllerName = 'SubjectMetadataController';

type SubjectOrigin = string;

/**
 * The different kinds of subjects that MetaMask may interact with, including
 * third parties and itself (e.g., when the background communicated with the UI).
 */
export enum SubjectType {
  Extension = 'extension',
  Internal = 'internal',
  Unknown = 'unknown',
  Website = 'website',
  Snap = 'snap',
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

const stateMetadata = {
  subjectMetadata: { persist: true, anonymous: false },
};

const defaultState: SubjectMetadataControllerState = {
  subjectMetadata: {},
};

export type GetSubjectMetadataState = ControllerGetStateAction<
  typeof controllerName,
  SubjectMetadataControllerState
>;

export type GetSubjectMetadata = {
  type: `${typeof controllerName}:getSubjectMetadata`;
  handler: (origin: SubjectOrigin) => SubjectMetadata | undefined;
};

export type AddSubjectMetadata = {
  type: `${typeof controllerName}:addSubjectMetadata`;
  handler: (metadata: SubjectMetadataToAdd) => void;
};

export type SubjectMetadataControllerActions =
  | GetSubjectMetadataState
  | GetSubjectMetadata
  | AddSubjectMetadata;

export type SubjectMetadataStateChange = ControllerStateChangeEvent<
  typeof controllerName,
  SubjectMetadataControllerState
>;

export type SubjectMetadataControllerEvents = SubjectMetadataStateChange;

type AllowedActions = HasPermissions;

export type SubjectMetadataControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  SubjectMetadataControllerActions | AllowedActions,
  SubjectMetadataControllerEvents,
  AllowedActions['type'],
  never
>;

type SubjectMetadataControllerOptions = {
  messenger: SubjectMetadataControllerMessenger;
  subjectCacheLimit: number;
  state?: Partial<SubjectMetadataControllerState>;
};

/**
 * A controller for storing metadata associated with permission subjects. More
 * or less, a cache.
 */
export class SubjectMetadataController extends BaseController<
  typeof controllerName,
  SubjectMetadataControllerState,
  SubjectMetadataControllerMessenger
> {
  private readonly subjectCacheLimit: number;

  private readonly subjectsWithoutPermissionsEncounteredSinceStartup: Set<string>;

  private readonly subjectHasPermissions: GenericPermissionController['hasPermissions'];

  constructor({
    messenger,
    subjectCacheLimit,
    state = {},
  }: SubjectMetadataControllerOptions) {
    if (!Number.isInteger(subjectCacheLimit) || subjectCacheLimit < 1) {
      throw new Error(
        `subjectCacheLimit must be a positive integer. Received: "${subjectCacheLimit}"`,
      );
    }

    const hasPermissions = (origin: string) => {
      return messenger.call('PermissionController:hasPermissions', origin);
    };

    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: {
        ...SubjectMetadataController.getTrimmedState(state, hasPermissions),
      },
    });

    this.subjectHasPermissions = hasPermissions;
    this.subjectCacheLimit = subjectCacheLimit;
    this.subjectsWithoutPermissionsEncounteredSinceStartup = new Set();

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getSubjectMetadata`,
      this.getSubjectMetadata.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:addSubjectMetadata`,
      this.addSubjectMetadata.bind(this),
    );
  }

  /**
   * Clears the state of this controller. Also resets the cache of subjects
   * encountered since startup, so as to not prematurely reach the cache limit.
   */
  clearState(): void {
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
  addSubjectMetadata(metadata: SubjectMetadataToAdd): void {
    const { origin } = metadata;
    const newMetadata: SubjectMetadata = {
      ...metadata,
      extensionId: metadata.extensionId || null,
      iconUrl: metadata.iconUrl || null,
      name: metadata.name || null,
      subjectType: metadata.subjectType || null,
    };

    let originToForget: string | null = null;
    // We only delete the oldest encountered subject from the cache, again to
    // ensure that the user's experience isn't degraded by missing icons etc.
    if (
      this.subjectsWithoutPermissionsEncounteredSinceStartup.size >=
      this.subjectCacheLimit
    ) {
      const cachedOrigin =
        this.subjectsWithoutPermissionsEncounteredSinceStartup
          .values()
          .next().value;

      this.subjectsWithoutPermissionsEncounteredSinceStartup.delete(
        cachedOrigin,
      );

      if (!this.subjectHasPermissions(cachedOrigin)) {
        originToForget = cachedOrigin;
      }
    }

    this.subjectsWithoutPermissionsEncounteredSinceStartup.add(origin);

    this.update((draftState) => {
      draftState.subjectMetadata[origin] = newMetadata;
      if (typeof originToForget === 'string') {
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
  getSubjectMetadata(origin: SubjectOrigin): SubjectMetadata | undefined {
    return this.state.subjectMetadata[origin];
  }

  /**
   * Deletes all subjects without permissions from the controller's state.
   */
  trimMetadataState(): void {
    this.update((draftState) => {
      // @ts-expect-error ts(2589)
      return SubjectMetadataController.getTrimmedState(
        draftState,
        this.subjectHasPermissions,
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
  private static getTrimmedState(
    state: Partial<SubjectMetadataControllerState>,
    hasPermissions: SubjectMetadataController['subjectHasPermissions'],
  ): SubjectMetadataControllerState {
    const { subjectMetadata = {} } = state;

    return {
      subjectMetadata: Object.keys(subjectMetadata).reduce<
        Record<SubjectOrigin, SubjectMetadata>
      >((newSubjectMetadata, origin) => {
        if (hasPermissions(origin)) {
          newSubjectMetadata[origin] = subjectMetadata[origin];
        }
        return newSubjectMetadata;
      }, {}),
    };
  }
}
