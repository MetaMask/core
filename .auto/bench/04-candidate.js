// ============================================================================
// CANDIDATE — the experiment target. Mirrors the production
// packages/assets-controller/src/AssetsController.ts producer. At baseline it
// is an exact copy of the ORIGINAL section (modulo symbol suffixes). Keep
// behaviour identical to ORIGINAL (parity + SELF_CHECK enforce it) while
// optimizing. When you edit here, make the matching edit in
// packages/assets-controller/src/AssetsController.ts, and vice versa.
// ============================================================================

// --- normalizeAmountString (src/utils/normalizeAmountString.ts, verbatim) ---
function normalizeAmountString_CAND(amount, decimals) {
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
function effectiveAccountBalancesV5_CAND(
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

// -+ #updateState producer body (AssetsController.ts:2982-3243, mirrored) -+
// Signature carries the closure variables of #updateState. `state` is the
// immer-draft stand-in (a fresh clone the producer mutates).
function updateStateProducer_CAND(
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

      const effectiveAccountBalances = effectiveAccountBalancesV5_CAND(
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
        const newAmount = normalizeAmountString_CAND(
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
