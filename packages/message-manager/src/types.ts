import type { SIWEMessage } from '@metamask/controller-utils';

import type { AbstractMessageParams } from './AbstractMessageManager';

// Below types are have been moved into KeyringController, but are still exported here for backwards compatibility.

export type SignTypedDataMessageV3V4 = {
  types: Record<string, unknown>;
  domain: Record<string, unknown>;
  primaryType: string;
  message: unknown;
};

export type PersonalMessageParams = {
  data: string;
  siwe?: SIWEMessage;
} & AbstractMessageParams;

export type TypedMessageParams = {
  data: Record<string, unknown>[] | string | SignTypedDataMessageV3V4;
} & AbstractMessageParams;
