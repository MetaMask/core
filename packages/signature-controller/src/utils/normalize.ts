import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { add0x, bytesToHex, remove0x } from '@metamask/utils';

import type { MessageParamsPersonal, MessageParamsTyped } from '../types';

/**
 * Normalize personal message params.
 * @param messageParams - The message params to normalize.
 * @returns The normalized message params.
 */
export function normalizePersonalMessageParams(
  messageParams: MessageParamsPersonal,
): MessageParamsPersonal {
  return {
    ...messageParams,
    data: normalizePersonalMessageData(messageParams.data),
  };
}

/**
 * Normalize typed message params.
 * @param messageParams - The message params to normalize.
 * @param version - The version of the typed signature request.
 * @returns The normalized message params.
 */
export function normalizeTypedMessageParams(
  messageParams: MessageParamsTyped,
  version: SignTypedDataVersion,
): MessageParamsTyped {
  const normalizedMessageParams = { ...messageParams };

  if (
    typeof messageParams.data !== 'string' &&
    (version === SignTypedDataVersion.V3 || version === SignTypedDataVersion.V4)
  ) {
    normalizedMessageParams.data = JSON.stringify(messageParams.data);
  }

  return normalizedMessageParams;
}

/**
 * Converts raw message data buffer to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
function normalizePersonalMessageData(data: string) {
  try {
    const stripped = remove0x(data);

    if (stripped.match(/^[0-9A-Fa-f]+$/gu)) {
      return add0x(stripped);
    }
  } catch (e) {
    /* istanbul ignore next */
  }

  return bytesToHex(Buffer.from(data, 'utf8'));
}

/**
 * Takes a stringified JSON and replaces all numeric values in it with quoted strings.
 *
 * @param str - String of JSON to be fixed.
 * @returns String with all numeric values converted to quoted strings.
 */
export function convertNumbericValuestoQuotedString(str: string) {
  return str?.replace(/(?<=:\s*)(-?\d+(\.\d+)?)(?=[,\]}])/gu, '"$1"');
}
