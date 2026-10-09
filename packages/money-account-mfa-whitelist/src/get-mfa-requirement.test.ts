import { encode } from '@metamask/abi-utils';
import {
  ROOT_AUTHORITY,
  createERC20TransferAmountTerms,
  createExactExecutionTerms,
  createLimitedCallsTerms,
  createRedeemerTerms,
  createValueLteTerms,
} from '@metamask/delegation-core';
import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
import { bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  CARD_SIGN_IN_DOMAIN,
  CHAIN_ID,
  CONFIG,
  CONTRACTS,
  MONEY_ACCOUNT,
  MUSD,
  NOW,
  PREMIUM_VAULT,
  RECIPIENT,
  VAULT,
  buildApproveCall,
  buildDepositCalls,
  buildSingleUseDelegation,
  buildStandingDelegation,
  buildWithdrawCalls,
  UNRELATED_HASH,
  getDelegationTypedData,
  hashRequest,
  toHexMessage,
  wrapInExecute,
} from '../tests/fixtures.js';
import type { Execution, UnsignedDelegation } from '../tests/fixtures.js';
import {
  ERC7579_BATCH_DEFAULT_MODE,
  ERC7821_EXECUTE_SELECTOR,
} from './constants.js';
import { getMfaRequirement } from './get-mfa-requirement.js';
import type {
  MfaRequirement,
  MfaWhitelistConfig,
  MoneyAccountSignatureRequest,
  MoneyAccountSigningRequest,
} from './types.js';

const MINUTE = 60 * 1000;

/**
 * Evaluates a request at {@link NOW}, together with the hash a keyring
 * signs for it.
 *
 * @param request - The signature request.
 * @param config - The whitelist config.
 * @returns The MFA requirement.
 */
function evaluate(
  request: MoneyAccountSignatureRequest,
  config: MfaWhitelistConfig = CONFIG,
): MfaRequirement {
  return getMfaRequirement({ hash: hashRequest(request), request }, config, {
    now: NOW,
  });
}

/**
 * Evaluates a personal message from the Money Account.
 *
 * @param message - The message text.
 * @param config - The whitelist config.
 * @returns The MFA requirement.
 */
function evaluateMessage(
  message: string,
  config?: MfaWhitelistConfig,
): MfaRequirement {
  return evaluate(
    {
      method: 'signPersonalMessage',
      address: MONEY_ACCOUNT,
      message: toHexMessage(message),
    },
    config,
  );
}

/**
 * Evaluates typed data V4 from the Money Account.
 *
 * @param data - The typed data.
 * @returns The MFA requirement.
 */
function evaluateTypedData(data: unknown): MfaRequirement {
  return evaluate({
    method: 'signTypedData',
    address: MONEY_ACCOUNT,
    version: 'V4',
    data,
  });
}

/**
 * Signs a delegation through `DelegationController` and evaluates the typed
 * data the Money keyring receives.
 *
 * @param delegation - The unsigned delegation.
 * @returns The MFA requirement.
 */
async function evaluateDelegation(
  delegation: UnsignedDelegation,
): Promise<MfaRequirement> {
  return evaluateTypedData(await getDelegationTypedData(delegation));
}

type TypedDataField = { name: string; type: string } & Record<string, unknown>;

/** Delegation typed data, typed loosely enough to corrupt it in tests. */
type TypedData = {
  types: Record<string, TypedDataField[]>;
  domain: Record<string, unknown>;
  message: Record<string, unknown> & { caveats: Record<string, unknown>[] };
};

type ModifyTypedData = (typedData: TypedData) => void;

/**
 * Evaluates the typed data of a delegation after modifying it.
 *
 * @param modify - Modifies a copy of the typed data in place.
 * @param delegation - The unsigned delegation.
 * @returns The MFA requirement.
 */
async function evaluateModifiedTypedData(
  modify: ModifyTypedData,
  delegation: UnsignedDelegation = buildStandingDelegation(),
): Promise<MfaRequirement> {
  const typedData = structuredClone(
    await getDelegationTypedData(delegation),
  ) as TypedData;
  modify(typedData);
  return evaluateTypedData(typedData);
}

const MALFORMED_REASON = /^Request is malformed: /u;

/**
 * Gets the reason a request requires MFA.
 *
 * @param requirement - The MFA requirement.
 * @returns The reason, or `undefined` if the request is whitelisted.
 */
function getReason(requirement: MfaRequirement): string | undefined {
  return requirement.mfaRequired ? requirement.reason : undefined;
}

/**
 * Builds a card provider sign-in message, as Mobile's `BaanxProvider` does.
 *
 * @param overrides - Fields to override.
 * @returns The message text.
 */
