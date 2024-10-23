import { convertHexToDecimal, toHex } from '@metamask/controller-utils';
import { SignTypedDataVersion } from '@metamask/keyring-controller';

import type {
  MessageParams,
  MessageParamsPersonal,
  MessageParamsTyped,
} from '../types';
import {
  validatePersonalSignatureRequest,
  validateTypedSignatureRequest,
} from './validation';

const CHAIN_ID_MOCK = '0x1';

const DATA_TYPED_MOCK =
  '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Person":[{"name":"name","type":"string"},{"name":"wallet","type":"address"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person"},{"name":"contents","type":"string"}]},"primaryType":"Mail","domain":{"name":"Ether Mail","version":"1","chainId":1,"verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"},"message":{"from":{"name":"Cow","wallet":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},"to":{"name":"Bob","wallet":"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},"contents":"Hello, Bob!"}}';

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
        validateTypedSignatureRequest(
          params as MessageParamsTyped,
          SignTypedDataVersion.V1,
          CHAIN_ID_MOCK,
        ),
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
          validateTypedSignatureRequest(
            {
              data: '0x879a05',
              from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            },
            SignTypedDataVersion.V1,
            CHAIN_ID_MOCK,
          ),
        ).toThrow('Invalid message "data":');
      });

      it('throws if no data', () => {
        expect(() =>
          validateTypedSignatureRequest(
            {
              from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            } as MessageParamsTyped,
            SignTypedDataVersion.V1,
            CHAIN_ID_MOCK,
          ),
        ).toThrow('Invalid message "data":');
      });

      it('throws if invalid type data', () => {
        expect(() =>
          validateTypedSignatureRequest(
            {
              data: [],
              from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            } as MessageParamsTyped,
            SignTypedDataVersion.V1,
            CHAIN_ID_MOCK,
          ),
        ).toThrow('Expected EIP712 typed data.');
      });
    });

    describe.each([SignTypedDataVersion.V3, SignTypedDataVersion.V4])(
      '%s',
      (version) => {
        it('throws if array data', () => {
          expect(() =>
            validateTypedSignatureRequest(
              {
                data: [],
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              version,
              CHAIN_ID_MOCK,
            ),
          ).toThrow('Invalid message "data":');
        });

        it('throws if no array data', () => {
          expect(() =>
            validateTypedSignatureRequest(
              {
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              } as MessageParamsTyped,
              version,
              CHAIN_ID_MOCK,
            ),
          ).toThrow('Invalid message "data":');
        });

        it('throws if no JSON valid data', () => {
          expect(() =>
            validateTypedSignatureRequest(
              {
                data: 'uh oh',
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              } as MessageParamsTyped,
              version,
              CHAIN_ID_MOCK,
            ),
          ).toThrow('Data must be passed as a valid JSON string.');
        });

        it('throws if current chain ID is not present', () => {
          expect(() =>
            validateTypedSignatureRequest(
              {
                data: DATA_TYPED_MOCK,
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              version,
              undefined,
            ),
          ).toThrow('Current chainId cannot be null or undefined.');
        });

        it('throws if current chain ID is not convertible to integer', () => {
          const unexpectedChainId = 'unexpected chain id';

          expect(() =>
            validateTypedSignatureRequest(
              {
                data: DATA_TYPED_MOCK.replace(`"chainId":1`, `"chainId":"0x1"`),
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              version,
              unexpectedChainId as never,
            ),
          ).toThrow(
            `Cannot sign messages for chainId "${String(
              convertHexToDecimal(CHAIN_ID_MOCK),
            )}", because MetaMask is switching networks.`,
          );
        });

        it('throws if current chain ID is not matched with provided in message data', () => {
          const chainId = toHex(2);

          expect(() =>
            validateTypedSignatureRequest(
              {
                data: DATA_TYPED_MOCK,
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              version,
              chainId,
            ),
          ).toThrow(
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `Provided chainId "${convertHexToDecimal(
              CHAIN_ID_MOCK,
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            )}" must match the active chainId "${convertHexToDecimal(
              chainId,
            )}"`,
          );
        });

        it('throws if data not in typed message schema', () => {
          expect(() =>
            validateTypedSignatureRequest(
              {
                data: '{"greetings":"I am Alice"}',
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              version,
              CHAIN_ID_MOCK,
            ),
          ).toThrow('Data must conform to EIP-712 schema.');
        });

        it('does not throw if data is correct', () => {
          expect(() =>
            validateTypedSignatureRequest(
              {
                data: DATA_TYPED_MOCK.replace(`"chainId":1`, `"chainId":"1"`),
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              version,
              CHAIN_ID_MOCK,
            ),
          ).not.toThrow();
        });

        it('does not throw if data is correct (object format)', () => {
          expect(() =>
            validateTypedSignatureRequest(
              {
                data: JSON.parse(DATA_TYPED_MOCK),
                from: '0x3244e191f1b4903970224322180f1fbbc415696b',
              },
              version,
              CHAIN_ID_MOCK,
            ),
          ).not.toThrow();
        });
      },
    );
  });
});
