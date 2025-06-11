import type { LogDescription } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';
import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { type Hex } from '@metamask/utils';

import type { GetBalanceChangesRequest } from './balance-changes';
import { getBalanceChanges, SupportedToken } from './balance-changes';
import type {
  SimulationResponseLog,
  SimulationResponseTransaction,
} from '../api/simulation-api';
import {
  simulateTransactions,
  type SimulationResponse,
} from '../api/simulation-api';
import {
  SimulationInvalidResponseError,
  SimulationRevertedError,
} from '../errors';
import { SimulationErrorCode, SimulationTokenStandard } from '../types';

jest.mock('../api/simulation-api');

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

// Utility function to encode addresses and values to 32-byte ABI format
const encodeTo32ByteHex = (value: string | number): Hex => {
  // Pad to 32 bytes (64 characters) and add '0x' prefix
  return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
};

// getSimulationData returns values in hex format with leading zeros trimmed.
const trimLeadingZeros = (hexString: Hex): Hex => {
  const trimmed = hexString.replace(/^0x0+/u, '0x') as Hex;
  return trimmed === '0x' ? '0x0' : trimmed;
};

const USER_ADDRESS_MOCK = '0x1233333333333333333333333333333333333333' as Hex;
const OTHER_ADDRESS_MOCK = '0x4566666666666666666666666666666666666666' as Hex;
const CONTRACT_ADDRESS_1_MOCK =
  '0x7899999999999999999999999999999999999999' as Hex;
const CONTRACT_ADDRESS_2_MOCK =
  '0xDEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' as Hex;
const BALANCE_1_MOCK = '0x0' as Hex;
const BALANCE_2_MOCK = '0x1' as Hex;
const DIFFERENCE_MOCK = '0x1' as Hex;
const VALUE_MOCK = '0x4' as Hex;
const TOKEN_ID_MOCK = '0x5' as Hex;
const OTHER_TOKEN_ID_MOCK = '0x6' as Hex;
const ERROR_CODE_MOCK = 123;
const ERROR_MESSAGE_MOCK = 'Test Error';

// Regression test – leading zero in user address
const USER_ADDRESS_WITH_LEADING_ZERO =
  '0x0012333333333333333333333333333333333333' as Hex;

const REQUEST_MOCK: GetBalanceChangesRequest = {
  chainId: '0x1',
  ethQuery: {
    sendAsync: jest.fn(),
  } as EthQuery,
  txParams: {
    data: '0x123',
    from: USER_ADDRESS_MOCK,
    gas: '0xaaa',
    maxFeePerGas: '0xbbb',
    maxPriorityFeePerGas: '0xabc',
    value: '0xddd',
  },
};

const PARSED_ERC20_TRANSFER_EVENT_MOCK = {
  name: 'Transfer',
  contractAddress: CONTRACT_ADDRESS_2_MOCK,
  args: [
    USER_ADDRESS_MOCK,
    OTHER_ADDRESS_MOCK,
    { toHexString: () => VALUE_MOCK },
  ],
} as unknown as LogDescription;

const PARSED_ERC721_TRANSFER_EVENT_MOCK = {
  name: 'Transfer',
  contractAddress: CONTRACT_ADDRESS_1_MOCK,
  args: [
    OTHER_ADDRESS_MOCK,
    USER_ADDRESS_MOCK,
    { toHexString: () => TOKEN_ID_MOCK },
  ],
} as unknown as LogDescription;

const PARSED_ERC1155_TRANSFER_SINGLE_EVENT_MOCK = {
  name: 'TransferSingle',
  contractAddress: CONTRACT_ADDRESS_1_MOCK,
  args: [
    OTHER_ADDRESS_MOCK,
    OTHER_ADDRESS_MOCK,
    USER_ADDRESS_MOCK,
    { toHexString: () => TOKEN_ID_MOCK },
    { toHexString: () => VALUE_MOCK },
  ],
} as unknown as LogDescription;

