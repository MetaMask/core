export enum NameType {
  ETHEREUM_ADDRESS = 'ethereumAddress',
}

export type NameProviderRequest = {
  chainId: string;
  providerIds?: string[];
  type: NameType;
  value: string;
};

export type NameProviderResult = {
  proposedName?: string;
  error?: unknown;
};

export type NameProviderResponse = {
  results: Record<string, NameProviderResult>;
  error?: unknown;
};

export type NameProvider = {
  getProviderIds(): Record<NameType, string[]>;
  getProviderLabel(providerId: string): string;
  getProposedNames(request: NameProviderRequest): Promise<NameProviderResponse>;
};
