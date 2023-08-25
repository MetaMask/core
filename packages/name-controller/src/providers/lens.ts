import type {
  NameProvider,
  NameProviderRequest,
  NameProviderResult,
} from '../types';
import { NameValueType } from '../types';

const ID = 'lens';

const SUPPORTED_TYPES: NameValueType[] = [NameValueType.ETHEREUM_ADDRESS];

export class LensNameProvider implements NameProvider {
  getProviderId(): string {
    return ID;
  }

  supportsType(type: NameValueType): boolean {
    return SUPPORTED_TYPES.includes(type);
  }

  async getName(request: NameProviderRequest): Promise<NameProviderResult> {
    const { value, type } = request;
    const url = `https://api.lens.dev`;

    const body = JSON.stringify({
      query: `query Profiles {  profiles(request: { ownedBy: ["${value}"], limit: 1 }) {    items {      name      handle    }  }}`,
    });

    const response = await fetch(url, {
      body,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const responseData = await response.json();

    const profile = responseData?.data?.profiles?.items?.[0];
    let name = profile?.handle;

    if (name && profile?.name) {
      name += ` (${profile?.name})`;
    }

    return {
      provider: ID,
      value,
      type,
      name,
    };
  }
}
