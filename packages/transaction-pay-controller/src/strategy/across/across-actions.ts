import { Interface } from '@ethersproject/abi';
import type { TransactionDescription } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';

import type { AcrossAction, AcrossActionArg } from './types';
import type { QuoteRequest } from '../../types';

export const TOKEN_TRANSFER_SIGNATURE =
  'function transfer(address to, uint256 value)';
export const CREATE_PROXY_SIGNATURE =
  'function createProxy(address paymentToken, uint256 payment, address payable paymentReceiver, (uint8 v, bytes32 r, bytes32 s) createSig)';
export const SAFE_EXEC_TRANSACTION_SIGNATURE =
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)';

export const UNSUPPORTED_DESTINATION_ERROR =
  'Across only supports transfer-style destination flows at the moment';

export type AcrossDestinationCall = {
  data: Hex;
  target?: Hex;
};

type AcrossActionDefinition = {
  functionSignature: string;
  getArg?: (
    arg: unknown,
    argIndex: number,
    request: QuoteRequest,
  ) => AcrossActionArg | undefined;
  getTarget: (call: AcrossDestinationCall, request: QuoteRequest) => Hex;
  interface: Interface;
  methodName: string;
};

type ParsedAcrossActionCall = {
  definition: AcrossActionDefinition;
  transaction: TransactionDescription;
};

type BigNumberLike = {
  _isBigNumber: true;
  toString: () => string;
};

const TOKEN_TRANSFER_INTERFACE = new Interface([TOKEN_TRANSFER_SIGNATURE]);
const CREATE_PROXY_INTERFACE = new Interface([CREATE_PROXY_SIGNATURE]);
const SAFE_EXEC_TRANSACTION_INTERFACE = new Interface([
  SAFE_EXEC_TRANSACTION_SIGNATURE,
]);

const ACROSS_ACTION_DEFINITIONS: AcrossActionDefinition[] = [
  {
    functionSignature: TOKEN_TRANSFER_SIGNATURE,
    getArg: (_arg, argIndex, request) =>
      argIndex === 1
        ? {
            balanceSourceToken: request.targetTokenAddress,
            populateDynamically: true,
            value: '0',
          }
        : undefined,
    getTarget: (call, request) => call.target ?? request.targetTokenAddress,
    interface: TOKEN_TRANSFER_INTERFACE,
    methodName: 'transfer',
  },
  {
    functionSignature: CREATE_PROXY_SIGNATURE,
    getTarget: (call) => getRequiredTarget(call),
    interface: CREATE_PROXY_INTERFACE,
    methodName: 'createProxy',
  },
  {
    functionSignature: SAFE_EXEC_TRANSACTION_SIGNATURE,
    getTarget: (call) => getRequiredTarget(call),
    interface: SAFE_EXEC_TRANSACTION_INTERFACE,
    methodName: 'execTransaction',
  },
];

export function buildAcrossActionFromCall(
  call: AcrossDestinationCall,
  request: QuoteRequest,
): AcrossAction {
  const parsedCall = parseAcrossActionCall(call.data);

  return {
    args: Array.from(parsedCall.transaction.args).map((arg, argIndex) => {
      const customArg = parsedCall.definition.getArg?.(arg, argIndex, request);

      if (customArg) {
        return customArg;
      }

      return {
        populateDynamically: false,
        value: serializeAcrossActionValue(arg),
      };
    }),
    functionSignature: parsedCall.definition.functionSignature,
    isNativeTransfer: false,
    target: parsedCall.definition.getTarget(call, request),
    value: '0',
  };
}

export function getTransferRecipient(data: Hex): Hex {
  const parsedCall = parseAcrossActionCall(data);

  if (parsedCall.definition.methodName !== 'transfer') {
    throw new Error(UNSUPPORTED_DESTINATION_ERROR);
  }

  return normalizeHexString(String(parsedCall.transaction.args[0])) as Hex;
}

export function isExtractableOutputTokenTransferCall(
  call: AcrossDestinationCall,
  request: QuoteRequest,
): boolean {
  const parsedCall = tryParseAcrossActionCall(call.data);

  return (
    parsedCall?.definition.methodName === 'transfer' &&
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
    throw new Error(UNSUPPORTED_DESTINATION_ERROR);
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

function tryParseAcrossActionCall(
  data: Hex,
): ParsedAcrossActionCall | undefined {
  for (const definition of ACROSS_ACTION_DEFINITIONS) {
    try {
      return {
        definition,
        transaction: definition.interface.parseTransaction({ data }),
      };
    } catch {
      // Intentionally empty.
    }
  }

  return undefined;
}
