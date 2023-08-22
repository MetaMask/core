import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResult,
} from './types';
import { NameValueType } from './types';

export type ReverseLookupCallback = (address: string) => Promise<string>;

const ID = 'ens';

const SUPPORTED_TYPES: NameValueType[] = [NameValueType.ETHEREUM_ADDRESS];

export class ENSNameProvider implements NameProvider {
  #reverseLookup: ReverseLookupCallback;

  constructor({ reverseLookup }: { reverseLookup: ReverseLookupCallback }) {
    this.#reverseLookup = reverseLookup;
  }

  getProviderId(): string {
    return ID;
  }

  supportsType(type: NameValueType): boolean {
    return SUPPORTED_TYPES.includes(type);
  }

  async getName(request: NameProviderRequest): Promise<NameProviderResult> {
    const domain = await this.#reverseLookup(request.value);

    return {
      provider: ID,
      value: request.value,
      type: request.type,
      name: domain,
    };
  }
}
