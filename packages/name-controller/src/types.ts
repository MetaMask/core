export enum NameValueType {
  ETHEREUM_ADDRESS = 'ethereumAddress',
}

export type NameProviderRequest = {
  value: string;
  type: NameValueType;
  chainId: string;
};

export type NameProviderResult = {
  provider: string;
  value: string;
  type: NameValueType;
  name?: string;
  error?: unknown;
};

export type NameProvider = {
  getProviderId(): string;
  supportsType(type: NameValueType): boolean;
  getName(request: NameProviderRequest): Promise<NameProviderResult>;
};
