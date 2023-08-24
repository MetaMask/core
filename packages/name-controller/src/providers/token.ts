import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResult,
} from '../types';
import { NameValueType } from '../types';

const ID = 'token';

const SUPPORTED_TYPES: NameValueType[] = [NameValueType.ETHEREUM_ADDRESS];

export class TokenNameProvider implements NameProvider {
  getProviderId(): string {
    return ID;
  }

  supportsType(type: NameValueType): boolean {
    return SUPPORTED_TYPES.includes(type);
  }

  async getName(request: NameProviderRequest): Promise<NameProviderResult> {
    const { value, type, chainId } = request;
    const url = `https://token-api.metaswap.codefi.network/token/${chainId}?address=${value}`;
    const response = await fetch(url);
    const responseData = await response.json();
    const name = responseData?.name;

    return {
      provider: ID,
      value,
      type,
      name,
    };
  }
}
