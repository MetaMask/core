/* eslint-disable jsdoc/require-jsdoc */

import { createModuleLogger, projectLogger } from '../logger';
import type {
  UserOperation,
  UserOperationReceipt,
  UserOperationV07,
} from '../types';
import { Version4337 } from '../types';
import { toUserOperationV07 } from '../utils/compatability';

const log = createModuleLogger(projectLogger, 'bundler');

/**
 * Response from the `eth_estimateUserOperationGas` bundler method.
 * Includes the estimated gas limits required by a user operation.
 */
export type BundlerEstimateUserOperationGasResponse = {
  /** Estimated gas required to compensate the bundler for any pre-verification. */
  preVerificationGas: number | string;

  /** Estimated gas required to verify the user operation. */
  verificationGas?: number | string;

  /** Estimated gas required to verify the user operation. */
  verificationGasLimit?: number | string;

  /** Estimated gas required for the execution of the user operation. */
  callGasLimit: number | string;
};

/**
 * A helper class for interacting with a bundler.
 */
export class Bundler {
  #url: string;

  #version: Version4337;

  constructor({ url, version }: { url: string; version?: Version4337 }) {
    this.#url = url;
    this.#version = version ?? Version4337.V06;
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
    const finalUserOperation = this.#getCompatibleUserOperation(userOperation);

    log('Estimating gas', {
      url: this.#url,
      userOperation: finalUserOperation,
      entrypoint,
    });

    const response: BundlerEstimateUserOperationGasResponse = await this.#query(
      'eth_estimateUserOperationGas',
      [finalUserOperation, entrypoint],
    );

    log('Estimated gas', { response });

    return response;
  }

  /**
   * Retrieve the receipt for a user operation.
   * @param hash - The hash of the user operation.
   * @returns The receipt for the user operation, or `undefined` if the user operation is pending.
   */
  async getUserOperationReceipt(
    hash?: string,
  ): Promise<UserOperationReceipt | undefined> {
    log('Getting user operation receipt', { url: this.#url, hash });

    return await this.#query<UserOperationReceipt | undefined>(
      'eth_getUserOperationReceipt',
      [hash],
    );
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
    const finalUserOperation = this.#getCompatibleUserOperation(userOperation);

    log('Sending user operation', {
      url: this.#url,
      userOperation: finalUserOperation,
      entrypoint,
    });

    const hash: string = await this.#query('eth_sendUserOperation', [
      finalUserOperation,
      entrypoint,
    ]);

    log('Sent user operation', hash);

    return hash;
  }

  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  async #query<T>(method: string, params: unknown[]): Promise<T> {
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

      (error as unknown as Record<string, string>).code =
        responseJson.error.code;

      throw error;
    }

    return responseJson.result;
  }

  #getCompatibleUserOperation(
    userOperation: UserOperation,
  ): UserOperation | UserOperationV07 {
    return this.#version === Version4337.V07
      ? toUserOperationV07(userOperation)
      : userOperation;
  }
}
