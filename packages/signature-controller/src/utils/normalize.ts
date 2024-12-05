import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { add0x, bytesToHex, type Json, remove0x } from '@metamask/utils';

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
 * The method will convery all values in a JSON to string.
 * Currently decoding api is not able to take numeric values,
 * once apiis fixed we can get rid of this normalization.
 *
 * @param value - JSON to be normalized.
 * @returns JSON with all values converted to string.
 */
function convertJSONValuesToString(value: Json | unknown): Json | string {
  if (Array.isArray(value)) {
    return value.map((val) => convertJSONValuesToString(val));
  }
  if (typeof value === 'object' && value !== null) {
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        (value as Record<string, unknown>)[key] = convertJSONValuesToString(
          (value as Record<string, unknown>)[key],
        );
      }
    }
    return value as Json;
  }
  return value?.toString() ?? '';
}

/**
 * Takes a stringified JSON and replaces stringifying all values.
 *
 * @param param - of JSON to be fixed.
 * @returns JSON with all values converted to quoted strings.
 */
export function normalizeParam(param: string | Record<string, unknown>) {
  if (!param) {
    return {};
  }
  const parsedParam = typeof param === 'string' ? JSON.parse(param) : param;
  console.log('=====', parsedParam);
  return convertJSONValuesToString(parsedParam);
}
