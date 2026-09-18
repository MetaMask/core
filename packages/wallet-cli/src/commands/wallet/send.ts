import { is } from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';
import { bigIntToHex, isJsonRpcFailure, toWei } from '@metamask/utils';
import type { Hex, Json, JsonRpcParams } from '@metamask/utils';
import { Command, Flags } from '@oclif/core';

import { sendCommand } from '../../daemon/daemon-client.js';
import { getDaemonPaths } from '../../daemon/paths.js';
import { confirmSend } from '../../daemon/prompts.js';
import {
  SendTransactionBroadcastResultStruct,
  SendTransactionDryRunResultStruct,
} from '../../daemon/send-transaction.js';
import type { SendTransactionDryRunResult } from '../../daemon/send-transaction.js';
import {
  emptyToUndefined,
  formatJsonRpcError,
  makeDaemonConnectionError,
} from '../../daemon/utils.js';

const ETHER_DECIMALS = 18;

/**
 * Fallback response timeout (ms) for the broadcast call. Broadcasting waits for
 * signing and `eth_sendRawTransaction` server-side, which can far outlast the
 * 30s default used for cheap RPCs; too short a timeout would make a slow but
 * successful send look like a failure and tempt a duplicate re-send.
 * `--timeout` overrides it.
 */
const BROADCAST_TIMEOUT_MS = 120_000;

/**
 * The transaction fields shown in the confirmation preview that the daemon
 * does not echo back (they are the raw `--data` / gas overrides the user
 * passed, so the CLI supplies them for display).
 */
type PlanExtras = {
  data?: string | undefined;
  gas?: string | undefined;
  maxFeePerGas?: string | undefined;
  maxPriorityFeePerGas?: string | undefined;
  gasPrice?: string | undefined;
};

/**
 * Convert a decimal ether amount to a `0x`-prefixed wei quantity.
 *
 * The fixed-point conversion is delegated to `@metamask/utils`' `toWei` rather
 * than re-deriving the wei math here. The daemon's `sendTransaction` boundary
 * expects canonical hex wei; this is where the human-friendly `--value` (ether)
 * is turned into it.
 *
 * `toWei` silently accepts negatives and throws opaque messages on other
 * malformed input, so the value is guarded up front for a clear error and a
 * strictly non-negative amount.
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
    'Estimates gas automatically unless overridden, signs, broadcasts, and ' +
    'prints the resulting transaction hash. The daemon auto-approves, so the ' +
    'confirmation boundary is this command.';

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

    // Everything except the network selector. The selector is added per call:
    // a confirmed broadcast pins the `networkClientId` the preview resolved
    // rather than re-sending `--chain-id` and re-resolving it.
    const baseParams: Record<string, Json> = {
      to: flags.to,
      value,
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
    // Exactly one selector is defined (guarded above); guard each spread by its
    // own `undefined` check so the object never carries an `undefined` value.
    const params: Record<string, Json> = {
      ...baseParams,
      ...(networkClientId === undefined ? {} : { networkClientId }),
      ...(chainId === undefined ? {} : { chainId }),
    };
    const planExtras: PlanExtras = {
      data: flags.data,
      gas: flags.gas,
      maxFeePerGas: flags['max-fee-per-gas'],
      maxPriorityFeePerGas: flags['max-priority-fee-per-gas'],
      gasPrice: flags['gas-price'],
    };

    const { socketPath } = getDaemonPaths(this.config.dataDir);
    const timeoutMs = flags.timeout;

    // A `dryRun` resolves the sender and network client server-side without
    // broadcasting. `--dry-run` stops after previewing; an interactive run
    // previews first so the confirmation shows (and then pins) the resolved
    // sender/network; `--yes` skips straight to the broadcast.
    if (flags['dry-run']) {
      const preview = await this.#dispatchSend({
        socketPath,
        params: { ...params, dryRun: true },
        timeoutMs,
        struct: SendTransactionDryRunResultStruct,
        broadcast: false,
      });
      this.log(formatPlan(preview, flags.value, planExtras));
      return;
    }

    let resolved: SendTransactionDryRunResult | undefined;
    if (!flags.yes) {
      const preview = await this.#dispatchSend({
        socketPath,
        params: { ...params, dryRun: true },
        timeoutMs,
        struct: SendTransactionDryRunResultStruct,
        broadcast: false,
      });

      let confirmed: boolean;
      try {
        confirmed = await confirmSend(
          formatPlan(preview, flags.value, planExtras),
        );
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
      resolved = preview;
    }

    // Broadcast the exact sender/network the user reviewed (when they confirmed
    // a preview), so what is signed matches what was shown. `--yes` skips the
    // preview, so there it re-resolves server-side from `params`.
    const broadcastParams: Record<string, Json> = resolved
      ? {
          ...baseParams,
          from: resolved.from,
          networkClientId: resolved.networkClientId,
        }
      : params;

    const result = await this.#dispatchSend({
      socketPath,
      params: broadcastParams,
      timeoutMs: timeoutMs ?? BROADCAST_TIMEOUT_MS,
      struct: SendTransactionBroadcastResultStruct,
      broadcast: true,
    });
    this.log('Transaction broadcast.');
    this.log(`Hash:   ${result.transactionHash}`);
    this.log(`Id:     ${result.transactionId}`);
    this.log(`Status: ${result.status}`);
  }

  /**
   * Send a `sendTransaction` RPC to the daemon and return its validated result,
   * translating connection errors, broadcast timeouts, JSON-RPC failures, and
   * unexpected payloads into command errors.
   *
   * @param options - Dispatch options.
   * @param options.socketPath - The daemon Unix socket path.
   * @param options.params - The `sendTransaction` params (with or without
   * `dryRun`).
   * @param options.timeoutMs - Optional response timeout in milliseconds.
   * @param options.struct - Struct the `result` payload must satisfy; the
   * return type is inferred from it.
   * @param options.broadcast - Whether this is the real (fund-moving) broadcast.
   * When true, a read timeout is reported with guidance that the send may
   * already be in flight, so the user does not blindly re-send.
   * @returns The validated `result` payload.
   */
  async #dispatchSend<Value>(options: {
    socketPath: string;
    params: JsonRpcParams;
    timeoutMs: number | undefined;
    struct: Struct<Value>;
    broadcast: boolean;
  }): Promise<Value> {
    const { socketPath, params, timeoutMs, struct, broadcast } = options;
    let response;
    try {
      response = await sendCommand({
        socketPath,
        method: 'sendTransaction',
        params,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    } catch (error) {
      if (broadcast && isReadTimeout(error)) {
        this.error(broadcastTimeoutMessage());
      }
      this.error(makeDaemonConnectionError(error));
    }

    if (isJsonRpcFailure(response)) {
      this.error(formatJsonRpcError(response.error));
    }

    const { result } = response;
    if (!is(result, struct)) {
      this.error(
        `The daemon returned an unexpected ${broadcast ? 'send' : 'dry-run'} ` +
          'result. It may be running an incompatible version.',
      );
    }
    return result;
  }
}

/**
 * Whether an error is the daemon-client socket read timeout. It carries no
 * errno code, so its message is the only signal.
 *
 * @param error - The caught value.
 * @returns True if it is the read timeout.
 */
function isReadTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === 'Socket read timed out';
}