const PARSED_ERC1155_TRANSFER_BATCH_EVENT_MOCK = {
  name: 'TransferBatch',
  contractAddress: CONTRACT_ADDRESS_1_MOCK,
  args: [
    OTHER_ADDRESS_MOCK,
    OTHER_ADDRESS_MOCK,
    USER_ADDRESS_MOCK,
    [{ toHexString: () => TOKEN_ID_MOCK }],
    [{ toHexString: () => VALUE_MOCK }],
  ],
} as unknown as LogDescription;

const PARSED_WRAPPED_ERC20_DEPOSIT_EVENT_MOCK = {
  name: 'Deposit',
  contractAddress: CONTRACT_ADDRESS_1_MOCK,
  args: [USER_ADDRESS_MOCK, { toHexString: () => VALUE_MOCK }],
} as unknown as LogDescription;

const defaultResponseTx: SimulationResponseTransaction = {
  return: encodeTo32ByteHex('0x0'),
  callTrace: { calls: [], logs: [] },
  stateDiff: { pre: {}, post: {} },
};

const RESPONSE_NESTED_LOGS_MOCK: SimulationResponse = {
  transactions: [
    {
      ...defaultResponseTx,
      callTrace: {
        calls: [
          {
            calls: [
              {
                calls: [],
                logs: [createLogMock(CONTRACT_ADDRESS_1_MOCK)],
              },
            ],
            logs: [],
          },
        ],
        logs: [],
      },
    },
  ],
};

/**
 * Create a mock of a raw log emitted by a simulated transaction.
 *
 * @param contractAddress - The contract address.
 * @returns The raw log mock.
 */
function createLogMock(contractAddress: string) {
  return {
    address: contractAddress,
  } as unknown as SimulationResponseLog;
}

/**
 * Create a mock simulation API response to include event logs.
 *
 * @param logs - The logs.
 * @returns Mock API response.
 */
function createEventResponseMock(
  logs: SimulationResponseLog[],
): SimulationResponse {
  return {
    transactions: [{ ...defaultResponseTx, callTrace: { calls: [], logs } }],
  };
}

/**
 * Create a mock API response for a native balance change.
 *
 * @param previousBalance - The previous balance.
 * @param newBalance - The new balance.
 * @param gasCost - Gas cost of the transaction.
 * @returns Mock API response.
 */
function createNativeBalanceResponse(
  previousBalance: string,
  newBalance: string,
  gasCost: number = 0,
) {
  return {
    transactions: [
      {
        ...defaultResponseTx,
        return: encodeTo32ByteHex(previousBalance),
        gasCost,
        stateDiff: {
          pre: {
            [USER_ADDRESS_MOCK]: { balance: previousBalance },
          },
          post: {
            [USER_ADDRESS_MOCK]: { balance: newBalance },
          },
        },
      },
    ],
  } as unknown as SimulationResponse;
}

/**
 * Create a mock API response for a token balance balanceOf request.
 *
 * @param previousBalances - The previous balance.
 * @param newBalances - The new balance.
 * @returns Mock API response.
 */
function createBalanceOfResponse(
  previousBalances: string[],
  newBalances: string[],
) {
  return {
    transactions: [
      ...previousBalances.map((previousBalance) => ({
        ...defaultResponseTx,
        return: encodeTo32ByteHex(previousBalance),
      })),
      defaultResponseTx,
      ...newBalances.map((newBalance) => ({
        ...defaultResponseTx,
        return: encodeTo32ByteHex(newBalance),
      })),
    ],
  } as unknown as SimulationResponse;
}

/**
 * Mock the parsing of raw logs by the token ABIs.
 *
 * @param options - The options to mock the parsing of logs.
 * @param options.erc20 - The parsed event with the ERC-20 ABI.
 * @param options.erc721 - The parsed event with the ERC-721 ABI.
 * @param options.erc1155 - The parsed event with the ERC-1155 ABI.
 * @param options.erc20Wrapped - The parsed event with the wrapped ERC-20 ABI.
 * @param options.erc721Legacy - The parsed event with the legacy ERC-721 ABI.
 */
