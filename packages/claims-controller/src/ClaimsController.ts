import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type {
  ClaimsServiceGetClaimByIdAction,
  ClaimsServiceGetClaimsAction,
  ClaimsServiceGetClaimsApiUrlAction,
  ClaimsServiceGetRequestHeadersAction,
} from './ClaimsService';
import {
  CONTROLLER_NAME,
  HttpContentTypeHeader,
  SERVICE_NAME,
} from './constants';
import type {
  ClaimsControllerState,
  ClaimWithoutSignature,
  SubmitClaimConfig,
} from './types';

export type ClaimsControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  ClaimsControllerState
>;

export type ClaimsControllerActions = ClaimsControllerGetStateAction;

export type AllowedActions =
  | ClaimsServiceGetClaimsAction
  | ClaimsServiceGetClaimByIdAction
  | ClaimsServiceGetRequestHeadersAction
  | ClaimsServiceGetClaimsApiUrlAction;

export type ClaimsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof CONTROLLER_NAME,
  ClaimsControllerState
>;

export type ClaimsControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  ClaimsControllerActions | AllowedActions,
  ClaimsControllerStateChangeEvent
>;

export type ClaimsControllerOptions = {
  messenger: ClaimsControllerMessenger;
  state?: Partial<ClaimsControllerState>;
};

const ClaimsControllerStateMetadata: StateMetadata<ClaimsControllerState> = {
  claims: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
};

/**
 * Get an initial default state for the controller.
 *
 * @returns The initial default controller state.
 */
export function getDefaultClaimsControllerState(): ClaimsControllerState {
  return {
    claims: [],
  };
}

export class ClaimsController extends BaseController<
  typeof CONTROLLER_NAME,
  ClaimsControllerState,
  ClaimsControllerMessenger
> {
  constructor({ messenger, state }: ClaimsControllerOptions) {
    super({
      messenger,
      metadata: ClaimsControllerStateMetadata,
      name: CONTROLLER_NAME,
      state: { ...getDefaultClaimsControllerState(), ...state },
    });
  }

  /**
   * Get required config for submitting a claim.
   *
   * @param claimRequest - The claim request to get the required config for.
   * @returns The required config for submitting the claim.
   */
  async getSubmitClaimConfig(
    claimRequest: ClaimWithoutSignature,
  ): Promise<SubmitClaimConfig> {
    // TODO: validate the claim
    // TODO: get the claim signature
    const claim = {
      ...claimRequest,
      signature:
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12', // TODO: get the claim signature
    };
    // TODO: get the request headers
    // TODO: get the claims API URL

    const headers = await this.messenger.call(
      `${SERVICE_NAME}:getRequestHeaders`,
      HttpContentTypeHeader.MULTIPART_FORM_DATA,
    );
    const url = this.messenger.call(`${SERVICE_NAME}:getClaimsApiUrl`);

    return {
      data: claim,
      headers,
      method: 'POST',
      url,
    };
  }
}
