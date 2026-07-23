import { bigIntToHex, isJsonRpcFailure, toWei } from '@metamask/utils';
import type { Hex, Json, JsonRpcParams } from '@metamask/utils';
import { Command, Flags } from '@oclif/core';

import { sendCommand } from '../../daemon/daemon-client.js';
import { getDaemonPaths } from '../../daemon/paths.js';
import { confirmSend } from '../../daemon/prompts.js';
import {
  emptyToUndefined,
  formatJsonRpcError,
  makeDaemonConnectionError,
} from '../../daemon/utils.js';

const ETHER_DECIMALS = 18;

/**
 * Convert a decimal ether amount to a `0x`-prefixed wei quantity.
 *
 * The fixed-point conversion is delegated to `@metamask/utils`' `toWei` — the
 * shared, audited implementation (a bigint-based reimplementation of
 * `@metamask/ethjs-unit`) — rather than re-deriving the wei math here. The
 * daemon's `sendTransaction` boundary expects canonical hex wei; this is where
 * the human-friendly `--value` (ether) is turned into it.
 *
 * `toWei` itself accepts negatives and scientific notation and throws opaque
 * messages, so the input is guarded up front for a clear error and a strictly
 * non-negative value.
 *
 * @param amount - A non-negative decimal ether amount (e.g. `"0.1"`, `"1"`).
 * @returns The equivalent wei as a `0x`-prefixed hex string.
 * @throws If `amount` is not a non-negative decimal or has more than 18
 * fractional digits.
 */
export function parseEtherToWeiHex(amount: string): Hex {
  const trimmed = amount.trim();
  if (!/^\d+(?:\.\d+)?$/u.test(trimmed)) {
    throw new Error(
      `Invalid value "${amount}": expected a non-negative decimal amount of ether (e.g. 0.1).`,
    );
  }

  if ((trimmed.split('.')[1] ?? '').length > ETHER_DECIMALS) {
    throw new Error(
      `Invalid value "${amount}": ether has at most ${ETHER_DECIMALS} decimal places.`,
    );
  }

  return bigIntToHex(toWei(trimmed, 'ether'));
}

export default class WalletSend extends Command {
  static override description =
    'Send a transaction through the daemon-hosted TransactionController. ' +
    'Resolves gas via GasFeeController estimates unless overridden, signs, ' +
    'broadcasts, and prints the resulting transaction hash. The daemon ' +
    'auto-approves, so the confirmation boundary is this command.';

  static override examples = [
    '<%= config.bin %> wallet send --to 0xRecipient --value 0.01 --chain-id 0x1',
    '<%= config.bin %> wallet send --to 0xRecipient --value 0.01 --network-client-id mainnet --yes',
    '<%= config.bin %> wallet send --to 0xContract --data 0xabcdef --value 0 --chain-id 0x1 --dry-run',
  ];

