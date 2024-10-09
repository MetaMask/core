import type { LogDescription } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';
import { isHexString, type Hex } from '@metamask/utils';

import {
  SimulationError,
  SimulationInvalidResponseError,
  SimulationRevertedError,
} from '../errors';
import { SimulationErrorCode, SimulationTokenStandard } from '../types';
import {
  getSimulationData,
  getValueFromBalanceTransaction,
  SupportedToken,
  type GetSimulationDataRequest,
} from './simulation';
import type { SimulationResponseLog } from './simulation-api';
import {
  simulateTransactions,
  type SimulationResponse,
} from './simulation-api';

jest.mock('./simulation-api');

// Utility function to encode uint256 values to 32-byte ABI format
const encodeUint256 = (value: string | number): Hex => {
  // Pad to 32 bytes (64 characters) and add '0x' prefix
  return `0x${BigInt(value).toString(16).padStart(64, '0')}` as Hex;
};

// Utility function to encode addresses to correct length
const encodeAddress = (address: Hex): Hex => {
  // Ensure the address is a valid hex string and pad it to 20 bytes (40 characters)
  if (!isHexString(address)) {
    throw new Error('Invalid address format');
  }
  return `0x${address.toLowerCase().substring(2).padStart(40, '0')}` as Hex;
};

const trimLeadingZeros = (hexString: Hex): Hex => {
  const trimmed = hexString.replace(/^0x0+/u, '0x') as Hex;
  return trimmed === '0x' ? '0x0' : trimmed;
};

const USER_ADDRESS_MOCK = encodeAddress('0x123');
const OTHER_ADDRESS_MOCK = encodeAddress('0x456');
const CONTRACT_ADDRESS_1_MOCK = encodeAddress('0x789');
const CONTRACT_ADDRESS_2_MOCK = encodeAddress('0xDEF');
const BALANCE_1_MOCK = encodeUint256('0x0');
const BALANCE_2_MOCK = encodeUint256('0x1');
const DIFFERENCE_MOCK = '0x1';
const VALUE_MOCK = encodeUint256('0x4');
const TOKEN_ID_MOCK = '0x5';
const OTHER_TOKEN_ID_MOCK = '0x6';
const ERROR_CODE_MOCK = 123;
const ERROR_MESSAGE_MOCK = 'Test Error';

