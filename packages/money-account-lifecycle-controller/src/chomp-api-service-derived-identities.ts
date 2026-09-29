// TODO: Replace with the equivalent types from `@metamask/chomp-api-service`
// once the derived identities endpoint has been added to that package.

export type DerivedIdentityStatus = 'NONE' | 'MIGRATING' | 'DONE';

export type DerivedIdentity = {
  currentAddress: string;
  previousAddresses: string[];
  status: DerivedIdentityStatus;
};

export type DerivedIdentitiesResponse = {
  identities: DerivedIdentity[];
};

export type ChompApiServiceGetDerivedIdentitiesAction = {
  type: 'ChompApiService:getDerivedIdentities';
  handler: () => Promise<DerivedIdentitiesResponse>;
};
