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
import { handleFetch, assertIsError } from '../util';

const ID = 'etherscan';
const LABEL = 'Etherscan (Verified Contract Name)';
const RATE_LIMIT_UPDATE_DELAY = 5; // 5 Seconds
const RATE_LIMIT_INTERVAL = RATE_LIMIT_UPDATE_DELAY * 1000;

const log = createModuleLogger(projectLogger, 'etherscan');

type EtherscanGetSourceCodeResponse = {
  status: '1' | '0';
  message: string;
  result: [
    {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      SourceCode: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ABI: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ContractName: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      CompilerVersion: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      OptimizationUsed: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Runs: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ConstructorArguments: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Library: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      LicenseType: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Proxy: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Implementation: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
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

      return {
        results: {
          [ID]: {
            proposedNames: [],
          },
        },
      };
    }

    const releaseLock = await this.#mutex.acquire();

    try {
      const { value, variation: chainId } = request;

      const time = Date.now();
      const timeSinceLastRequest = time - this.#lastRequestTime;

      if (timeSinceLastRequest < RATE_LIMIT_INTERVAL) {
        log('Skipping request to avoid rate limit');

        return {
          results: {
            [ID]: {
              updateDelay: RATE_LIMIT_UPDATE_DELAY,
            },
          },
        };
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

        return {
          results: {
            [ID]: {
              updateDelay: RATE_LIMIT_UPDATE_DELAY,
            },
          },
        };
      }

      const results = responseData?.result ?? [];
      const proposedNames = results.map((result) => result.ContractName);

      log('New proposed names', proposedNames);

      return {
        results: {
          [ID]: {
            proposedNames,
          },
        },
      };
    } finally {
      releaseLock();
    }
  }

  async #sendRequest(url: string): Promise<{
    responseData?: EtherscanGetSourceCodeResponse;
    error?: Error;
  }> {
    try {
      log('Sending request', url);

      const responseData = (await handleFetch(
        url,
      )) as EtherscanGetSourceCodeResponse;

      return { responseData };
    } catch (error) {
      assertIsError(error);
      return { error };
    } finally {
      this.#lastRequestTime = Date.now();
    }
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
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      url += `${index === 0 ? '?' : '&'}${key}=${value}`;
    });

    return url;
  }
}
