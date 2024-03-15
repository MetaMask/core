export const methodsRequiringNetworkSwitch = [
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_watchAsset',
  'eth_signTypedData_v4',
  'personal_sign',
];

export const methodsWithConfirmation = [
  ...methodsRequiringNetworkSwitch,
  'wallet_requestPermissions',
  'wallet_requestSnaps',
  'wallet_snap',
  'wallet_invokeSnap',
  'eth_decrypt',
  'eth_sign',
  'eth_requestAccounts',
  'eth_getEncryptionPublicKey',
];
