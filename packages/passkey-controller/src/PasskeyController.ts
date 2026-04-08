import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import { controllerName } from './constants';
import type { PasskeyRecord } from './types';

export type PasskeyControllerState = {
  passkeyRecord: PasskeyRecord | null;
};

const passkeyControllerMetadata = {
  passkeyRecord: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: true,
  },
} satisfies StateMetadata<PasskeyControllerState>;

export function getDefaultPasskeyControllerState(): PasskeyControllerState {
  return { passkeyRecord: null };
}

const MESSENGER_EXPOSED_METHODS = [
  'setPasskeyRecord',
  'getPasskeyRecord',
  'isPasskeyEnrolled',
  'removePasskey',
] as const;

export type PasskeyControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PasskeyControllerState
>;

export type PasskeyControllerSetPasskeyRecordAction = {
  type: `${typeof controllerName}:setPasskeyRecord`;
  handler: PasskeyController['setPasskeyRecord'];
};

export type PasskeyControllerGetPasskeyRecordAction = {
  type: `${typeof controllerName}:getPasskeyRecord`;
  handler: PasskeyController['getPasskeyRecord'];
};

export type PasskeyControllerIsPasskeyEnrolledAction = {
  type: `${typeof controllerName}:isPasskeyEnrolled`;
  handler: PasskeyController['isPasskeyEnrolled'];
};

export type PasskeyControllerRemovePasskeyAction = {
  type: `${typeof controllerName}:removePasskey`;
  handler: PasskeyController['removePasskey'];
};

export type PasskeyControllerMethodActions =
  | PasskeyControllerSetPasskeyRecordAction
  | PasskeyControllerGetPasskeyRecordAction
  | PasskeyControllerIsPasskeyEnrolledAction
  | PasskeyControllerRemovePasskeyAction;

export type PasskeyControllerActions =
  | PasskeyControllerGetStateAction
  | PasskeyControllerMethodActions;

export type PasskeyControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  PasskeyControllerState
>;

export type PasskeyControllerEvents = PasskeyControllerStateChangeEvent;

export type PasskeyControllerMessenger = Messenger<
  typeof controllerName,
  PasskeyControllerActions,
  PasskeyControllerEvents
>;

export class PasskeyController extends BaseController<
  typeof controllerName,
  PasskeyControllerState,
  PasskeyControllerMessenger
> {
  constructor({
    messenger,
    state,
  }: {
    messenger: PasskeyControllerMessenger;
    state?: Partial<PasskeyControllerState>;
  }) {
    super({
      messenger,
      metadata: passkeyControllerMetadata,
      name: controllerName,
      state: { ...getDefaultPasskeyControllerState(), ...state },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  setPasskeyRecord(record: PasskeyRecord): void {
    this.update((state) => {
      state.passkeyRecord = record;
    });
  }

  getPasskeyRecord(): PasskeyRecord | null {
    return this.state.passkeyRecord;
  }

  isPasskeyEnrolled(): boolean {
    return this.state.passkeyRecord !== null;
  }

  removePasskey(): void {
    this.update((state) => {
      state.passkeyRecord = null;
    });
  }
}
