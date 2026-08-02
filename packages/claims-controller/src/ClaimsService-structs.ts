import {
  array,
  enums,
  integer,
  object,
  optional,
  string,
} from '@metamask/superstruct';

import { ClaimStatusEnum } from './constants.js';

const HexStringStruct = string();

const AttachmentStruct = object({
  publicUrl: string(),
  contentType: string(),
  originalname: string(),
});

export const ClaimStruct = object({
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

export const ClaimsConfigurationsResponseStruct = object({
  validSubmissionWindowDays: integer(),
  networks: array(integer()),
});

export const GenerateSignatureMessageResponseStruct = object({
  message: string(),
  nonce: string(),
});
