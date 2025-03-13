import { ORIGIN_METAMASK } from '@metamask/approval-controller';
import { convertHexToDecimal, toHex } from '@metamask/controller-utils';
import { SignTypedDataVersion } from '@metamask/keyring-controller';

import {
  validatePersonalSignatureRequest,
  validateTypedSignatureRequest,
} from './validation';
import type {
  MessageParams,
  MessageParamsPersonal,
  MessageParamsTyped,
  OriginalRequest,
} from '../types';
import { Hex } from '@metamask/utils';

const CHAIN_ID_MOCK = '0x1';
const ORIGIN_MOCK = 'test.com';
const INTERNAL_ACCOUNT_MOCK = '0x12345678abcd';

const DATA_TYPED_MOCK =
  '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Person":[{"name":"name","type":"string"},{"name":"wallet","type":"address"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person"},{"name":"contents","type":"string"}]},"primaryType":"Mail","domain":{"name":"Ether Mail","version":"1","chainId":1,"verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"},"message":{"from":{"name":"Cow","wallet":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},"to":{"name":"Bob","wallet":"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},"contents":"Hello, Bob!"}}';

const REQUEST_MOCK = {} as OriginalRequest;

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
            } as MessageParamsTyped,
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
              } as MessageParamsTyped,
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
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.

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

            data.primaryType = 'Delegation';
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

            data.primaryType = 'Delegation';
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

            data.primaryType = 'Delegation';
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

            data.primaryType = 'Delegation';
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

          it('does not throw if no origin and delegation from internal account', () => {
            const data = JSON.parse(DATA_TYPED_MOCK);

            data.primaryType = 'Delegation';
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
      },
    );
  });
});
