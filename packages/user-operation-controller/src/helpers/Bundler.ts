/* eslint-disable jsdoc/require-jsdoc */

import { createModuleLogger, projectLogger } from '../logger';
import type { UserOperation, UserOperationReceipt } from '../types';

const log = createModuleLogger(projectLogger, 'bundler');

/**
 * Response from the `eth_estimateUserOperationGas` bundler method.
 * Includes the estimated gas limits required by a user operation.
 */
export type BundlerEstimateUserOperationGasResponse = {
  /** Estimated gas required to compensate the bundler for any pre-verification. */
  preVerificationGas: number | string;

  /** Estimated gas required to verify the user operation. */
  verificationGas: number | string;

  /** Estimated gas required to verify the user operation. */
  verificationGasLimit: number | string;

  /** Estimated gas required for the execution of the user operation. */
  callGasLimit: number | string;
};

/**
 * A helper class for interacting with a bundler.
 */
export class Bundler {
  #url: string;

  constructor(url: string) {
    this.#url = url;
  }

  /**
   * Estimate the gas required to execute a user operation.
   *
   * @param userOperation - The user operation to estimate gas for.
   * @param entrypoint - The address of entrypoint to use for the user operation.
   * @returns The estimated gas limits for the user operation.
   */
  async estimateUserOperationGas(
    userOperation: UserOperation,
    entrypoint: string,
  ): Promise<BundlerEstimateUserOperationGasResponse> {
    log('Estimating gas', { url: this.#url, userOperation, entrypoint });

    const response = await this.#query('eth_estimateUserOperationGas', [
      userOperation,
      entrypoint,
    ]);

    log('Estimated gas', { response });

    return response as BundlerEstimateUserOperationGasResponse;
  }

  /**
   * Retrieve the receipt for a user operation.
   * Returns `null` or `undefined` if the user operation is still pending.
   * @param hash - The hash of the user operation.
   * @returns The receipt for the user operation.
   */
  async getUserOperationReceipt(
    hash?: string,
  ): Promise<UserOperationReceipt | undefined> {
    log('Getting user operation receipt', { url: this.#url, hash });
    return await this.#query('eth_getUserOperationReceipt', [hash]);
  }

  /**
   * Submit a user operation to the bundler.
   * @param userOperation - The signed user operation to submit.
   * @param entrypoint - The address of entrypoint to use for the user operation.
   * @returns The hash of the user operation.
   */
  async sendUserOperation(
    userOperation: UserOperation,
    entrypoint: string,
  ): Promise<string> {
    log('Sending user operation', {
      url: this.#url,
      userOperation,
      entrypoint,
    });

    const hash = await this.#query('eth_sendUserOperation', [
      userOperation,
      entrypoint,
    ]);

    log('Sent user operation', hash);

    return hash;
  }

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async #query(method: string, params: any[]): Promise<any> {
    const request = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    };

    const response = await fetch(this.#url, request);
    const responseJson = await response.json();

    if (responseJson.error) {
      const error = new Error(responseJson.error.message || responseJson.error);
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code = responseJson.error.code;

      throw error;
    }

    return responseJson.result;
  }
}
