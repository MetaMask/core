// ============================================================================
// BENCH HELPERS — vendored pure helpers shared by ORIGINAL and CANDIDATE.
// Mirrors production behavior for the bench's already-normalized CAIP-19
// asset-id shapes. Deterministic; do not optimize these (not in scope).
// ============================================================================

// --- CAIP parsing (from @metamask/utils; only shapes used by this bench) ---
function parseCaipChainId(chainId) {
  const parts = chainId.split(':');
  return { namespace: parts[0], reference: parts[1] };
}
function parseCaipAssetType(assetId) {
  const slashIdx = assetId.indexOf('/');
  const chainId = assetId.slice(0, slashIdx);
  const assetTypePart = assetId.slice(slashIdx + 1);
  const colonIdx = assetTypePart.indexOf(':');
  return {
    chainId,
    chain: parseCaipChainId(chainId),
    assetNamespace: assetTypePart.slice(0, colonIdx),
    assetReference: assetTypePart.slice(colonIdx + 1),
  };
}
// normalizeAssetId: bench inputs are already canonical (post-normalizeResponse)
function normalizeAssetIdBench(assetId) {
  return assetId;
}

// --- isNativeAssetId (native-assets.ts; bench native set, lowercase) ---
const BENCH_NATIVE_ASSET_IDS = new Set([
  'eip155:1/slip44:60',
  'eip155:137/slip44:966',
  'eip155:10/slip44:60',
  'eip155:8453/slip44:60',
  'eip155:42161/slip44:60',
  'eip155:56/slip44:60',
  'eip155:100/slip44:60',
  'eip155:42/erc20:0x0000000000000000000000000000000000000000',
]);
function isNativeAssetId(assetId) {
  try {
    return BENCH_NATIVE_ASSET_IDS.has(
      normalizeAssetIdBench(assetId).toLowerCase(),
    );
  } catch {
    return false;
  }
}

// --- isStakingContractAssetId (staking-contracts.ts, verbatim logic).
// Bench asset ids are valid CAIP-19 (isCaipAssetType always true), and
// bench chain ids are already CAIP-2. ---
const STAKING_CONTRACT_ADDRESS_BY_CHAINID = {
  'eip155:1': '0x4fef9d741011476750a243ac70b9789a63dd47df', // Mainnet
  'eip155:560048': '0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff', // Hoodi
};
function isStakingContractAssetId(assetId) {
  try {
    const parsed = parseCaipAssetType(assetId);
    if (parsed.assetNamespace !== 'erc20') {
      return false;
    }
    const address = parsed.assetReference.toLowerCase();
    const stakingAddress = STAKING_CONTRACT_ADDRESS_BY_CHAINID[
      parsed.chainId
    ]?.toLowerCase();
    return stakingAddress !== undefined && address === stakingAddress;
  } catch {
    return false;
  }
}

// --- getDefaultAssetMetadata (defaults.ts; bench defaults map) ---
const BENCH_DEFAULT_ASSET_METADATA = new Map([
  [
    'eip155:1/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA',
    { type: 'erc20', symbol: 'mUSD', name: 'MetaMask USD', decimals: 6 },
  ],
  [
    'eip155:137/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA',
    { type: 'erc20', symbol: 'mUSD', name: 'MetaMask USD', decimals: 6 },
  ],
]);
function getDefaultAssetMetadata(assetId) {
  return BENCH_DEFAULT_ASSET_METADATA.get(assetId);
}

// --- zero balances (utils/getZeroAssetBalance.ts, verbatim logic) ---
const ZERO_NATIVE_BALANCE = { amount: '0' };
function getZeroAssetBalance(assetId) {
  const { chainId } = parseCaipAssetType(assetId);
  if (parseCaipChainId(chainId).namespace === 'stellar') {
    return {
      amount: '0',
      spendableBalance: '0',
      minimumReserveBalance: '0',
    };
  }
  return { ...ZERO_NATIVE_BALANCE };
}
function getDefaultNativeAssetBalance() {
  return { ...ZERO_NATIVE_BALANCE };
}

