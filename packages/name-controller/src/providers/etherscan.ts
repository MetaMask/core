import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResult,
} from '../types';
import { NameValueType } from '../types';

const ID = 'etherscan';

const SUPPORTED_TYPES: NameValueType[] = [NameValueType.ETHEREUM_ADDRESS];

export class EtherscanNameProvider implements NameProvider {
  #apiKey?: string;

  constructor({ apiKey }: { apiKey?: string }) {
    this.#apiKey = apiKey;
  }

  getProviderId(): string {
    return ID;
  }

  supportsType(type: NameValueType): boolean {
    return SUPPORTED_TYPES.includes(type);
  }

  async getName(request: NameProviderRequest): Promise<NameProviderResult> {
    const { value, type } = request;

    let url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${value}`;

    if (this.#apiKey) {
      url += `&apikey=${this.#apiKey}`;
    }

    const response = await fetch(url);
    const responseData = await response.json();
    const name = responseData?.result?.[0]?.ContractName;

    return {
      provider: ID,
      value,
      type,
      name,
    };
  }
}