const REQUEST_MOCK: GetSimulationDataRequest = {
  chainId: '0x1',
  from: USER_ADDRESS_MOCK,
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

const RESPONSE_NESTED_LOGS_MOCK: SimulationResponse = {
  transactions: [
    {
      return: '0x1',
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
      stateDiff: {
        pre: {},
        post: {},
      },
    },
  ],
};

/**
 * Create a mock of a raw log emitted by a simulated transaction.
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
 * @param logs - The logs.
 * @returns Mock API response.
 */
function createEventResponseMock(logs: SimulationResponseLog[]) {
  return {
    transactions: [
      {
        return: '0x',
        callTrace: {
          calls: [],
          logs,
        },
        stateDiff: {
          pre: {},
          post: {},
        },
      },
    ],
  } as unknown as SimulationResponse;
}

/**
 * Create a mock API response for a native balance change.
 * @param previousBalance - The previous balance.
 * @param newBalance - The new balance.
 * @returns Mock API response.
 */
function createNativeBalanceResponse(
  previousBalance: string,
  newBalance: string,
) {
  return {
    transactions: [
      {
        return: encodeUint256(previousBalance),
        callTrace: {
          calls: [],
          logs: [],
        },
        stateDiff: {
          pre: {
            [USER_ADDRESS_MOCK]: {
              balance: encodeUint256(previousBalance),
            },
          },
          post: {
            [encodeAddress(USER_ADDRESS_MOCK)]: {
              balance: encodeUint256(newBalance),
            },
          },
        },
      },
    ],
  } as unknown as SimulationResponse;
}

/**
 * Create a mock API response for a token balance balanceOf request.
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
        return: encodeUint256(previousBalance),
        callTrace: {
          calls: [],
          logs: [],
        },
        stateDiff: {
          pre: {},
          post: {},
        },
      })),
      {
        return: encodeUint256('0xabc'), // Example correction with encoding
        callTrace: {
          calls: [],
          logs: [],
        },
        stateDiff: {
          pre: {},
          post: {},
        },
      },
      ...newBalances.map((newBalance) => ({
        return: encodeUint256(newBalance),
        callTrace: {
          calls: [],
          logs: [],
        },
        stateDiff: {
          pre: {},
          post: {},
        },
      })),
    ],
  } as unknown as SimulationResponse;
}

/**
 * Mock the parsing of raw logs by the token ABIs.
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

  beforeEach(() => {
    jest.spyOn(Interface.prototype, 'encodeFunctionData').mockReturnValue('');
  });

  describe('getSimulationData', () => {
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

          const simulationData = await getSimulationData(REQUEST_MOCK);

          expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
          nativeBalanceChange: undefined,
          tokenBalanceChanges: [],
        });
      });
    });

    describe('returns token balance changes', () => {
      it.each([
        {
          title: 'ERC-20 token',
          parsedEvent: PARSED_ERC20_TRANSFER_EVENT_MOCK,
          tokenType: SupportedToken.ERC20,
          tokenStandard: SimulationTokenStandard.erc20,
          tokenId: undefined,
          previousBalances: [BALANCE_1_MOCK],
          newBalances: [BALANCE_2_MOCK],
        },
        {
          title: 'ERC-721 token',
          parsedEvent: PARSED_ERC721_TRANSFER_EVENT_MOCK,
          tokenType: SupportedToken.ERC721,
          tokenStandard: SimulationTokenStandard.erc721,
          tokenId: TOKEN_ID_MOCK,
          previousBalances: [OTHER_ADDRESS_MOCK],
          newBalances: [USER_ADDRESS_MOCK],
        },
        {
          title: 'ERC-1155 token via single event',
          parsedEvent: PARSED_ERC1155_TRANSFER_SINGLE_EVENT_MOCK,
          tokenType: SupportedToken.ERC1155,
          tokenStandard: SimulationTokenStandard.erc1155,
          tokenId: TOKEN_ID_MOCK,
          previousBalances: [BALANCE_1_MOCK],
          newBalances: [BALANCE_2_MOCK],
        },
        {
          title: 'ERC-1155 token via batch event',
          parsedEvent: PARSED_ERC1155_TRANSFER_BATCH_EVENT_MOCK,
          tokenType: SupportedToken.ERC1155,
          tokenStandard: SimulationTokenStandard.erc1155,
          tokenId: TOKEN_ID_MOCK,
          previousBalances: [BALANCE_1_MOCK],
          newBalances: [BALANCE_2_MOCK],
        },
        {
          title: 'wrapped ERC-20 token',
          parsedEvent: PARSED_WRAPPED_ERC20_DEPOSIT_EVENT_MOCK,
          tokenType: SupportedToken.ERC20_WRAPPED,
          tokenStandard: SimulationTokenStandard.erc20,
          tokenId: undefined,
          previousBalances: [BALANCE_1_MOCK],
          newBalances: [BALANCE_2_MOCK],
        },
        {
          title: 'legacy ERC-721 token',
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

          const simulationData = await getSimulationData(REQUEST_MOCK);

          expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

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
                from: REQUEST_MOCK.from,
                to: CONTRACT_ADDRESS_2_MOCK,
                data: expect.any(String),
              },
              // Minting ERC-721 token.
              REQUEST_MOCK,
              // ERC-721 owner after minting.
              {
                from: REQUEST_MOCK.from,
                to: CONTRACT_ADDRESS_1_MOCK,
                data: expect.any(String),
              },
              // ERC-20 balance before minting.
              {
                from: REQUEST_MOCK.from,
                to: CONTRACT_ADDRESS_2_MOCK,
                data: expect.any(String),
              },
            ],
          },
        );
        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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
    });

    describe('returns error', () => {
      it('if API request throws', async () => {
        simulateTransactionsMock.mockRejectedValueOnce({
          code: ERROR_CODE_MOCK,
          message: ERROR_MESSAGE_MOCK,
        });

        expect(await getSimulationData(REQUEST_MOCK)).toStrictEqual({
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

        expect(await getSimulationData(REQUEST_MOCK)).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
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

        const simulationData = await getSimulationData(REQUEST_MOCK);

        expect(simulationData).toStrictEqual({
          error: {
            code: SimulationErrorCode.Reverted,
            message: new SimulationRevertedError().message,
          },
          tokenBalanceChanges: [],
        });
      });
    });
  });
});

describe('getValueFromBalanceTransaction', () => {
  const from = '0x1234567890123456789012345678901234567890';
  const contractAddress = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;

  it.each([
    [
      'ERC20 balance',
      SimulationTokenStandard.erc20,
      '0x000000000000000000000000000000000000000000000000000000134c31d25200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      '0x134c31d252',
    ],
    [
      'ERC721 ownership',
      SimulationTokenStandard.erc721,
      '0x0000000000000000000000001234567890123456789012345678901234567890',
      '0x1',
    ],
    [
      'ERC721 non-ownership',
      SimulationTokenStandard.erc721,
      '0x000000000000000000000000abcdef1234567890abcdef1234567890abcdef12',
      '0x0',
    ],
    [
      'ERC1155 balance',
      SimulationTokenStandard.erc1155,
      '0x0000000000000000000000000000000000000000000000000000000000000064',
      '0x64',
    ],
  ])('correctly decodes %s', (_, standard, returnValue, expected) => {
    const token = { standard, address: contractAddress };
    const response = { return: returnValue as Hex };

    const result = getValueFromBalanceTransaction(from, token, response);

    expect(result).toBe(expected);
  });

  it('throws SimulationInvalidResponseError on decoding failure', () => {
    const token = {
      standard: SimulationTokenStandard.erc20,
      address: contractAddress,
    };
    const response = { return: '0xInvalidData' as Hex };

    expect(() => getValueFromBalanceTransaction(from, token, response)).toThrow(
      SimulationError,
    );
  });
});