// --- #getAssetType (AssetsController.ts:2762, verbatim logic) ---
function getAssetType(assetId) {
  if (isNativeAssetId(assetId)) return 'native';
  const parsedAssetType = parseCaipAssetType(assetId);
  const chainNamespace = parsedAssetType.chain.namespace;
  const assetNamespace = parsedAssetType.assetNamespace;
  if (chainNamespace === 'solana' && assetNamespace === 'token') return 'spl';
  return 'erc20';
}

// ============================================================================
// ORIGINAL — frozen reference implementation. DO NOT EDIT.
// Extracted verbatim (adapted only for this-method substitution) from
// packages/assets-controller/src/AssetsController.ts at origin/main
// (commit 0120311d887):
//   - normalizeAmountString  (src/utils/normalizeAmountString.ts)
//   - effectiveAccountBalancesV5 (AssetsController.ts:574)
//   - the producer passed to this.update() inside #updateState
//     (AssetsController.ts:2982-3243), V5 path (isBalanceV6Enabled === false
//     in the profiled build; V6 is out of scope for this bench).
// this-method substitutions:
//   this.#getAssetType(assetId)            -> getAssetType(assetId)
//   this.#getSelectedAccounts()            -> ctx.accounts
//   this.#getNativeAssetIdsForAccount(a)   -> ctx.nativeAssetIdsByAccount[a.id] ?? []
//   this.#isBalanceV6Enabled()             -> ctx.isBalanceV6Enabled
// ============================================================================

// --- normalizeAmountString (src/utils/normalizeAmountString.ts, verbatim) ---
function normalizeAmountString_ORIG(amount, decimals) {
  if (typeof amount !== 'string' || amount.length === 0) {
    return '0';
  }
  const bn = new BigNumberJS(amount);
  if (!bn.isFinite()) {
    return '0';
  }
  let result;
  if (decimals === undefined || !Number.isFinite(decimals) || decimals < 0) {
    result = bn.toFixed();
  } else {
    result = bn.toFixed(Math.floor(decimals), BigNumberJS.ROUND_DOWN);
  }
  if (result.includes('.')) {
    result = result.replace(/0+$/, '');
    if (result.endsWith('.')) {
      result = result.slice(0, -1);
    }
  }
  return result === '-0' ? '0' : result;
}

// --- effectiveAccountBalancesV5 (AssetsController.ts:574, verbatim) ---
function effectiveAccountBalancesV5_ORIG(
  previousBalances,
  accountBalances,
  customAssetIds,
  replaceCoveredChains,
) {
  if (!replaceCoveredChains) {
    return { ...previousBalances, ...accountBalances };
  }

  const coveredChains = new Set(
    Object.keys(accountBalances).map((assetId) => assetId.split('/')[0]),
  );

  const next = {};
  for (const [assetId, balance] of Object.entries(previousBalances)) {
    if (!coveredChains.has(assetId.split('/')[0])) {
      next[assetId] = balance;
    }
  }

  Object.assign(next, accountBalances);

  for (const customId of customAssetIds) {
    if (!Object.prototype.hasOwnProperty.call(next, customId)) {
      const prev = previousBalances[customId];
      next[customId] = prev ?? getZeroAssetBalance(customId);
    }
  }

  for (const [assetId, balance] of Object.entries(previousBalances)) {
    if (
      isStakingContractAssetId(assetId) &&
      !Object.prototype.hasOwnProperty.call(next, assetId)
    ) {
      next[assetId] = balance;
    }
  }

  return next;
}