function buildCardSignInMessage(
  overrides: Partial<{
    domain: string;
    address: string;
    uri: string;
    chainId: string;
    issuedAt: string;
    expirationTime: string;
  }> = {},
): string {
  const {
    domain = CARD_SIGN_IN_DOMAIN,
    address = MONEY_ACCOUNT,
    uri = `https://${domain}`,
    chainId = '143',
    issuedAt = new Date(NOW).toISOString(),
    expirationTime = new Date(NOW + 2 * MINUTE).toISOString(),
  } = overrides;
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nProve address ownership\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: 5f2c1e0a-nonce\nIssued At: ${issuedAt}\nExpiration Time: ${expirationTime}`;
}

const whitelistedAs = (rule: string): MfaRequirement =>
  ({ mfaRequired: false, rule }) as MfaRequirement;

const mfaRequired = (reason: string): MfaRequirement => ({
  mfaRequired: true,
  reason,
});

describe('getMfaRequirement', () => {
  describe('request validation', () => {
    it('requires MFA when the address is not an address', () => {
      expect(
        evaluate({
          method: 'signPersonalMessage',
          address: '0x1234',
          message: toHexMessage(`CHOMP Authentication ${NOW}`),
        }),
      ).toStrictEqual(mfaRequired('Request address is not an address'));
    });

    it('requires MFA for an unsupported method', () => {
      expect(
        evaluate({
          method: 'signTransaction',
          address: MONEY_ACCOUNT,
        } as unknown as MoneyAccountSignatureRequest),
      ).toStrictEqual(mfaRequired('Request method is not supported'));
    });

    it('requires MFA instead of throwing on a malformed request', () => {
      expect(
        getReason(evaluate(null as unknown as MoneyAccountSignatureRequest)),
      ).toMatch(MALFORMED_REASON);
    });

    it('requires MFA instead of throwing on a malformed signing request', () => {
      expect(
        getReason(
          getMfaRequirement(
            null as unknown as MoneyAccountSigningRequest,
            CONFIG,
          ),
        ),
      ).toMatch(MALFORMED_REASON);
    });

    it('requires MFA when the request throws a non-error', () => {
      const nonError = 'boom';
      const request = {
        get address(): Hex {
          // Intentionally throw a non-Error to test how it is reported
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw nonError;
        },
      } as unknown as MoneyAccountSignatureRequest;

      expect(evaluate(request)).toStrictEqual(
        mfaRequired('Request is malformed: boom'),
      );
    });

    it('uses the current time by default', () => {
      const request: MoneyAccountSignatureRequest = {
        method: 'signPersonalMessage',
        address: MONEY_ACCOUNT,
        message: toHexMessage(`CHOMP Authentication ${Date.now()}`),
      };

      expect(
        getMfaRequirement({ hash: hashRequest(request), request }, CONFIG),
      ).toStrictEqual(whitelistedAs('chomp-authentication'));
    });
  });

  describe('hash binding', () => {
    const chompAuthentication: MoneyAccountSignatureRequest = {
      method: 'signPersonalMessage',
      address: MONEY_ACCOUNT,
      message: toHexMessage(`CHOMP Authentication ${NOW}`),
    };

    const authorization: MoneyAccountSignatureRequest = {
      method: 'signEip7702Authorization',
      address: MONEY_ACCOUNT,
      authorization: [143, CONTRACTS.EIP7702StatelessDeleGatorImpl, 0],
    };

    /**
     * Builds the request for a delegation, as the Money keyring receives it.
     *
     * @param delegation - The unsigned delegation.
     * @returns The signature request.
     */
    async function buildDelegationRequest(
      delegation: UnsignedDelegation,
    ): Promise<MoneyAccountSignatureRequest> {
      return {
        method: 'signTypedData',
        address: MONEY_ACCOUNT,
        version: 'V4',
        data: await getDelegationTypedData(delegation),
      };
    }

    it.each([
      ['not hex', 'CHOMP'],
      ['shorter than 32 bytes', `0x${'ab'.repeat(31)}`],
      ['longer than 32 bytes', `0x${'ab'.repeat(33)}`],
      ['not a string', 1],
    ])('requires MFA when the hash is %s', (_description, hash) => {
      expect(
        getMfaRequirement(
          { hash: hash as Hex, request: chompAuthentication },
          CONFIG,
          { now: NOW },
        ),
      ).toStrictEqual(mfaRequired('Hash is not 32 bytes'));
    });

    it('accepts the hash in any case', () => {
      expect(
        getMfaRequirement(
          {
            hash: `0x${hashRequest(chompAuthentication).slice(2).toUpperCase()}`,
            request: chompAuthentication,
          },
          CONFIG,
          { now: NOW },
        ),
      ).toStrictEqual(whitelistedAs('chomp-authentication'));
    });

    it('requires MFA when a whitelisted message comes with the hash of another message', () => {
      const otherMessage: MoneyAccountSignatureRequest = {
        ...chompAuthentication,
        message: toHexMessage('Transfer everything'),
      };

      expect(
        getMfaRequirement(
          { hash: hashRequest(otherMessage), request: chompAuthentication },
          CONFIG,
          { now: NOW },
        ),
      ).toStrictEqual(mfaRequired('Hash does not match the request'));
    });

    it('requires MFA when a whitelisted authorization comes with the hash of another authorization', () => {
      const otherAuthorization: MoneyAccountSignatureRequest = {
        ...authorization,
        authorization: [143, RECIPIENT, 0],
      };

      expect(
        getMfaRequirement(
          { hash: hashRequest(otherAuthorization), request: authorization },
          CONFIG,
          { now: NOW },
        ),
      ).toStrictEqual(mfaRequired('Hash does not match the request'));
    });

    it('requires MFA when a whitelisted deposit comes with the hash of a withdrawal', async () => {
      const deposit = await buildDelegationRequest(
        buildSingleUseDelegation(buildDepositCalls()),
      );
      const withdrawal = await buildDelegationRequest(
        buildSingleUseDelegation(buildWithdrawCalls()),
      );

      expect(
        getMfaRequirement(
          { hash: hashRequest(withdrawal), request: deposit },
          CONFIG,
          { now: NOW },
        ),
      ).toStrictEqual(mfaRequired('Hash does not match the request'));
    });

    it('requires MFA when a whitelisted delegation comes with the hash of the same delegation with another salt', async () => {
      const delegation = buildStandingDelegation();
      const request = await buildDelegationRequest(delegation);
      const resalted = await buildDelegationRequest({
        ...delegation,
        salt: `0x${'ce'.repeat(32)}`,
      });

      expect(
        getMfaRequirement({ hash: hashRequest(resalted), request }, CONFIG, {
          now: NOW,
        }),
      ).toStrictEqual(mfaRequired('Hash does not match the request'));
    });

    it('requires MFA when a whitelisted delegation comes with an unrelated hash', async () => {
      const request = await buildDelegationRequest(buildStandingDelegation());

      expect(
        getMfaRequirement({ hash: UNRELATED_HASH, request }, CONFIG, {
          now: NOW,
        }),
      ).toStrictEqual(mfaRequired('Hash does not match the request'));
    });

    it('reports why a request is not whitelisted before checking its hash', () => {
      const request: MoneyAccountSignatureRequest = {
        ...chompAuthentication,
        message: toHexMessage('Transfer everything'),
      };

      expect(
        getMfaRequirement({ hash: UNRELATED_HASH, request }, CONFIG, {
          now: NOW,
        }),
      ).toStrictEqual(
        mfaRequired('Message does not match a whitelisted format'),
      );
    });

    it.each([0, 1, 127, 128, 255, 256, Number.MAX_SAFE_INTEGER])(
      'matches the hash of an authorization with nonce %d',
      (nonce) => {
        const request: MoneyAccountSignatureRequest = {
          ...authorization,
          authorization: [143, CONTRACTS.EIP7702StatelessDeleGatorImpl, nonce],
        };

        expect(evaluate(request)).toStrictEqual(
          whitelistedAs('eip7702-authorization'),
        );
      },
    );
  });

  describe('signPersonalMessage', () => {
    it('requires MFA when the message is not hex', () => {
      expect(
        evaluate({
          method: 'signPersonalMessage',
          address: MONEY_ACCOUNT,
          message: `CHOMP Authentication ${NOW}` as Hex,
        }),
      ).toStrictEqual(mfaRequired('Message is not hex-encoded UTF-8'));
    });

    it('requires MFA when the message is not valid UTF-8', () => {
      expect(
        evaluate({
          method: 'signPersonalMessage',
          address: MONEY_ACCOUNT,
          message: '0xff',
        }),
      ).toStrictEqual(mfaRequired('Message is not hex-encoded UTF-8'));
    });

    it('requires MFA for any other message', () => {
      expect(evaluateMessage('Sign in to example.com')).toStrictEqual(
        mfaRequired('Message does not match a whitelisted format'),
      );
    });

    describe('CHOMP authentication', () => {
      it('whitelists a message with a fresh timestamp', () => {
        expect(evaluateMessage(`CHOMP Authentication ${NOW}`)).toStrictEqual(
          whitelistedAs('chomp-authentication'),
        );
      });

      it('tolerates clock skew within the maximum message age', () => {
        expect(
          evaluateMessage(`CHOMP Authentication ${NOW + 4 * MINUTE}`),
        ).toStrictEqual(whitelistedAs('chomp-authentication'));
      });

      it('requires MFA for a stale timestamp', () => {
        expect(
          evaluateMessage(`CHOMP Authentication ${NOW - 6 * MINUTE}`),
        ).toStrictEqual(
          mfaRequired('CHOMP authentication timestamp is not fresh'),
        );
      });

      it('honours a configured maximum message age', () => {
        expect(
          evaluateMessage(`CHOMP Authentication ${NOW - 2 * MINUTE}`, {
            ...CONFIG,
            maxMessageAge: MINUTE,
          }),
        ).toStrictEqual(
          mfaRequired('CHOMP authentication timestamp is not fresh'),
        );
      });

      it('requires MFA for a message with extra content', () => {
        expect(
          evaluateMessage(`CHOMP Authentication ${NOW}\nand more`),
        ).toStrictEqual(
          mfaRequired('Message does not match a whitelisted format'),
        );
      });
    });

    describe('Rewards binding', () => {
      const bindingFor = (address: string, timestamp: number): string =>
        `metamask-rewards:money-account-binding:sub-123:${address}:${timestamp}`;

      it('whitelists a binding of the Money Account with a fresh timestamp', () => {
        expect(evaluateMessage(bindingFor(MONEY_ACCOUNT, NOW))).toStrictEqual(
          whitelistedAs('rewards-binding'),
        );
      });

      it('requires MFA for a binding of another address', () => {
        expect(evaluateMessage(bindingFor(RECIPIENT, NOW))).toStrictEqual(
          mfaRequired('Rewards binding is not for the Money Account'),
        );
      });

      it('requires MFA for a stale timestamp', () => {
        expect(
          evaluateMessage(bindingFor(MONEY_ACCOUNT, NOW - 10 * MINUTE)),
        ).toStrictEqual(mfaRequired('Rewards binding timestamp is not fresh'));
      });
    });

    describe('card provider sign-in', () => {
      it('whitelists a fresh sign-in message for the Money Account', () => {
        expect(evaluateMessage(buildCardSignInMessage())).toStrictEqual(
          whitelistedAs('card-sign-in'),
        );
      });

      it('requires MFA when no sign-in domain is configured', () => {
        expect(
          evaluateMessage(buildCardSignInMessage(), {
            ...CONFIG,
            cardSignInDomain: undefined,
          }),
        ).toStrictEqual(
          mfaRequired('Sign-in message is not for the card sign-in domain'),
        );
      });

      it('requires MFA for another domain', () => {
        expect(
          evaluateMessage(buildCardSignInMessage({ domain: 'evil.example' })),
        ).toStrictEqual(
          mfaRequired('Sign-in message is not for the card sign-in domain'),
        );
      });

      it('requires MFA when the URI does not match the domain', () => {
        expect(
          evaluateMessage(
            buildCardSignInMessage({ uri: 'https://evil.example' }),
          ),
        ).toStrictEqual(
          mfaRequired('Sign-in message URI does not match its domain'),
        );
      });

      it('requires MFA for another address', () => {
        expect(
          evaluateMessage(buildCardSignInMessage({ address: RECIPIENT })),
        ).toStrictEqual(
          mfaRequired('Sign-in message is not for the Money Account'),
        );
      });

      it('requires MFA for another chain', () => {
        expect(
          evaluateMessage(buildCardSignInMessage({ chainId: '59144' })),
        ).toStrictEqual(
          mfaRequired('Sign-in message is not for the Money Account chain'),
        );
      });

      it.each([
        ['issue time is not an ISO timestamp', { issuedAt: 'yesterday' }],
        [
          'issue time is not in canonical form',
          { issuedAt: '2026-10-09T12:00:00Z' },
        ],
        ['expiry is not an ISO timestamp', { expirationTime: 'soon' }],
        [
          'issue time is stale',
          {
            issuedAt: new Date(NOW - 10 * MINUTE).toISOString(),
            expirationTime: new Date(NOW - 8 * MINUTE).toISOString(),
          },
        ],
        [
          'expiry is not after the issue time',
          { expirationTime: new Date(NOW).toISOString() },
        ],
        [
          'expiry is too far after the issue time',
          { expirationTime: new Date(NOW + 10 * MINUTE).toISOString() },
        ],
        [
          'message has expired',
          {
            issuedAt: new Date(NOW - 3 * MINUTE).toISOString(),
            expirationTime: new Date(NOW - MINUTE).toISOString(),
          },
        ],
      ])('requires MFA when the %s', (_description, overrides) => {
        expect(
          evaluateMessage(buildCardSignInMessage(overrides)),
        ).toStrictEqual(mfaRequired('Sign-in message is expired or not fresh'));
      });
    });
  });

  describe('signEip7702Authorization', () => {
    const evaluateAuthorization = (authorization: unknown): MfaRequirement =>
      evaluate({
        method: 'signEip7702Authorization',
        address: MONEY_ACCOUNT,
        authorization: authorization as [number, Hex, number],
      });

    it('whitelists an authorization to the pinned DeleGator', () => {
      expect(
        evaluateAuthorization([
          143,
          CONTRACTS.EIP7702StatelessDeleGatorImpl.toLowerCase(),
          7,
        ]),
      ).toStrictEqual(whitelistedAs('eip7702-authorization'));
    });

    it('requires MFA when the authorization is not a tuple', () => {
      expect(evaluateAuthorization({ chainId: 143, nonce: 7 })).toStrictEqual(
        mfaRequired('Authorization is not a [chainId, address, nonce] tuple'),
      );
    });

    it.each([
      ['chain 0, which is valid on every chain', 0],
      ['another chain', 1],
      ['a chain ID that is not a number', '143'],
    ])('requires MFA for %s', (_description, chainId) => {
      expect(
        evaluateAuthorization([
          chainId,
          CONTRACTS.EIP7702StatelessDeleGatorImpl,
          7,
        ]),
      ).toStrictEqual(
        mfaRequired('Authorization is not for the Money Account chain'),
      );
    });

    it.each([
      ['another contract', RECIPIENT],
      ['a malformed address', '0x1234'],
    ])('requires MFA for %s', (_description, contractAddress) => {
      expect(evaluateAuthorization([143, contractAddress, 7])).toStrictEqual(
        mfaRequired('Authorization does not delegate to the pinned DeleGator'),
      );
    });

    it.each([-1, 1.5, '7'])('requires MFA for the nonce %p', (nonce) => {
      expect(
        evaluateAuthorization([
          143,
          CONTRACTS.EIP7702StatelessDeleGatorImpl,
          nonce,
        ]),
      ).toStrictEqual(
        mfaRequired('Authorization nonce is not a non-negative integer'),
      );
    });
  });

  describe('signTypedData', () => {
    it('requires MFA for typed data other than V4', async () => {
      expect(
        evaluate({
          method: 'signTypedData',
          address: MONEY_ACCOUNT,
          version: 'V3',
          data: await getDelegationTypedData(buildStandingDelegation()),
        }),
      ).toStrictEqual(mfaRequired('Only typed data V4 can be whitelisted'));
    });

    it('accepts typed data as a JSON string', async () => {
      const typedData = await getDelegationTypedData(buildStandingDelegation());
      const json = JSON.stringify(typedData, (_key, value: unknown): unknown =>
        typeof value === 'bigint' ? `0x${value.toString(16)}` : value,
      );

      expect(evaluateTypedData(json)).toStrictEqual(
        whitelistedAs('vault-standing-delegation'),
      );
    });

    it('requires MFA for invalid JSON', () => {
      expect(getReason(evaluateTypedData('{'))).toMatch(MALFORMED_REASON);
    });

    describe('typed data validation', () => {
      it.each([
        ['is not an object', null],
        ['is not a delegation', { primaryType: 'Permit' }],
      ])('requires MFA when the typed data %s', (_description, data) => {
        expect(evaluateTypedData(data)).toStrictEqual(
          mfaRequired('Typed data is not a delegation'),
        );
      });

      it.each<[string, ModifyTypedData]>([
        [
          'has an extra type',
          (data): void => {
            data.types.Extra = [];
          },
        ],
        [
          'is missing a type',
          (data): void => {
            delete data.types.EIP712Domain;
          },
        ],
        [
          'has a domain field with an unexpected type',
          (data): void => {
            data.types.EIP712Domain[2].type = 'uint64';
          },
        ],
        [
          'has reordered delegation fields',
          (data): void => {
            data.types.Delegation.reverse();
          },
        ],
        [
          'has a caveat field with extra keys',
          (data): void => {
            data.types.Caveat[0].extra = true;
          },
        ],
        [
          'is not an object',
          (data): void => {
            Object.assign(data, { types: [] });
          },
        ],
      ])('requires MFA when the types %s', async (_description, modify) => {
        expect(await evaluateModifiedTypedData(modify)).toStrictEqual(
          mfaRequired('Typed data types are not the delegation types'),
        );
      });

      it.each<[string, ModifyTypedData]>([
        [
          'is not an object',
          (data): void => {
            Object.assign(data, { domain: 'DelegationManager' });
          },
        ],
        [
          'has an extra field',
          (data): void => {
            data.domain.salt = '0x01';
          },
        ],
      ])('requires MFA when the domain %s', async (_description, modify) => {
        expect(await evaluateModifiedTypedData(modify)).toStrictEqual(
          mfaRequired('Typed data domain is malformed'),
        );
      });

      it.each([
        ['name', 'Other'],
        ['version', '2'],
        ['chainId', 1],
        ['chainId', 1.5],
        ['chainId', '-143'],
        ['verifyingContract', RECIPIENT],
        ['verifyingContract', 'DelegationManager'],
      ])('requires MFA when the domain %s is %p', async (field, value) => {
        expect(
          await evaluateModifiedTypedData((data) => {
            data.domain[field] = value;
          }),
        ).toStrictEqual(
          mfaRequired(
            'Delegation is not for the pinned DelegationManager and chain',
          ),
        );
      });

      it.each([
        ['a hex string', CHAIN_ID],
        ['a decimal string', '143'],
      ])('accepts the domain chain ID as %s', async (_description, chainId) => {
        expect(
          await evaluateModifiedTypedData((data) => {
            data.domain.chainId = chainId;
          }),
        ).toStrictEqual(whitelistedAs('vault-standing-delegation'));
      });

      it.each<[string, ModifyTypedData]>([
        [
          'the message is not an object',
          (data): void => {
            Object.assign(data, { message: 'delegation' });
          },
        ],
        [
          'the caveats are not an array',
          (data): void => {
            Object.assign(data.message, { caveats: {} });
          },
        ],
        [
          'a caveat is not an object',
          (data): void => {
            Object.assign(data.message.caveats, { 0: '0x' });
          },
        ],
        [
          'a caveat enforcer is not an address',
          (data): void => {
            data.message.caveats[0].enforcer = '0x1234';
          },
        ],
        [
          'caveat terms are not bytes',
          (data): void => {
            data.message.caveats[0].terms = '0x123';
          },
        ],
        [
          'caveat terms are not a string',
          (data): void => {
            data.message.caveats[0].terms = 1;
          },
        ],
        [
          'the delegate is not an address',
          (data): void => {
            data.message.delegate = 'CHOMP';
          },
        ],
        [
          'the delegator is not an address',
          (data): void => {
            data.message.delegator = undefined;
          },
        ],
        [
          'the authority is not bytes32',
          (data): void => {
            data.message.authority = '0xff';
          },
        ],
        [
          'the authority is not a string',
          (data): void => {
            data.message.authority = 1;
          },
        ],
        [
          'the salt is negative',
          (data): void => {
            data.message.salt = -1n;
          },
        ],
        [
          'the salt exceeds uint256',
          (data): void => {
            data.message.salt = 2n ** 256n;
          },
        ],
        [
          'the salt is missing',
          (data): void => {
            delete data.message.salt;
          },
        ],
      ])('requires MFA when %s', async (_description, modify) => {
        expect(await evaluateModifiedTypedData(modify)).toStrictEqual(
          mfaRequired('Delegation message is malformed'),
        );
      });

      it.each([
        ['a number', 1],
        ['a hex string', '0x01'],
        ['a decimal string', '1'],
      ])('accepts the salt as %s', async (_description, salt) => {
        expect(
          await evaluateModifiedTypedData((data) => {
            data.message.salt = salt;
          }),
        ).toStrictEqual(whitelistedAs('vault-standing-delegation'));
      });

      it('requires MFA when the delegator is not the Money Account', async () => {
        expect(
          await evaluateDelegation({
            ...buildStandingDelegation(),
            delegator: RECIPIENT,
          }),
        ).toStrictEqual(mfaRequired('Delegator is not the Money Account'));
      });

      it('requires MFA for a redelegation', async () => {
        expect(
          await evaluateDelegation({
            ...buildStandingDelegation(),
            authority: `0x${'12'.repeat(32)}`,
          }),
        ).toStrictEqual(mfaRequired('Delegation is not a root delegation'));
      });

      it('requires MFA for another delegate', async () => {
        expect(
          await evaluateDelegation({
            ...buildSingleUseDelegation(buildDepositCalls()),
            delegate: RECIPIENT,
          }),
        ).toStrictEqual(mfaRequired('Delegation delegate is not whitelisted'));
      });
    });

    describe('standing vault delegations', () => {
      it.each([
        ['cash-deposit (mUSD)', MUSD, VAULT.vedaVaultAdapterAddress],
        [
          'cash-withdrawal (vault shares)',
          VAULT.boringVault,
          VAULT.vedaVaultAdapterAddress,
        ],
        [
          'cash-deposit-premium (mUSD)',
          MUSD,
          PREMIUM_VAULT.vedaVaultAdapterAddress,
        ],
        [
          'cash-withdrawal-premium (premium vault shares)',
          PREMIUM_VAULT.boringVault,
          PREMIUM_VAULT.vedaVaultAdapterAddress,
        ],
      ])(
        'whitelists the %s delegation',
        async (_name, tokenAddress, redeemer) => {
          expect(
            await evaluateDelegation(
              buildStandingDelegation({ tokenAddress, redeemer }),
            ),
          ).toStrictEqual(whitelistedAs('vault-standing-delegation'));
        },
      );

      it('whitelists the caveats in any order', async () => {
        const delegation = buildStandingDelegation();
        delegation.caveats.reverse();

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          whitelistedAs('vault-standing-delegation'),
        );
      });

      it('requires MFA for the shares of another vault', async () => {
        expect(
          await evaluateDelegation(
            buildStandingDelegation({
              tokenAddress: PREMIUM_VAULT.boringVault,
              redeemer: VAULT.vedaVaultAdapterAddress,
            }),
          ),
        ).toStrictEqual(
          mfaRequired('Standing delegation token is not mUSD or vault shares'),
        );
      });

      it('requires MFA for a redeemer that is not a vault adapter', async () => {
        expect(
          await evaluateDelegation(
            buildStandingDelegation({ redeemer: RECIPIENT }),
          ),
        ).toStrictEqual(
          mfaRequired('Standing delegation redeemer is not a vault adapter'),
        );
      });

      it('requires MFA for more than one redeemer', async () => {
        const delegation = buildStandingDelegation();
        delegation.caveats[2].terms = createRedeemerTerms({
          redeemers: [VAULT.vedaVaultAdapterAddress, RECIPIENT],
        });

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          mfaRequired('Standing delegation has more than one redeemer'),
        );
      });

      it('requires MFA when native value is allowed', async () => {
        const delegation = buildStandingDelegation();
        delegation.caveats[0].terms = createValueLteTerms({ maxValue: 1n });

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          mfaRequired('Standing delegation allows native value'),
        );
      });

      it.each([
        [
          'a caveat is missing',
          (caveats: UnsignedDelegation['caveats']): void => {
            caveats.pop();
          },
        ],
        [
          'there is an extra caveat',
          (caveats: UnsignedDelegation['caveats']): void => {
            caveats.push({
              enforcer: CONTRACTS.LimitedCallsEnforcer,
              terms: createLimitedCallsTerms({ limit: 1 }),
              args: '0x',
            });
          },
        ],
        [
          'a caveat is duplicated',
          (caveats: UnsignedDelegation['caveats']): void => {
            caveats[2] = { ...caveats[1] };
          },
        ],
      ])('requires MFA when %s', async (_description, modify) => {
        const delegation = buildStandingDelegation();
        modify(delegation.caveats);

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          mfaRequired('Standing delegation caveats are not whitelisted'),
        );
      });

      it('requires MFA for malformed caveat terms', async () => {
        const delegation = buildStandingDelegation();
        delegation.caveats[1].terms = `${createERC20TransferAmountTerms({
          tokenAddress: MUSD,
          maxAmount: 1n,
        })}00`;

        expect(getReason(await evaluateDelegation(delegation))).toMatch(
          MALFORMED_REASON,
        );
      });
    });

    describe('single-use vault deposit delegations', () => {
      it.each([
        ['the extension', false],
        ['Mobile', true],
      ])(
        'whitelists a deposit pinned as individual calls, with caveats ordered as %s orders them',
        async (_client, mobileOrder) => {
          expect(
            await evaluateDelegation(
              buildSingleUseDelegation(buildDepositCalls(), { mobileOrder }),
            ),
          ).toStrictEqual(whitelistedAs('vault-deposit-delegation'));
        },
      );

      it.each([
        ['the extension', false],
        ['Mobile', true],
      ])(
        'whitelists a deposit pinned as the account execute(), with caveats ordered as %s orders them',
        async (_client, mobileOrder) => {
          expect(
            await evaluateDelegation(
              buildSingleUseDelegation([wrapInExecute(buildDepositCalls())], {
                mobileOrder,
              }),
            ),
          ).toStrictEqual(whitelistedAs('vault-deposit-delegation'));
        },
      );

      it('whitelists a deposit into the premium vault', async () => {
        expect(
          await evaluateDelegation(
            buildSingleUseDelegation(
              buildDepositCalls({ vault: PREMIUM_VAULT }),
            ),
          ),
        ).toStrictEqual(whitelistedAs('vault-deposit-delegation'));
      });

      it.each([
        ['a withdrawal', buildWithdrawCalls()],
        ['a wrapped withdrawal', [wrapInExecute(buildWithdrawCalls())]],
        [
          'a Card link approval',
          [wrapInExecute([buildApproveCall(MUSD, RECIPIENT, 2n ** 41n - 1n)])],
        ],
        [
          'a Card unlink approval',
          [wrapInExecute([buildApproveCall(MUSD, RECIPIENT, 0n)])],
        ],
        [
          'a deposit followed by a transfer',
          [...buildDepositCalls(), buildWithdrawCalls()[1]],
        ],
        ['an approval of the vault alone', [buildDepositCalls()[0]]],
      ])('requires MFA for %s', async (_description, executions) => {
        expect(
          await evaluateDelegation(buildSingleUseDelegation(executions)),
        ).toStrictEqual(
          mfaRequired('Delegation executions are not a vault deposit'),
        );
      });

      describe('deposit calls', () => {
        /**
         * Evaluates a delegation pinning modified deposit calls.
         *
         * @param modify - Modifies the approve and deposit calls in place.
         * @returns The MFA requirement.
         */
        async function evaluateModifiedDeposit(
          modify: (calls: Execution[]) => void,
        ): Promise<MfaRequirement> {
          const calls = buildDepositCalls();
          modify(calls);
          return evaluateDelegation(buildSingleUseDelegation(calls));
        }

        it.each([
          [
            'the approval sends native value',
            (calls: Execution[]): void => {
              calls[0].value = 1n;
            },
          ],
          [
            'the deposit sends native value',
            (calls: Execution[]): void => {
              calls[1].value = 1n;
            },
          ],
          [
            'the approval is not on mUSD',
            (calls: Execution[]): void => {
              calls[0].target = VAULT.boringVault;
            },
          ],
          [
            'the first call is not an approval',
            (calls: Execution[]): void => {
              calls[0] = { ...buildWithdrawCalls()[1] };
            },
          ],
          [
            'the approval calldata is truncated',
            (calls: Execution[]): void => {
              calls[0].callData = calls[0].callData.slice(0, 40) as Hex;
            },
          ],
          [
            'the approval calldata has trailing bytes',
            (calls: Execution[]): void => {
              calls[0].callData = `${calls[0].callData}00`;
            },
          ],
          [
            'the spender is not a vault',
            (calls: Execution[]): void => {
              calls[0] = buildApproveCall(MUSD, RECIPIENT, 1_000_000n);
            },
          ],
          [
            'the deposit is on the teller of another vault',
            (calls: Execution[]): void => {
              calls[1].target = PREMIUM_VAULT.tellerAddress;
            },
          ],
          [
            'the second call is not a deposit',
            (calls: Execution[]): void => {
              calls[1] = { ...buildWithdrawCalls()[0] };
            },
          ],
          [
            'the deposit asset is not mUSD',
            (calls: Execution[]): void => {
              calls[1] = buildDepositCalls()[1];
              calls[1].callData = calls[1].callData.replace(
                MUSD.slice(2).toLowerCase(),
                RECIPIENT.slice(2),
              ) as Hex;
            },
          ],
          [
            'the deposit amount differs from the approval',
            (calls: Execution[]): void => {
              calls[0] = buildDepositCalls({ amount: 2_000_000n })[0];
            },
          ],
          [
            'the referral is set',
            (calls: Execution[]): void => {
              calls[1].callData =
                `${calls[1].callData.slice(0, -40)}${RECIPIENT.slice(2)}` as Hex;
            },
          ],
        ])('requires MFA when %s', async (_description, modify) => {
          expect(await evaluateModifiedDeposit(modify)).toStrictEqual(
            mfaRequired('Delegation executions are not a vault deposit'),
          );
        });

        it('requires MFA for a zero amount', async () => {
          expect(
            await evaluateDelegation(
              buildSingleUseDelegation(buildDepositCalls({ amount: 0n })),
            ),
          ).toStrictEqual(
            mfaRequired('Delegation executions are not a vault deposit'),
          );
        });
      });

      describe('execute() wrapper', () => {
        /**
         * Builds an `execute()` call on the Money Account.
         *
         * @param mode - The ERC-7579 mode.
         * @param executionData - The encoded calls.
         * @returns The execution.
         */
        function buildExecute(mode: Hex, executionData: Hex): Execution {
          return {
            target: MONEY_ACCOUNT,
            value: 0n,
            callData: `${ERC7821_EXECUTE_SELECTOR}${bytesToHex(
              encode(['bytes32', 'bytes'], [mode, executionData]),
            ).slice(2)}`,
          };
        }

        const encodedDepositCalls = bytesToHex(
          encode(
            ['(address,uint256,bytes)[]'],
            [
              buildDepositCalls().map(({ target, value, callData }) => [
                target,
                value,
                callData,
              ]),
            ],
          ),
        );

        it('whitelists a hand-encoded atomic batch', async () => {
          expect(
            await evaluateDelegation(
              buildSingleUseDelegation([
                buildExecute(ERC7579_BATCH_DEFAULT_MODE, encodedDepositCalls),
              ]),
            ),
          ).toStrictEqual(whitelistedAs('vault-deposit-delegation'));
        });

        it.each([
          [
            'sends native value',
            {
              ...wrapInExecute(buildDepositCalls()),
              value: 1n,
            },
          ],
          [
            'is not an execute() call',
            buildApproveCall(MONEY_ACCOUNT, RECIPIENT, 1n),
          ],
          [
            'is a non-atomic batch',
            {
              target: MONEY_ACCOUNT,
              value: 0n,
              callData: generateEIP7702BatchTransaction(
                MONEY_ACCOUNT,
                buildDepositCalls().map(({ target, callData }) => ({
                  to: target,
                  data: callData,
                })),
                { atomic: false },
              ).data as Hex,
            },
          ],
          [
            'has trailing bytes',
            {
              ...wrapInExecute(buildDepositCalls()),
              callData: `${wrapInExecute(buildDepositCalls()).callData}00`,
            },
          ],
          [
            'has calls with trailing bytes',
            buildExecute(
              ERC7579_BATCH_DEFAULT_MODE,
              `${encodedDepositCalls}${'00'.repeat(32)}`,
            ),
          ],
        ])(
          'requires MFA when the account call %s',
          async (_description, execution) => {
            expect(
              await evaluateDelegation(
                buildSingleUseDelegation([execution as Execution]),
              ),
            ).toStrictEqual(
              mfaRequired('Delegation does not pin its executions'),
            );
          },
        );
      });

      it('requires MFA when the batch terms have trailing bytes', async () => {
        const delegation = buildSingleUseDelegation(buildDepositCalls());
        delegation.caveats[1].terms = `${delegation.caveats[1].terms}${'00'.repeat(32)}`;

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          mfaRequired('Delegation does not pin its executions'),
        );
      });

      it('requires MFA when the second caveat is not an exact execution', async () => {
        const delegation = buildSingleUseDelegation(buildDepositCalls());
        delegation.caveats[1] = {
          enforcer: CONTRACTS.ValueLteEnforcer,
          terms: createValueLteTerms({ maxValue: 0n }),
          args: '0x',
        };

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          mfaRequired('Delegation does not pin its executions'),
        );
      });

      it('requires MFA when the delegation allows more than one call', async () => {
        const delegation = buildSingleUseDelegation(buildDepositCalls());
        delegation.caveats[0].terms = createLimitedCallsTerms({ limit: 2 });

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          mfaRequired('Delegation is not limited to a single call'),
        );
      });

      it.each([
        [
          'LimitedCalls is missing',
          (caveats: UnsignedDelegation['caveats']): void => {
            caveats.shift();
          },
        ],
        [
          'LimitedCalls is duplicated',
          (caveats: UnsignedDelegation['caveats']): void => {
            caveats[1] = { ...caveats[0] };
          },
        ],
        [
          'there is an extra caveat',
          (caveats: UnsignedDelegation['caveats']): void => {
            caveats.push({
              enforcer: CONTRACTS.ExactExecutionEnforcer,
              terms: createExactExecutionTerms({
                execution: buildDepositCalls()[0],
              }),
              args: '0x',
            });
          },
        ],
        [
          'there is no caveat but LimitedCalls',
          (caveats: UnsignedDelegation['caveats']): void => {
            caveats.pop();
          },
        ],
      ])('requires MFA when %s', async (_description, modify) => {
        const delegation = buildSingleUseDelegation(buildDepositCalls());
        modify(delegation.caveats);

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          mfaRequired('Single-use delegation caveats are not whitelisted'),
        );
      });

      it('does not depend on the caveat args', async () => {
        const delegation = buildSingleUseDelegation(buildDepositCalls());
        delegation.caveats[0].args = '0x1234';

        expect(await evaluateDelegation(delegation)).toStrictEqual(
          whitelistedAs('vault-deposit-delegation'),
        );
      });
    });

    it('accepts the root authority in any case', async () => {
      expect(
        await evaluateDelegation({
          ...buildStandingDelegation(),
          authority: ROOT_AUTHORITY.toUpperCase().replace('0X', '0x') as Hex,
        }),
      ).toStrictEqual(whitelistedAs('vault-standing-delegation'));
    });
  });
});
