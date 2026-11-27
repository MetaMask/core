import { ORIGIN_METAMASK } from '@metamask/approval-controller';
import { convertHexToDecimal, toHex } from '@metamask/controller-utils';
import type { DecodedPermission } from '@metamask/gator-permissions-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex, Json } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import type {
  MessageParams,
  MessageParamsPersonal,
  MessageParamsTyped,
  MessageParamsTypedData,
  OriginalRequest,
} from '../types.js';
import {
  PRIMARY_TYPE_DELEGATION,
  validatePersonalSignatureRequest,
  validateTypedSignatureRequest,
} from './validation.js';

const CHAIN_ID_MOCK = '0x1';
const ORIGIN_MOCK = 'test.com';
const INTERNAL_ACCOUNT_MOCK = '0x0123456789abcdef0123456789abcdef01234567';
const FROM_MOCK = '0x3244e191f1b4903970224322180f1fbbc415696b';

/**
 * Non-canonical encodings of `INTERNAL_ACCOUNT_MOCK` that are still signed as
 * the same address.
 */
const NON_CANONICAL_INTERNAL_ACCOUNTS_MOCK = [
  ['decimal string', BigInt(INTERNAL_ACCOUNT_MOCK).toString(10)],
  ['short hex string', `0x${INTERNAL_ACCOUNT_MOCK.slice(3)}`],
  ['uppercase prefix', `0X${INTERNAL_ACCOUNT_MOCK.slice(2)}`],
  ['unprefixed hex string', INTERNAL_ACCOUNT_MOCK.slice(2)],
  ['number', Number(INTERNAL_ACCOUNT_MOCK)],
  ['array', [INTERNAL_ACCOUNT_MOCK]],
] as [string, Json][];

const DATA_TYPED_MOCK =
  '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Person":[{"name":"name","type":"string"},{"name":"wallet","type":"address"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person"},{"name":"contents","type":"string"}]},"primaryType":"Mail","domain":{"name":"Ether Mail","version":"1","chainId":1,"verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"},"message":{"from":{"name":"Cow","wallet":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},"to":{"name":"Bob","wallet":"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},"contents":"Hello, Bob!"}}';

const REQUEST_MOCK = {} as OriginalRequest;

/**
 * Build typed data with the given verifying contract.
 *
 * @param verifyingContract - The verifying contract.
 * @returns The typed data.
 */
function buildVerifyingContractData(
  verifyingContract: Json,
): MessageParamsTypedData {
  const data = JSON.parse(DATA_TYPED_MOCK) as MessageParamsTypedData;
  data.domain.verifyingContract = verifyingContract;
  return data;
}

/**
 * Build delegation typed data with the given delegator.
 *
 * @param delegator - The delegator, or undefined to omit it.
 * @returns The typed data.
 */
function buildDelegationData(delegator?: Json): MessageParamsTypedData {
  const data = JSON.parse(DATA_TYPED_MOCK) as MessageParamsTypedData;
  data.primaryType = PRIMARY_TYPE_DELEGATION;
  data.types.Delegation = [{ name: 'delegator', type: 'address' }];
  data.message = delegator === undefined ? {} : { delegator };
  return data;
}

