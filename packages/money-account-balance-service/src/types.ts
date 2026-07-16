import type { Hex } from '@metamask/utils';

/**
 * The vault configuration read from the remote feature flag.
 * Runtime validation is performed by {@link VaultConfigStruct}.
 */
export type VaultConfig = {
  boringVault: Hex;
  tellerAddress: Hex;
  accountantAddress: Hex;
  lensAddress: Hex;
  chainId: Hex;
  /**
   * Address of the vault's underlying ERC-20 asset (mUSD).
   *
   * Optional for backwards compatibility with flags deployed before this
   * field existed. When present, it is used directly as the source of truth
   * (the flag already moves in lockstep with the vault addresses), avoiding an
   * on-chain `Accountant.base()` read on every mUSD balance fetch. When absent,
   * the service falls back to reading `base()` on-chain.
   */
  underlyingToken?: Hex;
};

/**
 * A balance data source the orchestration layer can fetch from.
 *
 * - `'rpc'`: on-chain Multicall3 reads via the wallet's RPC provider
 *   (this service's {@link MoneyAccountBalanceService.getMoneyAccountBalance}).
 * - `'api'`: the indexed Money Account API, reached via
 *   `MoneyAccountApiDataService:fetchPositions`.
 */
export type BalanceSource = 'rpc' | 'api';

/**
 * Orchestration config for {@link MoneyAccountBalanceService.getBalance}, read
 * from the remote feature flag and validated by `BalanceSourceConfigStruct`.
 *
 * The orchestrator tries `preferredSource` first, then the remaining
 * `enabledSources` in order, stopping at the first success (bounded by
 * `maxAttempts`). This keeps source selection and fallback out of clients.
 */
export type BalanceSourceConfig = {
  /** Sources the orchestrator is allowed to use. */
  enabledSources: BalanceSource[];
  /** Source tried first; must also appear in `enabledSources` to be used. */
  preferredSource: BalanceSource;
  /** Maximum number of source attempts before giving up. */
  maxAttempts: number;
};