function mockParseLog({
  erc20,
  erc721,
  erc1155,
  erc20Wrapped,
  erc721Legacy,
}: {
  erc20?: LogDescription;
  erc721?: LogDescription;
  erc1155?: LogDescription;
  erc20Wrapped?: LogDescription;
  erc721Legacy?: LogDescription;
}) {
  const parseLogMock = jest.spyOn(Interface.prototype, 'parseLog');

  for (const value of [erc20, erc721, erc1155, erc20Wrapped, erc721Legacy]) {
    if (value) {
      parseLogMock.mockReturnValueOnce(value);
      return;
    }

    parseLogMock.mockImplementationOnce(() => {
      throw new Error();
    });
  }
}

describe('Simulation Utils', () => {
  const simulateTransactionsMock = jest.mocked(simulateTransactions);
  const queryMock = jest.mocked(query);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Interface.prototype, 'encodeFunctionData').mockReturnValue('');
    queryMock.mockResolvedValue('0xFFFFFFFFFFFF');
  });

  describe('getBalanceChanges', () => {
    describe('returns native balance change', () => {
      it.each([
        ['increased', BALANCE_1_MOCK, BALANCE_2_MOCK, false],
        ['decreased', BALANCE_2_MOCK, BALANCE_1_MOCK, true],
      ])(
        'when balance %s',
        async (_title, previousBalance, newBalance, isDecrease) => {
          simulateTransactionsMock.mockResolvedValueOnce(
            createNativeBalanceResponse(previousBalance, newBalance),
          );

          const result = await getBalanceChanges(REQUEST_MOCK);

          expect(result).toStrictEqual({
            nativeBalanceChange: {
              difference: DIFFERENCE_MOCK,
              isDecrease,
              newBalance,
              previousBalance,
            },
            tokenBalanceChanges: [],
          });
        },
      );

      it('unless balance is unchanged', async () => {
        simulateTransactionsMock.mockResolvedValueOnce(
          createNativeBalanceResponse(BALANCE_1_MOCK, BALANCE_1_MOCK),
        );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [],
        });
      });

      it('ignoring gas cost', async () => {
        simulateTransactionsMock.mockResolvedValueOnce(
          createNativeBalanceResponse('0x3', '0x8', 2),
        );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: {
            difference: '0x7',
            isDecrease: false,
            newBalance: '0xa',
            previousBalance: '0x3',
          },
          tokenBalanceChanges: [],
        });
      });
    });

    describe('returns token balance changes', () => {
      it.each([
        {
          title: 'ERC-20 token',
          from: USER_ADDRESS_MOCK,
          parsedEvent: PARSED_ERC20_TRANSFER_EVENT_MOCK,
          tokenType: SupportedToken.ERC20,
          tokenStandard: SimulationTokenStandard.erc20,
          tokenId: undefined,
          previousBalances: [BALANCE_1_MOCK],
          newBalances: [BALANCE_2_MOCK],
        },
        {
          title: 'ERC-721 token',
          from: USER_ADDRESS_MOCK,
          parsedEvent: PARSED_ERC721_TRANSFER_EVENT_MOCK,
          tokenType: SupportedToken.ERC721,
          tokenStandard: SimulationTokenStandard.erc721,
          tokenId: TOKEN_ID_MOCK,
          previousBalances: [OTHER_ADDRESS_MOCK],
          newBalances: [USER_ADDRESS_MOCK],
        },
        {
          // Regression test – leading zero in user address
          title: 'ERC-721 token – where user address has leadding zero',
          from: USER_ADDRESS_WITH_LEADING_ZERO,
          parsedEvent: {
            ...PARSED_ERC721_TRANSFER_EVENT_MOCK,
            args: [
              OTHER_ADDRESS_MOCK,
              USER_ADDRESS_WITH_LEADING_ZERO,
              { toHexString: () => TOKEN_ID_MOCK },
            ],
          },
          tokenType: SupportedToken.ERC721,
          tokenStandard: SimulationTokenStandard.erc721,
          tokenId: TOKEN_ID_MOCK,
          previousBalances: [OTHER_ADDRESS_MOCK],
          newBalances: [USER_ADDRESS_WITH_LEADING_ZERO],
        },
        {
          title: 'ERC-1155 token via single event',
          from: USER_ADDRESS_MOCK,
          parsedEvent: PARSED_ERC1155_TRANSFER_SINGLE_EVENT_MOCK,
          tokenType: SupportedToken.ERC1155,
          tokenStandard: SimulationTokenStandard.erc1155,
          tokenId: TOKEN_ID_MOCK,
          previousBalances: [BALANCE_1_MOCK],
          newBalances: [BALANCE_2_MOCK],
        },
        {
          title: 'ERC-1155 token via batch event',
          from: USER_ADDRESS_MOCK,
          parsedEvent: PARSED_ERC1155_TRANSFER_BATCH_EVENT_MOCK,
          tokenType: SupportedToken.ERC1155,
          tokenStandard: SimulationTokenStandard.erc1155,
          tokenId: TOKEN_ID_MOCK,
          previousBalances: [BALANCE_1_MOCK],
          newBalances: [BALANCE_2_MOCK],
        },
        {
          title: 'wrapped ERC-20 token',
          from: USER_ADDRESS_MOCK,
          parsedEvent: PARSED_WRAPPED_ERC20_DEPOSIT_EVENT_MOCK,
          tokenType: SupportedToken.ERC20_WRAPPED,
          tokenStandard: SimulationTokenStandard.erc20,
          tokenId: undefined,
          previousBalances: [BALANCE_1_MOCK],
          newBalances: [BALANCE_2_MOCK],
        },
        {
          title: 'legacy ERC-721 token',
          from: USER_ADDRESS_MOCK,
          parsedEvent: PARSED_ERC721_TRANSFER_EVENT_MOCK,
          tokenType: SupportedToken.ERC721_LEGACY,
          tokenStandard: SimulationTokenStandard.erc721,
          tokenId: TOKEN_ID_MOCK,
          previousBalances: [OTHER_ADDRESS_MOCK],
          newBalances: [USER_ADDRESS_MOCK],
        },
      ])(
        'on $title',
        async ({
          from,
          parsedEvent,
          tokenStandard,
          tokenType,
          tokenId,
          previousBalances,
          newBalances,
        }) => {
          mockParseLog({ [tokenType]: parsedEvent });

          simulateTransactionsMock
            .mockResolvedValueOnce(
              createEventResponseMock([createLogMock(CONTRACT_ADDRESS_1_MOCK)]),
            )
            .mockResolvedValueOnce(
              createBalanceOfResponse(previousBalances, newBalances),
            );

          const result = await getBalanceChanges({
            ...REQUEST_MOCK,
            txParams: { ...REQUEST_MOCK.txParams, from },
          });

          expect(result).toStrictEqual({
            nativeBalanceChange: undefined,
            tokenBalanceChanges: [
              {
                standard: tokenStandard,
                address: CONTRACT_ADDRESS_1_MOCK,
                id: tokenId,
                previousBalance: trimLeadingZeros(BALANCE_1_MOCK),
                newBalance: trimLeadingZeros(BALANCE_2_MOCK),
                difference: DIFFERENCE_MOCK,
                isDecrease: false,
              },
            ],
          });
        },
      );

      it('on multiple different tokens', async () => {
        mockParseLog({
          erc20: PARSED_ERC20_TRANSFER_EVENT_MOCK,
        });

        mockParseLog({
          erc721: PARSED_ERC721_TRANSFER_EVENT_MOCK,
        });

        mockParseLog({
          erc1155: PARSED_ERC1155_TRANSFER_SINGLE_EVENT_MOCK,
        });

        simulateTransactionsMock
          .mockResolvedValueOnce(
            createEventResponseMock([
              createLogMock('0x7'),
              createLogMock('0x8'),
              createLogMock('0x9'),
            ]),
          )
          .mockResolvedValueOnce(
            createBalanceOfResponse(
              ['0x1', OTHER_ADDRESS_MOCK, '0x3'],
              ['0x6', USER_ADDRESS_MOCK, '0x4'],
            ),
          );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [
            {
              standard: SimulationTokenStandard.erc20,
              address: '0x7',
              id: undefined,
              previousBalance: '0x1',
              newBalance: '0x6',
              difference: '0x5',
              isDecrease: false,
            },
            {
              standard: SimulationTokenStandard.erc721,
              address: '0x8',
              id: TOKEN_ID_MOCK,
              previousBalance: '0x0',
              newBalance: '0x1',
              difference: '0x1',
              isDecrease: false,
            },
            {
              standard: SimulationTokenStandard.erc1155,
              address: '0x9',
              id: TOKEN_ID_MOCK,
              previousBalance: '0x3',
              newBalance: '0x4',
              difference: '0x1',
              isDecrease: false,
            },
          ],
        });
      });

      it('with multiple events on same ERC-20 contract', async () => {
        mockParseLog({
          erc20: PARSED_ERC20_TRANSFER_EVENT_MOCK,
        });

        mockParseLog({
          erc20: PARSED_ERC20_TRANSFER_EVENT_MOCK,
        });

        simulateTransactionsMock
          .mockResolvedValueOnce(
            createEventResponseMock([
              createLogMock(CONTRACT_ADDRESS_1_MOCK),
              createLogMock(CONTRACT_ADDRESS_1_MOCK),
            ]),
          )
          .mockResolvedValueOnce(
            createBalanceOfResponse([BALANCE_2_MOCK], [BALANCE_1_MOCK]),
          );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [
            {
              standard: SimulationTokenStandard.erc20,
              address: CONTRACT_ADDRESS_1_MOCK,
              id: undefined,
              previousBalance: trimLeadingZeros(BALANCE_2_MOCK),
              newBalance: trimLeadingZeros(BALANCE_1_MOCK),
              difference: DIFFERENCE_MOCK,
              isDecrease: true,
            },
          ],
        });
      });

      it('with multiple events on same ERC-721 contract', async () => {
        mockParseLog({
          erc721: PARSED_ERC721_TRANSFER_EVENT_MOCK,
        });

        mockParseLog({
          erc721: {
            ...PARSED_ERC721_TRANSFER_EVENT_MOCK,
            args: [OTHER_ADDRESS_MOCK, USER_ADDRESS_MOCK, OTHER_TOKEN_ID_MOCK],
          },
        });

        simulateTransactionsMock
          .mockResolvedValueOnce(
            createEventResponseMock([
              createLogMock(CONTRACT_ADDRESS_1_MOCK),
              createLogMock(CONTRACT_ADDRESS_1_MOCK),
            ]),
          )
          .mockResolvedValueOnce(
            createBalanceOfResponse(
              [OTHER_ADDRESS_MOCK, OTHER_ADDRESS_MOCK],
              [USER_ADDRESS_MOCK, USER_ADDRESS_MOCK],
            ),
          );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [
            {
              standard: SimulationTokenStandard.erc721,
              address: CONTRACT_ADDRESS_1_MOCK,
              id: TOKEN_ID_MOCK,
              previousBalance: trimLeadingZeros(BALANCE_1_MOCK),
              newBalance: trimLeadingZeros(BALANCE_2_MOCK),
              difference: DIFFERENCE_MOCK,
              isDecrease: false,
            },
            {
              standard: SimulationTokenStandard.erc721,
              address: CONTRACT_ADDRESS_1_MOCK,
              id: OTHER_TOKEN_ID_MOCK,
              previousBalance: trimLeadingZeros(BALANCE_1_MOCK),
              newBalance: trimLeadingZeros(BALANCE_2_MOCK),
              difference: DIFFERENCE_MOCK,
              isDecrease: false,
            },
          ],
        });
      });

      it('on NFT mint', async () => {
        mockParseLog({
          erc721: {
            ...PARSED_ERC721_TRANSFER_EVENT_MOCK,
            args: [
              '0x0000000000000000000000000000000000000000',
              USER_ADDRESS_MOCK,
              TOKEN_ID_MOCK,
            ],
          },
        });

        // Pay for NFT mint with ERC20 token.
        mockParseLog({
          erc20: PARSED_ERC20_TRANSFER_EVENT_MOCK,
        });

        simulateTransactionsMock
          .mockResolvedValueOnce(
            createEventResponseMock([
              createLogMock(CONTRACT_ADDRESS_1_MOCK),
              createLogMock(CONTRACT_ADDRESS_2_MOCK),
            ]),
          )
          .mockResolvedValueOnce(
            createBalanceOfResponse(
              [BALANCE_2_MOCK], // The ERC20 balance before minting.
              [
                USER_ADDRESS_MOCK, // The user is the owner.
                BALANCE_1_MOCK, // The ERC20 balance after minting.
              ],
            ),
          );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(simulateTransactionsMock).toHaveBeenCalledTimes(2);

        // The balance of the ERC-20 token is checked before and after the transaction.
        // The ERC-721 token balance is only checked after the transaction since it is minted.
        expect(simulateTransactionsMock).toHaveBeenNthCalledWith(
          2,
          REQUEST_MOCK.chainId,
          {
            transactions: [
              // ERC-20 balance before minting.
              {
                authorizationList: undefined,
                from: REQUEST_MOCK.txParams.from,
                to: CONTRACT_ADDRESS_2_MOCK,
                data: expect.any(String),
              },
              // Minting ERC-721 token.
              {
                authorizationList: undefined,
                data: REQUEST_MOCK.txParams.data,
                from: REQUEST_MOCK.txParams.from,
                gas: REQUEST_MOCK.txParams.gas,
                maxFeePerGas: REQUEST_MOCK.txParams.maxFeePerGas,
                maxPriorityFeePerGas:
                  REQUEST_MOCK.txParams.maxPriorityFeePerGas,
                value: REQUEST_MOCK.txParams.value,
              },
              // ERC-721 owner after minting.
              {
                authorizationList: undefined,
                from: REQUEST_MOCK.txParams.from,
                to: CONTRACT_ADDRESS_1_MOCK,
                data: expect.any(String),
              },
              // ERC-20 balance before minting.
              {
                authorizationList: undefined,
                from: REQUEST_MOCK.txParams.from,
                to: CONTRACT_ADDRESS_2_MOCK,
                data: expect.any(String),
              },
            ],
            withDefaultBlockOverrides: true,
            withGas: true,
          },
        );
        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [
            {
              standard: SimulationTokenStandard.erc721,
              address: CONTRACT_ADDRESS_1_MOCK,
              id: TOKEN_ID_MOCK,
              previousBalance: '0x0',
              newBalance: '0x1',
              difference: '0x1',
              isDecrease: false,
            },
            {
              standard: SimulationTokenStandard.erc20,
              address: CONTRACT_ADDRESS_2_MOCK,
              id: undefined,
              previousBalance: '0x1',
              newBalance: '0x0',
              difference: '0x1',
              isDecrease: true,
            },
          ],
        });
      });

      it('as empty if events cannot be parsed', async () => {
        mockParseLog({});

        simulateTransactionsMock
          .mockResolvedValueOnce(
            createEventResponseMock([createLogMock(CONTRACT_ADDRESS_1_MOCK)]),
          )
          .mockResolvedValueOnce(
            createBalanceOfResponse([BALANCE_1_MOCK], [BALANCE_2_MOCK]),
          );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [],
        });
      });

      it('as empty if events are not impacting user', async () => {
        mockParseLog({
          erc20: {
            ...PARSED_ERC20_TRANSFER_EVENT_MOCK,
            args: [
              OTHER_ADDRESS_MOCK,
              OTHER_ADDRESS_MOCK,
              { toHexString: () => VALUE_MOCK },
            ],
          },
        });

        simulateTransactionsMock.mockResolvedValueOnce(
          createEventResponseMock([createLogMock(CONTRACT_ADDRESS_1_MOCK)]),
        );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [],
        });
      });

      it('as empty if balance has not changed', async () => {
        mockParseLog({
          erc20: PARSED_ERC20_TRANSFER_EVENT_MOCK,
        });

        simulateTransactionsMock
          .mockResolvedValueOnce(
            createEventResponseMock([createLogMock(CONTRACT_ADDRESS_1_MOCK)]),
          )
          .mockResolvedValueOnce(
            createBalanceOfResponse([BALANCE_1_MOCK], [BALANCE_1_MOCK]),
          );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [],
        });
      });

      it('using logs from nested calls', async () => {
        mockParseLog({ erc20: PARSED_ERC20_TRANSFER_EVENT_MOCK });

        simulateTransactionsMock
          .mockResolvedValueOnce(RESPONSE_NESTED_LOGS_MOCK)
          .mockResolvedValueOnce(
            createBalanceOfResponse([BALANCE_1_MOCK], [BALANCE_2_MOCK]),
          );

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [
            {
              standard: SimulationTokenStandard.erc20,
              address: CONTRACT_ADDRESS_1_MOCK,
              id: undefined,
              previousBalance: trimLeadingZeros(BALANCE_1_MOCK),
              newBalance: trimLeadingZeros(BALANCE_2_MOCK),
              difference: '0x1',
              isDecrease: false,
            },
          ],
        });
      });

      // Ensures no regression of bug https://github.com/MetaMask/metamask-extension/issues/26521
      it('decodes raw balanceOf output correctly for ERC20 token with extra zeros', async () => {
        const DECODED_BALANCE_BEFORE = '0x134c31d252';
        const DECODED_BALANCE_AFTER = '0x134c31d257';
        const EXPECTED_BALANCE_CHANGE = '0x5';

        // Contract returns 64 extra zeros in raw output of balanceOf.
        // Abi decoding should ignore them.
        const encodeOutputWith64ExtraZeros = (value: string) =>
          (encodeTo32ByteHex(value) + ''.padStart(64, '0')) as Hex;
        const RAW_BALANCE_BEFORE = encodeOutputWith64ExtraZeros(
          DECODED_BALANCE_BEFORE,
        );
        const RAW_BALANCE_AFTER = encodeOutputWith64ExtraZeros(
          DECODED_BALANCE_AFTER,
        );

        mockParseLog({
          erc20: PARSED_ERC20_TRANSFER_EVENT_MOCK,
        });

        simulateTransactionsMock
          .mockResolvedValueOnce(
            createEventResponseMock([createLogMock(CONTRACT_ADDRESS_2_MOCK)]),
          )
          .mockResolvedValueOnce({
            transactions: [
              { ...defaultResponseTx, return: RAW_BALANCE_BEFORE },
              defaultResponseTx,
              { ...defaultResponseTx, return: RAW_BALANCE_AFTER },
            ],
          });

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [
            {
              standard: SimulationTokenStandard.erc20,
              address: CONTRACT_ADDRESS_2_MOCK,
              id: undefined,
              previousBalance: DECODED_BALANCE_BEFORE,
              newBalance: DECODED_BALANCE_AFTER,
              difference: EXPECTED_BALANCE_CHANGE,
              isDecrease: false,
            },
          ],
        });
      });
    });

    describe('returns error', () => {
      it('if API request throws', async () => {
        simulateTransactionsMock.mockRejectedValueOnce({
          code: ERROR_CODE_MOCK,
          message: ERROR_MESSAGE_MOCK,
        });

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          error: {
            code: ERROR_CODE_MOCK,
            message: ERROR_MESSAGE_MOCK,
          },
          tokenBalanceChanges: [],
        });
      });

      it('if API request throws without message', async () => {
        simulateTransactionsMock.mockRejectedValueOnce({
          code: ERROR_CODE_MOCK,
        });

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          error: {
            code: ERROR_CODE_MOCK,
            message: undefined,
          },
          tokenBalanceChanges: [],
        });
      });

      it('if API response has missing transactions', async () => {
        mockParseLog({ erc20: PARSED_ERC20_TRANSFER_EVENT_MOCK });

        simulateTransactionsMock
          .mockResolvedValueOnce(
            createEventResponseMock([createLogMock(CONTRACT_ADDRESS_1_MOCK)]),
          )
          .mockResolvedValueOnce(createBalanceOfResponse([], []));

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          error: {
            code: SimulationErrorCode.InvalidResponse,
            message: new SimulationInvalidResponseError().message,
          },
          tokenBalanceChanges: [],
        });
      });

      it('if API response has transaction revert error', async () => {
        simulateTransactionsMock.mockResolvedValueOnce({
          transactions: [
            {
              error: 'test execution reverted test',
              return: '0x',
            },
          ],
        });

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          error: {
            code: SimulationErrorCode.Reverted,
            message: new SimulationRevertedError().message,
          },
          tokenBalanceChanges: [],
        });
      });

      it('if API response has transaction error', async () => {
        simulateTransactionsMock.mockResolvedValueOnce({
          transactions: [
            {
              error: 'test 1 2 3',
              return: '0x',
            },
          ],
        });

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          error: {
            code: undefined,
            message: 'test 1 2 3',
          },
          tokenBalanceChanges: [],
        });
      });

      it('if API response has insufficient gas error', async () => {
        simulateTransactionsMock.mockRejectedValueOnce({
          code: ERROR_CODE_MOCK,
          message: 'test insufficient funds for gas test',
        });

        const result = await getBalanceChanges(REQUEST_MOCK);

        expect(result).toStrictEqual({
          error: {
            code: SimulationErrorCode.Reverted,
            message: new SimulationRevertedError().message,
          },
          tokenBalanceChanges: [],
        });
      });
    });

    it('includes authorization list in API request if in params', async () => {
      await getBalanceChanges({
        ...REQUEST_MOCK,
        txParams: {
          ...REQUEST_MOCK.txParams,
          authorizationList: [
            {
              address: CONTRACT_ADDRESS_2_MOCK,
              chainId: '0x321',
              nonce: '0x1',
              r: '0x2',
              s: '0x3',
              yParity: '0x1',
            },
          ],
        },
      });

      expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
      expect(simulateTransactionsMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          transactions: [
            expect.objectContaining({
              authorizationList: [
                {
                  address: CONTRACT_ADDRESS_2_MOCK,
                  from: USER_ADDRESS_MOCK,
                },
              ],
            }),
          ],
        }),
      );
    });

    describe('overrides balance in API request if insufficient balance due to', () => {
      it('gas fee', async () => {
        queryMock.mockResolvedValue('0x7d182d');

        await getBalanceChanges({
          ...REQUEST_MOCK,
          txParams: {
            ...REQUEST_MOCK.txParams,
            value: '0x0',
          },
        });

        expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
        expect(simulateTransactionsMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            overrides: {
              [USER_ADDRESS_MOCK]: {
                balance: '0x7d182e',
              },
            },
          }),
        );
      });

      it('legacy gas fee', async () => {
        queryMock.mockResolvedValue('0xc1f3d');

        await getBalanceChanges({
          ...REQUEST_MOCK,
          txParams: {
            ...REQUEST_MOCK.txParams,
            gasPrice: '0x123',
            maxFeePerGas: undefined,
            maxPriorityFeePerGas: undefined,
            value: '0x0',
          },
        });

        expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
        expect(simulateTransactionsMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            overrides: {
              [USER_ADDRESS_MOCK]: {
                balance: '0xc1f3e',
              },
            },
          }),
        );
      });

      it('value', async () => {
        queryMock.mockResolvedValue('0x122');

        await getBalanceChanges({
          ...REQUEST_MOCK,
          txParams: {
            ...REQUEST_MOCK.txParams,
            gas: '0x0',
            value: '0x123',
          },
        });

        expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
        expect(simulateTransactionsMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            overrides: {
              [USER_ADDRESS_MOCK]: {
                balance: '0x123',
              },
            },
          }),
        );
      });

      it('nested transaction value', async () => {
        queryMock.mockResolvedValue('0x332');

        await getBalanceChanges({
          ...REQUEST_MOCK,
          nestedTransactions: [
            {
              value: '0x111',
            },
            {
              value: '0x222',
            },
          ],
          txParams: {
            ...REQUEST_MOCK.txParams,
            gas: '0x0',
            value: '0x0',
          },
        });

        expect(simulateTransactionsMock).toHaveBeenCalledTimes(1);
        expect(simulateTransactionsMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            overrides: {
              [USER_ADDRESS_MOCK]: {
                balance: '0x333',
              },
            },
          }),
        );
      });
    });
  });
});
