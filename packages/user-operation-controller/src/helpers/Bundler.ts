import { BUNDLER_URL_BY_CHAIN_ID } from '../constants';
import { createModuleLogger, projectLogger } from '../logger';
import {
  BundlerEstimateUserOperationGasResponse,
  UserOperation,
  UserOperationReceipt,
} from '../types';

const log = createModuleLogger(projectLogger, 'bundler');

export function getBundler(chainId: string): Bundler {
  const chainIdKey = chainId as keyof typeof BUNDLER_URL_BY_CHAIN_ID;
  const url = BUNDLER_URL_BY_CHAIN_ID[chainIdKey];

  if (!url) {
    throw new Error(`No bundler found for chain ID: ${chainId}`);
  }

  return new Bundler(url);
}

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

    log('Estimated gas', response);

    return response as BundlerEstimateUserOperationGasResponse;
  }

  async getUserOperationReceipt(
    hash?: string,
  ): Promise<UserOperationReceipt | undefined> {
    return await this.#query('eth_getUserOperationReceipt', [hash]);
  }

  async sendUserOperation(
    userOperation: UserOperation,
    entrypoint: string,
  ): Promise<string> {
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
      throw new Error(responseJson.error.message || responseJson.error);
    }

    return responseJson.result;
  }
}
