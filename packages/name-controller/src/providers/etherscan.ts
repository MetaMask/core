import { ETHERSCAN_SUPPORTED_NETWORKS } from '../constants';
import type {
  NameProvider,
  NameProviderMetadata,
  NameProviderRequest,
  NameProviderResponse,
} from '../types';
import { NameType } from '../types';
import { handleFetch } from '../util';

const ID = 'etherscan';
const LABEL = 'Etherscan (Verified Contract Name)';

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
  #apiKey?: string;

  constructor({ apiKey }: { apiKey?: string } = {}) {
    this.#apiKey = apiKey;
  }

  getMetadata(): NameProviderMetadata {
    return {
      providerIds: { [NameType.ETHEREUM_ADDRESS]: [ID] },
      providerLabels: { [ID]: LABEL },
    };
  }

  async getProposedNames(
    request: NameProviderRequest,
  ): Promise<NameProviderResponse> {
    const { value, chainId } = request;

    const url = this.#getUrl(chainId, {
      module: 'contract',
      action: 'getsourcecode',
      address: value,
      apikey: this.#apiKey,
    });

    const responseData = (await handleFetch(
      url,
    )) as EtherscanGetSourceCodeResponse;

    const results = responseData?.result ?? [];
    const proposedNames = results.map((result) => result.ContractName);

    return {
      results: {
        [ID]: {
          proposedNames,
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

      if (!value) {
        return;
      }

      url += `${index === 0 ? '?' : '&'}${key}=${value}`;
    });

    return url;
  }
}
