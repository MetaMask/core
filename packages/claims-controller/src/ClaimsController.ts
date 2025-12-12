import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { detectSIWE, toHex } from '@metamask/controller-utils';
import type { KeyringControllerSignPersonalMessageAction } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import { bytesToHex, stringToBytes } from '@metamask/utils';

import type {
  ClaimsServiceFetchClaimsConfigurationsAction,
  ClaimsServiceGenerateMessageForClaimSignatureAction,
  ClaimsServiceGetClaimByIdAction,
  ClaimsServiceGetClaimsAction,
  ClaimsServiceGetClaimsApiUrlAction,
  ClaimsServiceGetRequestHeadersAction,
} from './ClaimsService';
import {
  ClaimsControllerErrorMessages,
  CONTROLLER_NAME,
  DEFAULT_CLAIMS_CONFIGURATIONS,
  SERVICE_NAME,
} from './constants';
import type {
  Claim,
  ClaimDraft,
  ClaimsConfigurations,
  ClaimsControllerState,
  CreateClaimRequest,
  SubmitClaimConfig,
} from './types';

export type ClaimsControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  ClaimsControllerState
>;

export type ClaimsControllerActions = ClaimsControllerGetStateAction;

export type AllowedActions =
  | ClaimsServiceFetchClaimsConfigurationsAction
  | ClaimsServiceGetClaimsAction
  | ClaimsServiceGetClaimByIdAction
  | ClaimsServiceGetRequestHeadersAction
  | ClaimsServiceGetClaimsApiUrlAction
  | ClaimsServiceGenerateMessageForClaimSignatureAction
  | ClaimsServiceGetClaimsAction
  | KeyringControllerSignPersonalMessageAction;

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
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  claimsConfigurations: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  drafts: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
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
    claimsConfigurations: DEFAULT_CLAIMS_CONFIGURATIONS,
    claims: [],
    drafts: [],
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
   * Fetch the required configurations for the claims service.
   *
   * @returns The required configurations for the claims service.
   */
  async fetchClaimsConfigurations(): Promise<ClaimsConfigurations> {
    const configurations = await this.messenger.call(
      `${SERVICE_NAME}:fetchClaimsConfigurations`,
    );

    const supportedNetworks = configurations.networks.map((network) =>
      toHex(network),
    );
    const claimsConfigurations = {
      validSubmissionWindowDays: configurations.validSubmissionWindowDays,
      supportedNetworks,
    };

    this.update((state) => {
      state.claimsConfigurations = claimsConfigurations;
    });
    return claimsConfigurations;
  }

  /**
   * Get required config for submitting a claim.
   *
   * @param claim - The claim request to get the required config for.
   * @returns The required config for submitting the claim.
   */
  async getSubmitClaimConfig(
    claim: CreateClaimRequest,
  ): Promise<SubmitClaimConfig> {
    // Validate the claim before submitting it.
    this.#validateSubmitClaimRequest(claim);

    const headers = await this.messenger.call(
      `${SERVICE_NAME}:getRequestHeaders`,
    );
    const baseUrl = this.messenger.call(`${SERVICE_NAME}:getClaimsApiUrl`);
    const url = `${baseUrl}/claims`;

    return {
      data: claim,
      headers,
      method: 'POST',
      url,
    };
  }

  /**
   * Generate a signature for a claim.
   *
   * @param chainId - The chain id of the claim.
   * @param walletAddress - The impacted wallet address of the claim.
   * @returns The signature for the claim.
   */
  async generateClaimSignature(
    chainId: number,
    walletAddress: `0x${string}`,
  ): Promise<string> {
    // generate the message to be signed
    const { message } = await this.messenger.call(
      `${SERVICE_NAME}:generateMessageForClaimSignature`,
      chainId,
      walletAddress,
    );

    // generate and parse the SIWE message
    const messageBytes = stringToBytes(message);
    const messageHex = bytesToHex(messageBytes);
    const siwe = detectSIWE({ data: messageHex });
    if (!siwe.isSIWEMessage) {
      throw new Error(ClaimsControllerErrorMessages.INVALID_SIGNATURE_MESSAGE);
    }

    // sign the message
    const signature = await this.messenger.call(
      'KeyringController:signPersonalMessage',
      {
        data: message,
        from: walletAddress,
        siwe,
      },
    );

    return signature;
  }

  /**
   * Get the list of claims for the current user.
   *
   * @returns The list of claims for the current user.
   */
  async getClaims(): Promise<Claim[]> {
    const claims = await this.messenger.call(`${SERVICE_NAME}:getClaims`);
    this.update((state) => {
      state.claims = claims;
    });
    return claims;
  }

  /**
   * Save a claim draft to the state.
   * If the draft name is not provided, a default name will be generated.
   * If the draft with the same id already exists, it will be updated.
   *
   * @param draft - The draft to save.
   * @returns The saved draft.
   */
  saveOrUpdateClaimDraft(draft: Partial<ClaimDraft>): ClaimDraft {
    const { drafts } = this.state;

    const isExistingDraft = drafts.some(
      (existingDraft) =>
        draft.draftId && existingDraft.draftId === draft.draftId,
    );

    if (isExistingDraft) {
      this.update((state) => {
        state.drafts = state.drafts.map((existingDraft) =>
          existingDraft.draftId === draft.draftId
            ? { ...existingDraft, ...draft }
            : existingDraft,
        );
      });
      return draft as ClaimDraft;
    }

    // generate a new draft id, name and add it to the state
    const draftId = `draft-${Date.now()}`;

    const newDraft: ClaimDraft = {
      ...draft,
      draftId,
    };

    this.update((state) => {
      state.drafts.push(newDraft);
    });

    return newDraft;
  }

  /**
   * Get the list of claim drafts.
   *
   * @returns The list of claim drafts.
   */
  getClaimDrafts(): ClaimDraft[] {
    return this.state.drafts;
  }

  /**
   * Delete a claim draft from the state.
   *
   * @param draftId - The ID of the draft to delete.
   */
  deleteClaimDraft(draftId: string): void {
    this.update((state) => {
      state.drafts = state.drafts.filter((draft) => draft.draftId !== draftId);
    });
  }

  /**
   * Delete all claim drafts from the state.
   */
  deleteAllClaimDrafts(): void {
    this.update((state) => {
      state.drafts = [];
    });
  }

  /**
   * Validate the claim before submitting it.
   *
   * @param claim - The claim to validate.
   */
  #validateSubmitClaimRequest(claim: CreateClaimRequest): void {
    const { claims: existingClaims } = this.state;
    const isClaimAlreadySubmitted = existingClaims.some(
      (existingClaim) => existingClaim.impactedTxHash === claim.impactedTxHash,
    );
    if (isClaimAlreadySubmitted) {
      throw new Error(ClaimsControllerErrorMessages.CLAIM_ALREADY_SUBMITTED);
    }
  }
}