// --- #updateState producer body (AssetsController.ts:2982-3243, verbatim) ---
// Signature carries the closure variables of #updateState. `state` is the
// immer-draft stand-in (a fresh clone the producer mutates).
function updateStateProducer_ORIG(
  state,
  normalizedResponse,
  mode,
  previousState,
  previousPrices,
  changedBalances,
  changedMetadata,
  ctx,
) {
  const metadata = state.assetsInfo;
  const balances = state.assetsBalance;
  const prices = state.assetsPrice;

  if (normalizedResponse.assetsInfo) {
    for (const [key, value] of Object.entries(
      normalizedResponse.assetsInfo,
    )) {
      const existing = metadata[key];
      const incoming = value;

      const nextValue =
        existing && !incoming.symbol && !incoming.name
          ? {
              ...existing,
              ...incoming,
              symbol: existing.symbol,
              name: existing.name,
              decimals: existing.decimals ?? incoming.decimals,
              image: existing.image ?? incoming.image,
            }
          : value;

      if (!isEqual(previousState.assetsInfo[key], nextValue)) {
        metadata[key] = nextValue;
        changedMetadata.push(key);
      }
    }
  }

  // Reconcile & self-heal stale asset "types" (e.g. erc20 -> native)
  const assetsInfoAssetIdsSet = new Set([
    ...Object.keys(normalizedResponse.assetsInfo ?? {}),
    ...Object.values(normalizedResponse.assetsBalance ?? {}).flatMap(
      (accountBalances) => Object.keys(accountBalances),
    ),
  ]);
  for (const assetId of assetsInfoAssetIdsSet) {
    const entry = metadata[assetId];
    if (!entry) {
      continue;
    }
    const correctType = getAssetType(assetId);
    if (entry.type !== correctType) {
      metadata[assetId] = { ...entry, type: correctType };
      if (!changedMetadata.includes(assetId)) {
        changedMetadata.push(assetId);
      }
    }
  }

  if (normalizedResponse.assetsBalance) {
    const applyV5AccountBalanceUpdate = (
      accountId,
      accountBalances,
      previousBalances,
    ) => {
      const customAssetIds = state.customAssets[accountId] ?? [];

      const replaceCoveredChains =
        mode === 'full' ||
        normalizedResponse.replaceCoveredChainBalances === true;

      const effectiveAccountBalances = effectiveAccountBalancesV5_ORIG(
        previousBalances,
        accountBalances,
        customAssetIds,
        replaceCoveredChains,
      );

      // Ensure native tokens have an entry (0 if missing)
      const account = ctx.accounts.find((a) => a.id === accountId);
      const nativeAssetIdsForAccount = account
        ? ctx.nativeAssetIdsByAccount[account.id] ?? []
        : [];
      for (const nativeAssetId of nativeAssetIdsForAccount) {
        if (
          !Object.prototype.hasOwnProperty.call(
            effectiveAccountBalances,
            nativeAssetId,
          )
        ) {
          effectiveAccountBalances[nativeAssetId] =
            getDefaultNativeAssetBalance(nativeAssetId);
        }
      }

      for (const [assetId, balance] of Object.entries(
        effectiveAccountBalances,
      )) {
        const previousBalance = previousBalances[assetId];
        const assetDecimals = metadata[assetId]?.decimals;
        const newAmount = normalizeAmountString_ORIG(
          balance.amount,
          assetDecimals,
        );
        const newMetadata =
          balance.metadata ?? previousBalance?.metadata;
        effectiveAccountBalances[assetId] = {
          amount: newAmount,
          ...(newMetadata === undefined ? {} : { metadata: newMetadata }),
        };
        const oldAmount = previousBalance?.amount;
        const isNewSeededZero =
          oldAmount === undefined &&
          newAmount === '0' &&
          (nativeAssetIdsForAccount.includes(assetId) ||
            getDefaultAssetMetadata(assetId) !== undefined);
        if (oldAmount !== newAmount && !isNewSeededZero) {
          changedBalances.push({
            accountId,
            assetId,
            oldAmount,
            newAmount,
          });
        }
      }

      if (!isEqual(previousBalances, effectiveAccountBalances)) {
        balances[accountId] = effectiveAccountBalances;
      }
    };

    // v6 path: out of scope for this bench (isBalanceV6Enabled is false in
    // the profiled build); guarded so it can never run here.
    const applyV6AccountBalanceUpdate = () => {
      throw new Error('v6 path not covered by this bench');
    };

    for (const [accountId, accountBalances] of Object.entries(
      normalizedResponse.assetsBalance,
    )) {
      const previousBalances = previousState.assetsBalance[accountId] ?? {};

      if (ctx.isBalanceV6Enabled) {
        applyV6AccountBalanceUpdate(accountId, accountBalances, previousBalances);
      } else {
        applyV5AccountBalanceUpdate(accountId, accountBalances, previousBalances);
      }
    }
  }

  if (normalizedResponse.assetsPrice) {
    for (const [key, value] of Object.entries(
      normalizedResponse.assetsPrice,
    )) {
      if (!isEqual(previousPrices[key], value)) {
        prices[key] = value;
      }
    }
  }
}
