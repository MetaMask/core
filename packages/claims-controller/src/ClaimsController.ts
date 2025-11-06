import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { detectSIWE } from '@metamask/controller-utils';
import type { KeyringControllerSignPersonalMessageAction } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type {
  ClaimsServiceGenerateMessageForClaimSignatureAction,
  ClaimsServiceGetClaimByIdAction,
  ClaimsServiceGetClaimsAction,
  ClaimsServiceGetClaimsApiUrlAction,
  ClaimsServiceGetRequestHeadersAction,
  ClaimsServiceVerifyClaimSignatureAction,
} from './ClaimsService';
import {
  CONTROLLER_NAME,
  HttpContentTypeHeader,
  SERVICE_NAME,
} from './constants';
import type {
  Claim,
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
  | ClaimsServiceGetClaimsAction
  | ClaimsServiceGetClaimByIdAction
  | ClaimsServiceGetRequestHeadersAction
  | ClaimsServiceGetClaimsApiUrlAction
  | ClaimsServiceGenerateMessageForClaimSignatureAction
  | ClaimsServiceVerifyClaimSignatureAction
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
      HttpContentTypeHeader.MULTIPART_FORM_DATA,
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
    console.log('message', message);

    // generate and parse the SIWE message
    const messageHex = textToHex(message);
    const siwe = detectSIWE({ data: messageHex });
    if (!siwe.isSIWEMessage) {
      throw new Error('Invalid Signature message');
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
    console.log('signature', signature);

    // verify the signature
    const isSignatureValid = await this.messenger.call(
      `${SERVICE_NAME}:verifyClaimSignature`,
      signature as Hex,
      walletAddress,
      message,
    );

    if (!isSignatureValid) {
      throw new Error('Invalid signature');
    }

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
   * Validate the claim before submitting it.
   *
   * @param claim - The claim to validate.
   */
  #validateSubmitClaimRequest(claim: CreateClaimRequest): void {
    const { claims: existingClaims } = this.state;
    const isClaimAlreadySubmitted = existingClaims.some(
      (existingClaim) =>
        existingClaim.email === claim.email &&
        existingClaim.impactedTxHash === claim.impactedTxHash,
      // Question: should we allow users to submit the rejected claim again?
    );
    if (isClaimAlreadySubmitted) {
      throw new Error('Claim already submitted');
    }
  }
}

/**
 * Converts a text string to its hexadecimal representation.
 *
 * @param text - The input string.
 * @returns The hexadecimal representation of the string's UTF-8 bytes.
 */
function textToHex(text: string): Hex {
  // 1. Encode the string into a Uint8Array (UTF-8 bytes)
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(text);

  // 2. Convert bytes to hex string
  let hexString = '';
  for (const byte of utf8Bytes) {
    // Convert the byte (a number 0-255) to a hexadecimal string
    const hex = byte.toString(16);

    // Ensure the hex value is always two characters long by padding with a leading zero
    hexString += hex.padStart(2, '0');
  }

  return `0x${hexString}`;
}