  static override flags = {
    to: Flags.string({
      description: 'Recipient address (0x-prefixed)',
      required: true,
    }),
    value: Flags.string({
      description: 'Amount to send, in ether (e.g. 0.01). Defaults to 0.',
      default: '0',
    }),
    from: Flags.string({
      description:
        'Sender address (0x-prefixed). Defaults to the selected account.',
    }),
    data: Flags.string({
      description: 'Calldata as a 0x-prefixed hex string (for contract calls)',
    }),
    'network-client-id': Flags.string({
      description:
        'Network client to send on. Provide this or --chain-id, not both.',
    }),
    'chain-id': Flags.string({
      description:
        'Chain ID (0x-prefixed hex) to resolve to a network client. Provide this or --network-client-id, not both.',
    }),
    gas: Flags.string({
      description: 'Gas limit override, as a 0x-prefixed hex quantity',
    }),
    'max-fee-per-gas': Flags.string({
      description: 'maxFeePerGas override, as a 0x-prefixed hex wei quantity',
    }),
    'max-priority-fee-per-gas': Flags.string({
      description:
        'maxPriorityFeePerGas override, as a 0x-prefixed hex wei quantity',
    }),
    'gas-price': Flags.string({
      description:
        'Legacy gasPrice override, as a 0x-prefixed hex wei quantity',
    }),
    'dry-run': Flags.boolean({
      description:
        'Resolve the network client and sender and validate params, but do not broadcast.',
    }),
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip the confirmation prompt and broadcast immediately.',
    }),
    timeout: Flags.integer({
      char: 't',
      description: 'Response timeout in milliseconds',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(WalletSend);

    const networkClientId = emptyToUndefined(flags['network-client-id']);
    const chainId = emptyToUndefined(flags['chain-id']);
    if ((networkClientId === undefined) === (chainId === undefined)) {
      this.error('Provide exactly one of --network-client-id or --chain-id.');
    }

    let value: string;
    try {
      value = parseEtherToWeiHex(flags.value);
    } catch (error) {
      // `parseEtherToWeiHex` only ever throws `Error`.
      this.error((error as Error).message);
    }

    const params: Record<string, Json> = {
      to: flags.to,
      value,
      ...(networkClientId === undefined ? {} : { networkClientId }),
      ...(chainId === undefined ? {} : { chainId }),
      ...(flags.from ? { from: flags.from } : {}),
      ...(flags.data ? { data: flags.data } : {}),
      ...(flags.gas ? { gas: flags.gas } : {}),
      ...(flags['max-fee-per-gas']
        ? { maxFeePerGas: flags['max-fee-per-gas'] }
        : {}),
      ...(flags['max-priority-fee-per-gas']
        ? { maxPriorityFeePerGas: flags['max-priority-fee-per-gas'] }
        : {}),
      ...(flags['gas-price'] ? { gasPrice: flags['gas-price'] } : {}),
    };

    const { socketPath } = getDaemonPaths(this.config.dataDir);
    const timeoutMs = flags.timeout;

    // A `dryRun` resolves the network client and sender and validates params
    // server-side without broadcasting. `--dry-run` stops after previewing;
    // an interactive run previews first so the confirmation shows the resolved
    // sender/network. `--yes` skips both and broadcasts directly.
    if (flags['dry-run']) {
      const preview = await this.#dispatchSend(
        socketPath,
        { ...params, dryRun: true },
        timeoutMs,
      );
      this.log(formatPlan(preview, flags.value));
      return;
    }

    if (!flags.yes) {
      const preview = await this.#dispatchSend(
        socketPath,
        { ...params, dryRun: true },
        timeoutMs,
      );

      let confirmed: boolean;
      try {
        confirmed = await confirmSend(formatPlan(preview, flags.value));
      } catch (error) {
        // Ctrl+C at the prompt (@inquirer/core's ExitPromptError) is a clean
        // abort, not a failure; anything else should surface.
        if (error instanceof Error && error.name === 'ExitPromptError') {
          this.log('Aborted.');
          return;
        }
        throw error;
      }
      if (!confirmed) {
        this.log('Aborted.');
        return;
      }
    }

    const result = await this.#dispatchSend(socketPath, params, timeoutMs);
    this.log('Transaction broadcast.');
    this.log(`Hash:   ${stringField(result, 'transactionHash')}`);
    this.log(`Id:     ${stringField(result, 'transactionId')}`);
    this.log(`Status: ${stringField(result, 'status')}`);
  }

  /**
   * Send a `sendTransaction` RPC to the daemon and return its result payload,
   * translating connection errors and JSON-RPC failures into command errors.
   *
   * @param socketPath - The daemon Unix socket path.
   * @param params - The `sendTransaction` params (with or without `dryRun`).
   * @param timeoutMs - Optional response timeout in milliseconds.
   * @returns The JSON-RPC `result` as a record.
   */
  async #dispatchSend(
    socketPath: string,
    params: JsonRpcParams,
    timeoutMs: number | undefined,
  ): Promise<Record<string, Json>> {
    let response;
    try {
      response = await sendCommand({
        socketPath,
        method: 'sendTransaction',
        params,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    } catch (error) {
      this.error(makeDaemonConnectionError(error));
    }

    if (isJsonRpcFailure(response)) {
      this.error(formatJsonRpcError(response.error));
    }

    return response.result as Record<string, Json>;
  }
}

/**
 * Read a string field off a JSON-RPC result record, tolerating a missing or
 * non-string value so output never crashes on an unexpected payload shape.
 *
 * @param result - The JSON-RPC result record.
 * @param key - The field to read.
 * @returns The field as a string, or `'(unknown)'` if absent/non-string.
 */
function stringField(result: Record<string, Json>, key: string): string {
  const value = result[key];
  return typeof value === 'string' ? value : '(unknown)';
}

/**
 * Format a dry-run plan for display (and as the confirmation prompt body).
 *
 * @param plan - The dry-run result returned by the daemon.
 * @param etherAmount - The original `--value` (ether), shown alongside the
 * resolved wei so the user sees the human amount they typed.
 * @returns A multi-line summary of the transaction to be sent.
 */
function formatPlan(plan: Record<string, Json>, etherAmount: string): string {
  return [
    'About to send:',
    `  To:      ${stringField(plan, 'to')}`,
    `  From:    ${stringField(plan, 'from')}`,
    `  Value:   ${etherAmount} ETH (${stringField(plan, 'value')} wei)`,
    `  Network: ${stringField(plan, 'networkClientId')}`,
  ].join('\n');
}