describe('Validation Utils', () => {
  describe.each([
    [
      'validatePersonalSignatureRequest',
      (params: MessageParams) =>
        validatePersonalSignatureRequest(params as MessageParamsPersonal),
    ],
    [
      'validateTypedSignatureRequest',
      (params: MessageParams) =>
        validateTypedSignatureRequest({
          currentChainId: CHAIN_ID_MOCK,
          internalAccounts: [],
          messageData: params as MessageParamsTyped,
          request: REQUEST_MOCK,
          version: SignTypedDataVersion.V1,
        }),
    ],
  ] as const)('%s', (_title, fn) => {
    it('throws if no from address', () => {
      expect(() => fn({} as MessageParams)).toThrow(
        `Invalid "from" address: undefined must be a valid string.`,
      );
    });

    it('throws if invalid from address', () => {
      const from = '01';

      expect(() =>
        fn({
          from,
        }),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('throws if invalid type from address', () => {
      const from = 123;

      expect(() =>
        fn({
          from: from as never,
        }),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });
  });

  describe('validatePersonalSignatureRequest', () => {
    it('throws if no data', () => {
      expect(() =>
        validatePersonalSignatureRequest({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as MessageParamsPersonal),
      ).toThrow(`Invalid message "data": undefined must be a valid string.`);
    });

    it('throws if invalid type data', () => {
      expect(() =>
        validatePersonalSignatureRequest({
          data: 123 as never,
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        }),
      ).toThrow('Invalid message "data": 123 must be a valid string.');
    });
  });

  describe('validateTypedSignatureRequest', () => {
    describe('V1', () => {
      it('throws if incorrect data', () => {
        expect(() =>
          validateTypedSignatureRequest({
            currentChainId: CHAIN_ID_MOCK,
            internalAccounts: [],
            messageData: {
              data: '0x879a05',
              from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            },
            request: REQUEST_MOCK,
            version: SignTypedDataVersion.V1,
          }),
        ).toThrow('Invalid message "data":');
      });

      it('throws if no data', () => {
        expect(() =>
          validateTypedSignatureRequest({
            currentChainId: CHAIN_ID_MOCK,
            internalAccounts: [],
            messageData: {
              from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            } as MessageParamsTyped,
            request: REQUEST_MOCK,
            version: SignTypedDataVersion.V1,
          }),
        ).toThrow('Invalid message "data":');
      });

      it('throws if invalid type data', () => {
        expect(() =>
          validateTypedSignatureRequest({
            currentChainId: CHAIN_ID_MOCK,
            internalAccounts: [],
            messageData: {
              data: [],
              from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            },
            request: REQUEST_MOCK,
            version: SignTypedDataVersion.V1,
          }),
        ).toThrow('Expected EIP712 typed data.');
      });
    });

    describe.each([SignTypedDataVersion.V3, SignTypedDataVersion.V4])(
      '%s',
      (version) => {
        it('throws if array data', () => {
          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: CHAIN_ID_MOCK,
              internalAccounts: [],
              messageData: {
                data: [],
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              request: REQUEST_MOCK,
              version,
            }),
          ).toThrow('Invalid message "data":');
        });

        it('throws if no array data', () => {
          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: CHAIN_ID_MOCK,
              internalAccounts: [],
              messageData: {
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              } as MessageParamsTyped,
              request: REQUEST_MOCK,
              version,
            }),
          ).toThrow('Invalid message "data":');
        });

        it('throws if no JSON valid data', () => {
          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: CHAIN_ID_MOCK,
              internalAccounts: [],
              messageData: {
                data: 'uh oh',
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              request: REQUEST_MOCK,
              version,
            }),
          ).toThrow('Data must be passed as a valid JSON string.');
        });

        it('throws if current chain ID is not present', () => {
          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: undefined,
              internalAccounts: [],
              messageData: {
                data: DATA_TYPED_MOCK,
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              request: REQUEST_MOCK,
              version,
            }),
          ).toThrow('Current chainId cannot be null or undefined.');
        });

        it('throws if current chain ID is not convertible to integer', () => {
          const unexpectedChainId = 'unexpected chain id';

          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: unexpectedChainId as never,
              internalAccounts: [],
              messageData: {
                data: DATA_TYPED_MOCK.replace(`"chainId":1`, `"chainId":"0x1"`),
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              request: REQUEST_MOCK,
              version,
            }),
          ).toThrow(
            `Cannot sign messages for chainId "${String(
              convertHexToDecimal(CHAIN_ID_MOCK),
            )}", because MetaMask is switching networks.`,
          );
        });

        it('throws if current chain ID is not matched with provided in message data', () => {
          const chainId = toHex(2);

          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: chainId,
              internalAccounts: [],
              messageData: {
                data: DATA_TYPED_MOCK,
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              request: REQUEST_MOCK,
              version,
            }),
          ).toThrow(
            `Provided chainId "${convertHexToDecimal(
              CHAIN_ID_MOCK,
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            )}" must match the active chainId "${convertHexToDecimal(
              chainId,
            )}"`,
          );
        });

        it('throws if data not in typed message schema', () => {
          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: CHAIN_ID_MOCK,
              internalAccounts: [],
              messageData: {
                data: '{"greetings":"I am Alice"}',
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              request: REQUEST_MOCK,
              version,
            }),
          ).toThrow('Data must conform to EIP-712 schema.');
        });

        it('does not throw if data is correct', () => {
          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: CHAIN_ID_MOCK,
              internalAccounts: [],
              messageData: {
                data: DATA_TYPED_MOCK.replace(`"chainId":1`, `"chainId":"1"`),
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              request: REQUEST_MOCK,
              version,
            }),
          ).not.toThrow();
        });

        it('does not throw if data is correct (object format)', () => {
          expect(() =>
            validateTypedSignatureRequest({
              currentChainId: CHAIN_ID_MOCK,
              internalAccounts: [],
              messageData: {
                data: JSON.parse(DATA_TYPED_MOCK),
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              request: REQUEST_MOCK,
              version,
            }),
          ).not.toThrow();
        });

        describe('verifying contract', () => {
          it('throws if external origin in request and verifying contract is internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);
            data.domain.verifyingContract = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).toThrow(
              'External signature requests cannot use internal accounts as the verifying contract.',
            );
          });

          it('does not throw if external origin in request and verifying contract is not present', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);
            delete data.domain.verifyingContract;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).not.toThrow();
          });

          it('throws if external origin in message params and verifying contract is internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);
            data.domain.verifyingContract = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                  origin: ORIGIN_MOCK,
                },
                request: REQUEST_MOCK,
                version,
              }),
            ).toThrow(
              'External signature requests cannot use internal accounts as the verifying contract.',
            );
          });

          it('throws if external origin and verifying contract is internal account with different case', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);
            data.domain.verifyingContract = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: [
                  '0x1234',
                  INTERNAL_ACCOUNT_MOCK.toUpperCase() as Hex,
                ],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).toThrow(
              'External signature requests cannot use internal accounts as the verifying contract.',
            );
          });

          it('does not throw if internal origin and verifying contract is internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);
            data.domain.verifyingContract = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: { origin: ORIGIN_METAMASK } as OriginalRequest,
                version,
              }),
            ).not.toThrow();
          });

          it.each(NON_CANONICAL_INTERNAL_ACCOUNTS_MOCK)(
            'throws if external origin and verifying contract is internal account as %s',
            (_title, verifyingContract) => {
              const data = buildVerifyingContractData(verifyingContract);

              expect(() =>
                validateTypedSignatureRequest({
                  currentChainId: CHAIN_ID_MOCK,
                  internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                  messageData: { data, from: FROM_MOCK },
                  request: { origin: ORIGIN_MOCK } as OriginalRequest,
                  version,
                }),
              ).toThrow(
                /^External signature requests (must specify "domain\.verifyingContract" as a hex address|cannot use internal accounts as the verifying contract)\.$/u,
              );
            },
          );

          it.each(['', 'cosmos'])(
            'does not throw if external origin and verifying contract is %j',
            (verifyingContract) => {
              const data = buildVerifyingContractData(verifyingContract);

              expect(() =>
                validateTypedSignatureRequest({
                  currentChainId: CHAIN_ID_MOCK,
                  internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                  messageData: { data, from: FROM_MOCK },
                  request: { origin: ORIGIN_MOCK } as OriginalRequest,
                  version,
                }),
              ).not.toThrow();
            },
          );

          it.each(NON_CANONICAL_INTERNAL_ACCOUNTS_MOCK)(
            'does not throw if internal origin and verifying contract is internal account as %s',
            (_title, verifyingContract) => {
              const data = buildVerifyingContractData(verifyingContract);

              expect(() =>
                validateTypedSignatureRequest({
                  currentChainId: CHAIN_ID_MOCK,
                  internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                  messageData: { data, from: FROM_MOCK },
                  request: { origin: ORIGIN_METAMASK } as OriginalRequest,
                  version,
                }),
              ).not.toThrow();
            },
          );

          it('does not throw if no origin and verifying contract is internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);
            data.domain.verifyingContract = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: REQUEST_MOCK,
                version,
              }),
            ).not.toThrow();
          });
        });

        describe('delegation', () => {
          it('throws if external origin in request and delegation from internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);

            data.primaryType = PRIMARY_TYPE_DELEGATION;
            data.types.Delegation = [{ name: 'delegator', type: 'address' }];
            data.message.delegator = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).toThrow(
              'External signature requests cannot sign delegations for internal accounts.',
            );
          });

          it('throws if external origin in message params and delegation from internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);

            data.primaryType = PRIMARY_TYPE_DELEGATION;
            data.types.Delegation = [{ name: 'delegator', type: 'address' }];
            data.message.delegator = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                  origin: ORIGIN_MOCK,
                },
                request: REQUEST_MOCK,
                version,
              }),
            ).toThrow(
              'External signature requests cannot sign delegations for internal accounts.',
            );
          });

          it('throws if external origin and delegation from internal account with different case', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);

            data.primaryType = PRIMARY_TYPE_DELEGATION;
            data.types.Delegation = [{ name: 'delegator', type: 'address' }];
            data.message.delegator = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: [
                  '0x1234',
                  INTERNAL_ACCOUNT_MOCK.toUpperCase() as Hex,
                ],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).toThrow(
              'External signature requests cannot sign delegations for internal accounts.',
            );
          });

          it('does not throw if internal origin and delegation from internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);

            data.primaryType = PRIMARY_TYPE_DELEGATION;
            data.types.Delegation = [{ name: 'delegator', type: 'address' }];
            data.message.delegator = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: { origin: ORIGIN_METAMASK } as OriginalRequest,
                version,
              }),
            ).not.toThrow();
          });

          it.each(NON_CANONICAL_INTERNAL_ACCOUNTS_MOCK)(
            'throws if external origin and delegation from internal account as %s',
            (_title, delegator) => {
              const data = buildDelegationData(delegator);

              expect(() =>
                validateTypedSignatureRequest({
                  currentChainId: CHAIN_ID_MOCK,
                  internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                  messageData: { data, from: FROM_MOCK },
                  request: { origin: ORIGIN_MOCK } as OriginalRequest,
                  version,
                }),
              ).toThrow(
                'External signature requests must specify the delegator as a hex address.',
              );
            },
          );

          it('throws if external origin and delegation has no delegator', () => {
            const data = buildDelegationData();

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: { data, from: FROM_MOCK },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).toThrow(
              'External signature requests must specify the delegator as a hex address.',
            );
          });

          it('does not throw if external origin and delegation from external account', () => {
            const data = buildDelegationData(FROM_MOCK);

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: { data, from: FROM_MOCK },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).not.toThrow();
          });

          it('does not throw if external origin with decoded permission and delegation from internal account', () => {
            const data = buildDelegationData(INTERNAL_ACCOUNT_MOCK);

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: { data, from: FROM_MOCK },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
                decodedPermission: {} as DecodedPermission,
              }),
            ).not.toThrow();
          });

          it.each(NON_CANONICAL_INTERNAL_ACCOUNTS_MOCK)(
            'does not throw if internal origin and delegation from internal account as %s',
            (_title, delegator) => {
              const data = buildDelegationData(delegator);

              expect(() =>
                validateTypedSignatureRequest({
                  currentChainId: CHAIN_ID_MOCK,
                  internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                  messageData: { data, from: FROM_MOCK },
                  request: { origin: ORIGIN_METAMASK } as OriginalRequest,
                  version,
                }),
              ).not.toThrow();
            },
          );

          it('does not throw if no origin and delegation from internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);

            data.primaryType = PRIMARY_TYPE_DELEGATION;
            data.types.Delegation = [{ name: 'delegator', type: 'address' }];
            data.message.delegator = INTERNAL_ACCOUNT_MOCK;

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: ['0x1234', INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data,
                  from: '0x3244e191f1b4903970224322180f1fbbc415696b',
                },
                request: REQUEST_MOCK,
                version,
              }),
            ).not.toThrow();
          });
        });

        describe('address fields', () => {
          type NestedDataMock = {
            from: { wallet: Json; wallets: Json[] } | null;
            to?: { wallet: Json; wallets: Json[] }[];
          };

          /**
           * Build typed data with nested structs and arrays of addresses.
           *
           * @param message - The address values of the message.
           * @returns The typed data.
           */
          function buildNestedData(
            message: NestedDataMock = {
              from: {
                wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
                wallets: ['0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826'],
              },
              to: [
                {
                  wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
                  wallets: [],
                },
              ],
            },
          ): MessageParamsTypedData {
            return {
              types: {
                EIP712Domain: [
                  { name: 'name', type: 'string' },
                  { name: 'chainId', type: 'uint256' },
                  { name: 'verifyingContract', type: 'address' },
                ],
                Person: [
                  { name: 'wallet', type: 'address' },
                  { name: 'wallets', type: 'address[]' },
                ],
                Mail: [
                  { name: 'from', type: 'Person' },
                  { name: 'to', type: 'Person[]' },
                  { name: 'contents', type: 'string' },
                ],
              },
              primaryType: 'Mail',
              domain: {
                name: 'Ether Mail',
                chainId: 1,
                verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
              },
              message: { ...message, contents: 'Hello, Bob!' },
            };
          }

          it('does not throw if external origin and all address fields are hex addresses', () => {
            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: [INTERNAL_ACCOUNT_MOCK],
                messageData: { data: buildNestedData(), from: FROM_MOCK },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).not.toThrow();
          });

          it('does not throw if external origin and struct fields are missing or null', () => {
            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: [INTERNAL_ACCOUNT_MOCK],
                messageData: {
                  data: buildNestedData({ from: null }),
                  from: FROM_MOCK,
                },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).not.toThrow();
          });

          it.each([
            [
              'message.from.wallet',
              (value: Json): NestedDataMock => ({
                from: { wallet: value, wallets: [] },
              }),
            ],
            [
              'message.from.wallets[1]',
              (value: Json): NestedDataMock => ({
                from: { wallet: FROM_MOCK, wallets: [FROM_MOCK, value] },
              }),
            ],
            [
              'message.to[0].wallet',
              (value: Json): NestedDataMock => ({
                from: null,
                to: [{ wallet: value, wallets: [] }],
              }),
            ],
            [
              'message.to[0].wallets[0]',
              (value: Json): NestedDataMock => ({
                from: null,
                to: [{ wallet: FROM_MOCK, wallets: [value] }],
              }),
            ],
          ])(
            'throws if external origin and %s is not a hex address',
            (path, buildMessage) => {
              for (const [, value] of NON_CANONICAL_INTERNAL_ACCOUNTS_MOCK) {
                const data = buildNestedData(buildMessage(value));

                expect(() =>
                  validateTypedSignatureRequest({
                    currentChainId: CHAIN_ID_MOCK,
                    internalAccounts: [INTERNAL_ACCOUNT_MOCK],
                    messageData: { data, from: FROM_MOCK },
                    request: { origin: ORIGIN_MOCK } as OriginalRequest,
                    version,
                  }),
                ).toThrow(
                  `External signature requests must specify "${path}" as a hex address.`,
                );

                expect(() =>
                  validateTypedSignatureRequest({
                    currentChainId: CHAIN_ID_MOCK,
                    internalAccounts: [INTERNAL_ACCOUNT_MOCK],
                    messageData: { data, from: FROM_MOCK },
                    request: { origin: ORIGIN_METAMASK } as OriginalRequest,
                    version,
                  }),
                ).not.toThrow();
              }
            },
          );

          it('does not validate domain fields if domain type is not defined', () => {
            const data = buildNestedData();
            delete data.types.EIP712Domain;
            data.domain.verifyingContract = '123';

            expect(() =>
              validateTypedSignatureRequest({
                currentChainId: CHAIN_ID_MOCK,
                internalAccounts: [INTERNAL_ACCOUNT_MOCK],
                messageData: { data, from: FROM_MOCK },
                request: { origin: ORIGIN_MOCK } as OriginalRequest,
                version,
              }),
            ).not.toThrow();
          });
        });
      },
    );
  });
});
