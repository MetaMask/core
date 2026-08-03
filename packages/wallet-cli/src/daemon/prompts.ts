/**
 * Ask the user to confirm the destructive `daemon purge` operation.
 *
 * Wraps `@inquirer/confirm` in a dynamic import so this CommonJS-compiled
 * package can interop with that ESM-only dependency, and so tests can mock
 * the prompt without going through jest's ESM mock machinery.
 *
 * @returns True if the user confirmed.
 */
export async function confirmPurge(): Promise<boolean> {
  const { default: confirm } = await import('@inquirer/confirm');
  return confirm({
    message: 'This will stop the daemon and delete all state. Continue?',
    default: false,
  });
}

/**
 * Ask the user to confirm broadcasting a transaction. Used by `mm wallet send`
 * when neither `--yes` nor `--dry-run` was passed. Same dynamic-import +
 * ESM-interop pattern as {@link confirmPurge}. Defaults to `false` so an
 * accidental bare Enter never broadcasts.
 *
 * @param summary - A human-readable description of the transaction to send
 * (recipient, amount, network), shown above the prompt.
 * @returns True if the user confirmed.
 */
export async function confirmSend(summary: string): Promise<boolean> {
  const { default: confirm } = await import('@inquirer/confirm');
  return confirm({
    message: `${summary}\nBroadcast this transaction?`,
    default: false,
  });
}

/**
 * Prompt the user for the wallet password, with input masked. Used by
 * `mm wallet unlock` when the user did not pass `--password` or set the
 * `MM_WALLET_PASSWORD` env var. Same dynamic-import + ESM-interop pattern
 * as {@link confirmPurge}.
 *
 * @returns The password the user typed.
 */
export async function promptPassword(): Promise<string> {
  const { default: password } = await import('@inquirer/password');
  return password({
    message: 'Wallet password:',
    mask: true,
  });
}
