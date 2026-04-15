export {
  decodeClientDataJSON,
  type ClientDataJSON,
} from './decodeClientDataJSON';
export {
  parseAuthenticatorData,
  type ParsedAuthenticatorData,
  type AuthenticatorDataFlags,
} from './parseAuthenticatorData';
export {
  decodeAttestationObject,
  type AttestationObject,
  type AttestationStatement,
  type AttestationFormat,
} from './decodeAttestationObject';
export { verifySignature } from './verifySignature';
export { matchExpectedRPID } from './matchExpectedRPID';
