import { successfulFetch } from '@metamask/controller-utils';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_ARBITRUM } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { RELAY_AUTHORIZE_URL, HYPERLIQUID_EXCHANGE_URL } from './constants';
import type { RelayQuote, RelaySignatureStep } from './types';

const log = createModuleLogger(projectLogger, 'hyperliquid-withdraw');

type EIP712DomainField = { name: string; type: string };

const DOMAIN_FIELD_MAP: Record<string, EIP712DomainField> = {
  name: { name: 'name', type: 'string' },
  version: { name: 'version', type: 'string' },
  chainId: { name: 'chainId', type: 'uint256' },
  verifyingContract: { name: 'verifyingContract', type: 'address' },
  salt: { name: 'salt', type: 'bytes32' },
};

/**
 * Submit a HyperLiquid 2-step withdrawal via Relay.
 *
 * Step 1 (authorize): Sign an EIP-712 nonce-mapping message, POST to Relay /authorize.
 * Step 2 (deposit): Sign an EIP-712 HyperliquidSignTransaction, POST to HyperLiquid exchange.
 *
 * Both signatures are silent (no user confirmation). Both steps share the same nonce
 * from the Relay quote response.
 *
 * @param quote - Relay quote containing the 2-step flow.
 * @param from - User's account address.
 * @param messenger - Controller messenger (for KeyringController:signTypedMessage).
 */
export async function submitHyperliquidWithdraw(
  quote: TransactionPayQuote<RelayQuote>,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { steps } = quote.original;

  log('Starting HyperLiquid withdrawal', {
    stepCount: steps.length,
    stepIds: steps.map((step) => step.id),
  });

  const authorizeStep = steps.find(
    (step) => step.kind === 'signature' && step.id === 'authorize',
  ) as RelaySignatureStep | undefined;

  const depositStep = steps.find((step) => step.id === 'deposit');

  if (!authorizeStep || !depositStep) {
    throw new Error(
      `Expected authorize and deposit steps for HyperLiquid withdrawal, got: ${steps.map((step) => `${step.id}(${step.kind})`).join(', ')}`,
    );
  }

  // Step 1: Authorize (nonce-mapping signature -> POST to Relay /authorize)
  await executeAuthorizeStep(authorizeStep, from, messenger);

  // Step 2: Deposit (HyperLiquid sendAsset -> POST to HyperLiquid exchange)
  await executeDepositStep(depositStep, from, messenger);

  log('HyperLiquid withdrawal submitted successfully');
}

/**
 * Derive the EIP712Domain type array from a domain object.
 * eth-sig-util defaults to EIP712Domain: [] when absent, breaking
 * the domain separator hash. This ensures it matches ethers.js behavior.
 *
 * @param domain - The EIP-712 domain object.
 * @returns The EIP712Domain type array in canonical order.
 */
function deriveEIP712DomainType(
  domain: Record<string, unknown>,
): EIP712DomainField[] {
  return Object.keys(DOMAIN_FIELD_MAP)
    .filter((key) => key in domain)
    .map((key) => DOMAIN_FIELD_MAP[key]);
}

/**
 * Execute the authorize step: sign EIP-712 nonce-mapping and POST to Relay.
 *
 * @param step - The authorize signature step from the Relay quote.
 * @param from - User's account address.
 * @param messenger - Controller messenger for signing.
 */
async function executeAuthorizeStep(
  step: RelaySignatureStep,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  if (step.items.length !== 1) {
    throw new Error(
      `Expected exactly 1 authorize item, got ${step.items.length}`,
    );
  }

  const item = step.items[0];
  if (!item) {
    throw new Error('Authorize step has no items');
  }

  const { sign, post } = item.data;

  const typedData = {
    domain: sign.domain,
    types: {
      ...sign.types,
      EIP712Domain: deriveEIP712DomainType(sign.domain),
    },
    primaryType: sign.primaryType,
    message: sign.value,
  };

  log('Signing authorize (nonce-mapping)', { domain: sign.domain });

  const signature = await messenger.call(
    'KeyringController:signTypedMessage',
    {
      from,
      data: JSON.stringify(typedData),
    },
    SignTypedDataVersion.V4,
  );

  log('Posting authorize signature to Relay');

  const authorizeUrl = `${RELAY_AUTHORIZE_URL}?signature=${signature}`;

  try {
    const response = await successfulFetch(authorizeUrl, {
      method: post.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(post.body),
    });

    const result = await response.json();

    log('Authorize response', result);
  } catch (error) {
    throw new Error(
      `HyperLiquid authorize failed: ${(error as Error).message}`,
    );
  }
}

/**
 * Execute the deposit step: sign HyperLiquid sendAsset and POST to HL exchange.
 *
 * The signature data must be constructed from the step's eip712Types and action
 * parameters, following the Relay HyperLiquid integration spec.
 *
 * @param step - The deposit step from the Relay quote.
 * @param from - User's account address.
 * @param messenger - Controller messenger for signing.
 */
async function executeDepositStep(
  step: RelaySignatureStep | { id: string; kind: string; items: unknown[] },
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const items = step.items as { data: Record<string, unknown> }[];

  if (items.length !== 1) {
    throw new Error(`Expected exactly 1 deposit item, got ${items.length}`);
  }

  const item = items[0];
  if (!item) {
    throw new Error('Deposit step has no items');
  }

  const { data } = item;

  const action = data.action as {
    type: string;
    parameters: Record<string, unknown>;
  };
  const nonce = data.nonce as number;
  const eip712Types = data.eip712Types as Record<string, unknown>;
  const eip712PrimaryType = data.eip712PrimaryType as string;

  // HyperLiquid's EIP-712 signing spec requires Arbitrum's chain ID in the
  // domain and message. This does not affect which chain the withdrawal
  // targets — the destination chain is determined by the Relay quote.
  const chainId = Number(CHAIN_ID_ARBITRUM);

  const domain = {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };

  const signatureData = {
    domain,
    types: {
      ...eip712Types,
      EIP712Domain: deriveEIP712DomainType(domain),
    },
    primaryType: eip712PrimaryType,
    message: {
      ...action.parameters,
      type: action.type,
      signatureChainId: `0x${chainId.toString(16)}`,
    },
  };

  log('Signing HyperLiquid deposit (sendAsset)', {
    nonce,
    action: action.type,
  });

  const signature = await messenger.call(
    'KeyringController:signTypedMessage',
    {
      from,
      data: JSON.stringify(signatureData),
    },
    SignTypedDataVersion.V4,
  );

  // eslint-disable-next-line id-length
  const r = signature.slice(0, 66);
  // eslint-disable-next-line id-length
  const s = `0x${signature.slice(66, 130)}`;
  // eslint-disable-next-line id-length
  const v = parseInt(signature.slice(130, 132), 16);

  log('Posting deposit to HyperLiquid exchange');

  let result: unknown;

  try {
    const response = await successfulFetch(HYPERLIQUID_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: {
          ...action.parameters,
          type: action.type,
          signatureChainId: `0x${chainId.toString(16)}`,
        },
        nonce,
        signature: { r, s, v },
      }),
    });

    result = await response.json();
  } catch (error) {
    throw new Error(`HyperLiquid deposit failed: ${(error as Error).message}`);
  }

  if ((result as { status?: string })?.status !== 'ok') {
    throw new Error(`HyperLiquid deposit failed: ${JSON.stringify(result)}`);
  }

  log('HyperLiquid deposit response', result);
}
