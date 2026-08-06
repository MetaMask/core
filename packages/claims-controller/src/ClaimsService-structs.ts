import {
  array,
  enums,
  integer,
  optional,
  string,
  type,
} from '@metamask/superstruct';

import { ClaimStatusEnum } from './constants.js';

const HexStringStruct = string();

const AttachmentStruct = type({
  publicUrl: string(),
  contentType: string(),
  originalname: string(),
});

export const ClaimStruct = type({
  id: string(),
  shortId: string(),
  chainId: string(),
  email: string(),
  impactedWalletAddress: HexStringStruct,
  impactedTxHash: HexStringStruct,
  reimbursementWalletAddress: HexStringStruct,
  description: string(),
  signature: HexStringStruct,
  attachments: optional(array(AttachmentStruct)),
  status: enums(Object.values(ClaimStatusEnum)),
  createdAt: string(),
  updatedAt: string(),
  intercomId: optional(string()),
});

export const ClaimsConfigurationsResponseStruct = type({
  validSubmissionWindowDays: integer(),
  networks: array(integer()),
});

export const GenerateSignatureMessageResponseStruct = type({
  message: string(),
  nonce: string(),
});
