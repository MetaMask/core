import { Interface } from '@ethersproject/abi';
import type { TransactionDescription } from '@ethersproject/abi';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { QuoteRequest } from '../../types';
import { isSupportedAcrossPerpsDepositRequest } from './perps';
import type { AcrossAction, AcrossActionArg } from './types';

export const TOKEN_TRANSFER_SIGNATURE =
  'function transfer(address to, uint256 value)';
export const CREATE_PROXY_SIGNATURE =
  'function createProxy(address paymentToken, uint256 payment, address payable paymentReceiver, (uint8 v, bytes32 r, bytes32 s) createSig)';
export const SAFE_EXEC_TRANSACTION_SIGNATURE =
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)';

export const UNSUPPORTED_DESTINATION_ERROR =
  'Across only supports direct token transfers and a limited set of post-swap destination actions at the moment';

export type AcrossDestinationCall = {
  data: Hex;
  target?: Hex;
};

export type AcrossDestination = {
  actions: AcrossAction[];
  recipient: Hex;
};

type ParsedAcrossActionCall = {
  functionSignature: string;
  transaction: TransactionDescription;
};

type BigNumberLike = {
  _isBigNumber: true;
  toString: () => string;
};

const ACROSS_ACTION_SIGNATURES = [
  CREATE_PROXY_SIGNATURE,
  SAFE_EXEC_TRANSACTION_SIGNATURE,
];

export function buildAcrossActionFromCall(
  call: AcrossDestinationCall,
  request: QuoteRequest,
): AcrossAction {
  if (isTransferCall(call.data)) {
    return buildAcrossTransferAction(call, request);
  }

  const parsedCall = parseAcrossActionCall(call.data);

  return {
    args: Array.from(parsedCall.transaction.args).map((arg) => ({
      populateDynamically: false,
      value: serializeAcrossActionValue(arg),
    })),
    functionSignature: parsedCall.functionSignature,
    isNativeTransfer: false,
    target: getRequiredTarget(call),
    value: '0',
  };
}

export function getTransferRecipient(data: Hex): Hex {
  const parsedCall = tryParseTransferCall(data);

  if (!parsedCall) {
    throw new Error(getUnsupportedDestinationErrorMessage(data));
  }

  return normalizeHexString(String(parsedCall.args[0])) as Hex;
}

export function getAcrossDestination(
  transaction: TransactionMeta,
  request: QuoteRequest,
): AcrossDestination {
  if (isSupportedAcrossPerpsDepositRequest(request, transaction.type)) {
    return {
      actions: [],
      recipient: request.from,
    };
  }

  const { from } = request;
  const destinationCalls = getDestinationCalls(transaction);
  const swapRecipientTransferCallIndex = destinationCalls.findIndex((call) =>
    isExtractableOutputTokenTransferCall(call, request),
  );
  const callsForActions = [...destinationCalls];
  let recipient = from;

  if (swapRecipientTransferCallIndex !== -1) {
    const [swapRecipientTransferCall] = callsForActions.splice(
      swapRecipientTransferCallIndex,
      1,
    );

    recipient = getTransferRecipient(swapRecipientTransferCall.data);
  }

  return {
    actions: callsForActions.map((call) =>
      buildAcrossActionFromCall(call, request),
    ),
    recipient,
  };
}

export function isExtractableOutputTokenTransferCall(
  call: AcrossDestinationCall,
  request: QuoteRequest,
): boolean {
  return (
    isTransferCall(call.data) &&
    (call.target === undefined ||
      normalizeHexString(call.target) ===
        normalizeHexString(request.targetTokenAddress))
  );
}

function getRequiredTarget(call: AcrossDestinationCall): Hex {
  if (!call.target) {
    throw new Error(UNSUPPORTED_DESTINATION_ERROR);
  }

  return call.target;
}

function normalizeHexString(value: string): string {
  /* istanbul ignore next: current supported Across action signatures only emit hex strings here. */
  if (!value.startsWith('0x')) {
    return value;
  }

  return value.toLowerCase();
}

function parseAcrossActionCall(data: Hex): ParsedAcrossActionCall {
  const parsedCall = tryParseAcrossActionCall(data);

  if (!parsedCall) {
    throw new Error(getUnsupportedDestinationErrorMessage(data));
  }

  return parsedCall;
}

function serializeAcrossActionValue(value: unknown): AcrossActionArg['value'] {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      serializeAcrossActionScalar(entry),
    ) as AcrossActionArg['value'];
  }

  return serializeAcrossActionScalar(value);
}

function buildAcrossTransferAction(
  call: AcrossDestinationCall,
  request: QuoteRequest,
): AcrossAction {
  return {
    args: [
      {
        populateDynamically: false,
        value: getTransferRecipient(call.data),
      },
      {
        balanceSourceToken: request.targetTokenAddress,
        populateDynamically: true,
        value: '0',
      },
    ],
    functionSignature: TOKEN_TRANSFER_SIGNATURE,
    isNativeTransfer: false,
    target: call.target ?? request.targetTokenAddress,
    value: '0',
  };
}

function getDestinationCalls(
  transaction: TransactionMeta,
): AcrossDestinationCall[] {
  const nestedCalls = (
    transaction.nestedTransactions ?? []
  ).flatMap<AcrossDestinationCall>((nestedTx: { data?: Hex; to?: Hex }) =>
    nestedTx.data !== undefined && nestedTx.data !== '0x'
      ? [{ data: nestedTx.data, target: nestedTx.to }]
      : [],
  );

  if (nestedCalls.length > 0) {
    return nestedCalls;
  }

  const data = transaction.txParams?.data as Hex | undefined;

  if (data === undefined || data === '0x') {
    return [];
  }

  return [
    {
      data,
      target: transaction.txParams?.to as Hex | undefined,
    },
  ];
}

function getUnsupportedDestinationErrorMessage(data?: Hex): string {
  const selector = getDestinationSelector(data);

  return selector
    ? `${UNSUPPORTED_DESTINATION_ERROR}. Destination selector: ${selector}`
    : UNSUPPORTED_DESTINATION_ERROR;
}

function getDestinationSelector(data?: Hex): Hex | undefined {
  if (!data || data.length < 10) {
    return undefined;
  }

  return data.slice(0, 10).toLowerCase() as Hex;
}

function serializeAcrossActionScalar(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeHexString(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (isBigNumberLike(value)) {
    return value.toString();
  }

  /* istanbul ignore next: supported Across action ABIs only decode scalars and tuples of scalars. */
  throw new Error(UNSUPPORTED_DESTINATION_ERROR);
}

function isBigNumberLike(value: unknown): value is BigNumberLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_isBigNumber' in value &&
    value._isBigNumber === true &&
    'toString' in value &&
    typeof value.toString === 'function'
  );
}

function isTransferCall(data: Hex): boolean {
  return tryParseTransferCall(data) !== undefined;
}

function tryParseAcrossActionCall(
  data: Hex,
): ParsedAcrossActionCall | undefined {
  for (const functionSignature of ACROSS_ACTION_SIGNATURES) {
    try {
      const actionInterface = new Interface([functionSignature]);

      return {
        functionSignature,
        transaction: actionInterface.parseTransaction({ data }),
      };
    } catch {
      // Intentionally empty.
    }
  }

  return undefined;
}

function tryParseTransferCall(data: Hex): TransactionDescription | undefined {
  try {
    return new Interface([TOKEN_TRANSFER_SIGNATURE]).parseTransaction({ data });
  } catch {
    return undefined;
  }
}
