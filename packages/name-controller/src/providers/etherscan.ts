import { Mutex } from 'async-mutex';

import { ETHERSCAN_SUPPORTED_NETWORKS } from '../constants';
import { createModuleLogger, projectLogger } from '../logger';
import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResult,
} from '../types';
import { NameType } from '../types';
import { handleFetch } from '../util';

const ID = 'etherscan';
const LABEL = 'Etherscan (Verified Contract Name)';
const RATE_LIMIT_INTERVAL = 5; // 5 seconds

const log = createModuleLogger(projectLogger, 'etherscan');

type EtherscanGetSourceCodeResponse = {
  status: '1' | '0';
  message: string;
  result: [
    {
      SourceCode: string;
      ABI: string;
      ContractName: string;
      CompilerVersion: string;
      OptimizationUsed: string;
      Runs: string;
      ConstructorArguments: string;
      Library: string;
      LicenseType: string;
      Proxy: string;
      Implementation: string;
      SwarmSource: string;
    },
  ];
};

export class EtherscanNameProvider implements NameProvider {
  #isEnabled: () => boolean;

  #lastRequestTime = 0;

  #mutex = new Mutex();

  constructor({ isEnabled }: { isEnabled?: () => boolean } = {}) {
    this.#isEnabled = isEnabled || (() => true);
  }

  getMetadata(): NameProviderMetadata {
    return {
      sourceIds: { [NameType.ETHEREUM_ADDRESS]: [ID] },
      sourceLabels: { [ID]: LABEL },
    };
  }

  async getProposedNames(
    request: NameProviderRequest,
  ): Promise<NameProviderResult> {
    if (!this.#isEnabled()) {
      log('Skipping request as disabled');
      return this.#buildResult([]);
    }

    const releaseLock = await this.#mutex.acquire();

    try {
      const { value, chainId } = request;

      const time = Date.now();
      const timeSinceLastRequest = time - this.#lastRequestTime;

      if (timeSinceLastRequest < RATE_LIMIT_INTERVAL) {
        log('Skipping request to avoid rate limit');
        return this.#buildResult([], RATE_LIMIT_INTERVAL);
      }

      const url = this.#getUrl(chainId, {
        module: 'contract',
        action: 'getsourcecode',
        address: value,
      });

      const { responseData, error } = await this.#sendRequest(url);

      if (error) {
        log('Request failed', error);
        throw error;
      }

      if (responseData?.message === 'NOTOK') {
        log('Request warning', responseData.result);
        return this.#buildResult([], RATE_LIMIT_INTERVAL);
      }

      const results = responseData?.result ?? [];
      const proposedNames = results.map((result) => result.ContractName);

      log('New proposed names', proposedNames);

      return this.#buildResult(proposedNames);
    } finally {
      releaseLock();
    }
  }

  async #sendRequest(url: string) {
    try {
      log('Sending request', url);

      const responseData = (await handleFetch(
        url,
      )) as EtherscanGetSourceCodeResponse;

      return { responseData };
    } catch (error) {
      return { error };
    } finally {
      this.#lastRequestTime = Date.now();
    }
  }

  #buildResult(proposedNames: string[], retryDelay?: number) {
    return {
      results: {
        [ID]: {
          proposedNames,
          retryDelay,
        },
      },
    };
  }

  #getUrl(chainId: string, params: Record<string, string | undefined>): string {
    type SupportedChainId = keyof typeof ETHERSCAN_SUPPORTED_NETWORKS;

    const networkInfo =
      ETHERSCAN_SUPPORTED_NETWORKS[chainId as SupportedChainId];

    if (!networkInfo) {
      throw new Error(`Etherscan does not support chain with ID: ${chainId}`);
    }

    let url = `https://${networkInfo.subdomain}.${networkInfo.domain}/api`;

    Object.keys(params).forEach((key, index) => {
      const value = params[key];
      url += `${index === 0 ? '?' : '&'}${key}=${value}`;
    });

    return url;
  }
}
