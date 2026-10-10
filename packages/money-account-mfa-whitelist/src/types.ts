import type { Hex } from '@metamask/utils';

/**
 * The Delegation Framework contracts the whitelist pins. The keys match the
 * contract names in `@metamask/delegation-deployments`, so a deployment entry
 * (e.g. `DELEGATOR_CONTRACTS['1.3.0'][143]`) can be passed as is.
 */
export type DelegationFrameworkContracts = {
  /** The EIP-712 `verifyingContract` of every delegation. */
  DelegationManager: Hex;
  /** The only implementation an EIP-7702 authorization may delegate to. */
  EIP7702StatelessDeleGatorImpl: Hex;
  ERC20TransferAmountEnforcer: Hex;
  ExactExecutionBatchEnforcer: Hex;
  ExactExecutionEnforcer: Hex;
  LimitedCallsEnforcer: Hex;
  RedeemerEnforcer: Hex;
  ValueLteEnforcer: Hex;
};

/**
 * A Money Account vault. The base vault comes from the
 * `moneyAccountVaultConfig` remote feature flag, the premium vault from
 * `moneyAccountPremiumVaultConfig`, and each vault's adapter from the CHOMP
 * service details.
 */
export type MoneyAccountVault = {
  /** The boring vault, which is also the vault share token (e.g. vmUSD). */
  boringVault: Hex;
  /** The teller that mints vault shares on deposit. */
  tellerAddress: Hex;
  /** The Veda vault adapter, the only redeemer of standing delegations. */
  vedaVaultAdapterAddress: Hex;
};

/**
 * The pinned configuration a payload must match to be whitelisted. Anything
 * that doesn't match requires MFA, so a configuration change fails closed.
 */
export type MfaWhitelistConfig = {
  /** The Money Account chain, e.g. `0x8f` for Monad. */
  chainId: Hex;
  /** The Delegation Framework contracts on that chain. */
  contracts: DelegationFrameworkContracts;
  /** The mUSD token. */
  musdTokenAddress: Hex;
  /** CHOMP's auto-deposit delegate, the delegate of standing delegations. */
  chompDelegateAddress: Hex;
  /** The vaults deposits may go into. */
  vaults: MoneyAccountVault[];
  /**
   * The domain of the card provider sign-in message (the MetaMask universal
   * link host). The sign-in message requires MFA when this is not set.
   */
  cardSignInDomain?: string;
  /**
   * How far, in milliseconds, a signed message's timestamp may be from the
   * current time. Defaults to five minutes.
   */
  maxMessageAge?: number;
};

/**
 * An EIP-7702 authorization tuple, as passed to the keyring's
 * `signEip7702Authorization`.
 */
export type Eip7702Authorization = [
  chainId: number,
  contractAddress: Hex,
  nonce: number,
];

/**
 * A signature request for the Money Account, mirroring the three signing
 * methods of the Money keyring.
 */
export type MoneyAccountSignatureRequest =
  | {
      method: 'signPersonalMessage';
      /** The Money Account address. */
      address: Hex;
      /** The message as hex-encoded UTF-8, as passed to the keyring. */
      message: Hex;
    }
  | {
      method: 'signTypedData';
      /** The Money Account address. */
      address: Hex;
      version: 'V1' | 'V3' | 'V4';
      /** The typed data, as an object or as a JSON string. */
      data: unknown;
    }
  | {
      method: 'signEip7702Authorization';
      /** The Money Account address. */
      address: Hex;
      authorization: Eip7702Authorization;
    };

/**
 * The whitelist rule a payload matched.
 */
export type MfaWhitelistRule =
  | 'chomp-authentication'
  | 'card-sign-in'
  | 'rewards-binding'
  | 'eip7702-authorization'
  | 'vault-standing-delegation'
  | 'vault-deposit-delegation';

/**
 * Whether a signature request requires MFA. A whitelisted request names the
 * rule it matched; any other request gives the reason it isn't whitelisted.
 */
export type MfaRequirement =
  | { mfaRequired: false; rule: MfaWhitelistRule }
  | { mfaRequired: true; reason: string };

/**
 * What the signer itself knows about the signature: its key, the hash it is
 * asked to sign, its pinned config and its clock. None of this may be taken
 * from the signature request, which is what is being checked.
 */
export type MfaSignerContext = {
  /** The Money Account whose key signs the hash. */
  address: Hex;
  /** The 32-byte hash to sign. */
  hash: Hex;
  /** The pinned whitelist config. */
  config: MfaWhitelistConfig;
  /** The current time in milliseconds. Defaults to `Date.now()`. */
  now?: number;
};
