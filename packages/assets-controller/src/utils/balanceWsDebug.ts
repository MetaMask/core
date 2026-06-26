type BalanceWsDebugPayload = Record<string, unknown>;

type BalanceWsDebugGlobal = typeof globalThis & {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- DevTools toggle
  METAMASK_BALANCE_WS_DEBUG?: boolean;
};

const LOG_PREFIX = '+++ [Balances][WS]';

/**
 * @param value - Value to serialize for console output.
 * @returns JSON string safe for logging.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, nestedValue) =>
        typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
      2,
    );
  } catch {
    return String(value);
  }
}

/**
 * Temporary WS balance pipeline logging for max-send / post-tx debugging.
 * Filter DevTools console with `+++` or `[Balances][WS]`.
 *
 * Set `globalThis.METAMASK_BALANCE_WS_DEBUG = false` to silence.
 *
 * @param step - Pipeline step label.
 * @param payload - Optional structured debug data.
 */
export function balanceWsDebug(
  step: string,
  payload?: BalanceWsDebugPayload,
): void {
  if (typeof globalThis === 'undefined') {
    return;
  }

  const debugGlobal = globalThis as BalanceWsDebugGlobal;

  if (debugGlobal.METAMASK_BALANCE_WS_DEBUG === false) {
    return;
  }

  if (payload === undefined) {
    console.log(`${LOG_PREFIX} ${step}`);
    return;
  }

  console.log(`${LOG_PREFIX} ${step}\n${safeStringify(payload)}`);
}
