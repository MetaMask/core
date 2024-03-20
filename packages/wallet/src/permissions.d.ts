import type {
  CaveatValidator,
  PermissionConstraint,
  PermissionFactory,
  PermissionType,
  RestrictedMethod,
} from '@metamask/permission-controller';
import type { Hex } from '@metamask/utils';

declare const CaveatTypes: {
  readonly restrictReturnedAccounts: 'restrictReturnedAccounts';
};

declare const RestrictedMethods: {
  // These properties match RPC method names, which follow a different naming convention
  /* eslint-disable @typescript-eslint/naming-convention */
  readonly eth_accounts: 'eth_accounts';
  /* eslint-enable @typescript-eslint/naming-convention */
};

type InternalCaveats = {
  restrictReturnedAccounts: {
    type: typeof CaveatTypes.restrictReturnedAccounts;

    value: Hex[];
  };
};

export type InternalCaveatSpecification = {
  type: typeof CaveatTypes.restrictReturnedAccounts;

  decorator: (
    method: string,
    caveat: InternalCaveats['restrictReturnedAccounts'],
  ) => Hex[];

  validator: CaveatValidator<InternalCaveats['restrictReturnedAccounts']>;
};

type InternalPermissions = {
  [RestrictedMethods.eth_accounts]: {
    caveats: [InternalCaveats['restrictReturnedAccounts']];
    date: number;
    id: string;
    invoker: string;
    parentCapability: typeof RestrictedMethods.eth_accounts;
  };
};

export type InternalPermissionSpecification = {
  permissionType: PermissionType.RestrictedMethod;
  targetName: typeof RestrictedMethods.eth_accounts;
  allowedCaveats: [typeof CaveatTypes.restrictReturnedAccounts];
  factory: PermissionFactory<
    InternalPermissions[typeof RestrictedMethods.eth_accounts],
    Record<string, unknown>
  >;
  methodImplementation: RestrictedMethod<[], Hex[]>;
  validator: (
    permission: PermissionConstraint,
    origin?: string,
    target?: string,
  ) => void;
};
