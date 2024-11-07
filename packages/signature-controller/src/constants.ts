/**
 * Supported signature methods.
 */
export const EthMethod = {
  PersonalSign: 'personal_sign',
  SignTransaction: 'eth_signTransaction',
  SignTypedDataV1: 'eth_signTypedData_v1',
  SignTypedDataV3: 'eth_signTypedData_v3',
  SignTypedDataV4: 'eth_signTypedData_v4',
};

/** Different decoding data state change types */
export const DecodingDataChangeType = {
  Receive: 'RECEIVE',
  Transfer: 'TRANSFER',
  Approve: 'APPROVE',
  Revoke: 'REVOKE_APPROVE',
  Bidding: 'BIDDING',
  Listing: 'LISTING',
};