/**
 * The message shown when the broadcast call times out. A send is not
 * idempotent, and the daemon may still be broadcasting after the client gives
 * up waiting, so this warns against a blind re-run rather than reading as a
 * plain connection failure.
 *
 * @returns The user-facing guidance.
 */
function broadcastTimeoutMessage(): string {
  return (
    'The daemon did not respond in time, but your transaction may still be ' +
    'broadcasting. Do NOT re-run this command — you could send it twice. ' +
    'Check `mm daemon status`, the daemon log, or your account on-chain to ' +
    'confirm, then use --timeout to wait longer if needed.'
  );
}

/**
 * Format a dry-run plan for display (and as the confirmation prompt body).
 *
 * @param plan - The dry-run result returned by the daemon.
 * @param etherAmount - The original `--value` (ether), shown alongside the
 * resolved wei so the user sees the human amount they typed.
 * @param extras - The `--data` / gas overrides the daemon does not echo back,
 * shown so the user confirms exactly what will be sent.
 * @returns A multi-line summary of the transaction to be sent.
 */
function formatPlan(
  plan: SendTransactionDryRunResult,
  etherAmount: string,
  extras: PlanExtras,
): string {
  const lines = [
    'About to send:',
    `  To:      ${plan.to}`,
    `  From:    ${plan.from}`,
    `  Value:   ${etherAmount} ETH (${plan.value} wei)`,
    `  Network: ${plan.networkClientId}`,
  ];
  if (extras.data) {
    lines.push(`  Data:    ${extras.data}`);
  }
  const gasParts = [
    extras.gas ? `gas=${extras.gas}` : undefined,
    extras.maxFeePerGas ? `maxFeePerGas=${extras.maxFeePerGas}` : undefined,
    extras.maxPriorityFeePerGas
      ? `maxPriorityFeePerGas=${extras.maxPriorityFeePerGas}`
      : undefined,
    extras.gasPrice ? `gasPrice=${extras.gasPrice}` : undefined,
  ].filter((part): part is string => part !== undefined);
  if (gasParts.length > 0) {
    lines.push(`  Gas:     ${gasParts.join(', ')}`);
  }
  return lines.join('\n');
}
