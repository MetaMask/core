/* eslint-disable jsdoc/require-jsdoc */

import { createModuleLogger, projectLogger } from '../logger';
import type { UserOperation } from '../types';

const log = createModuleLogger(projectLogger, 'bundler');

export type BundlerEstimateUserOperationGasResponse = {
  preVerificationGas: number;
  verificationGas: number;
  verificationGasLimit: number;
  callGasLimit: number;
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
    const response = await this.#query('eth_estimateUserOperationGas', [
      userOperation,
      entrypoint,
    ]);

    log('Estimated gas', { url: this.#url, response });

    return response as BundlerEstimateUserOperationGasResponse;
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
      (error as any).code = responseJson.error.code;

      throw error;
    }

    return responseJson.result;
  }
}
