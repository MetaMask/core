/* eslint-disable jsdoc/require-jsdoc */

import { createModuleLogger, projectLogger } from '../logger';
import type {
  BundlerEstimateUserOperationGasResponse,
  UserOperation,
} from '../types';

const log = createModuleLogger(projectLogger, 'bundler');

export class Bundler {
  #url: string;

  constructor(url: string) {
    this.#url = url;
  }

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
