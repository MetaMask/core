export enum NameType {
  ETHEREUM_ADDRESS = 'ethereumAddress',
}

export type NameProviderMetadata = {
  providerIds: Record<NameType, string[]>;
  providerLabels: Record<string, string>;
};

export type NameProviderRequest = {
  chainId: string;
  providerIds?: string[];
  type: NameType;
  value: string;
};

export type NameProviderResult = {
  proposedNames?: string[];
  error?: unknown;
};

export type NameProviderResponse = {
  results: Record<string, NameProviderResult>;
  error?: unknown;
};

export type NameProvider = {
  getMetadata(): NameProviderMetadata;
  getProposedNames(request: NameProviderRequest): Promise<NameProviderResponse>;
};
