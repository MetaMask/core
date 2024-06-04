import { size, string } from '@metamask/superstruct';

import { base64 } from './base64';

export const ChecksumStruct = size(
  base64(string(), { paddingRequired: true }),
  44,
  44,
);
