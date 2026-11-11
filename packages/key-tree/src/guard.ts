/**
 * A guard symbol to prevent untrusted public keys from being passed to
 * `SLIP10Node` constructors.
 *
 * This is a private symbol and should not be exported from the module.
 */
export const PUBLIC_KEY_GUARD = Symbol(
  'Public key guard. Do not export this from the module.',
);
