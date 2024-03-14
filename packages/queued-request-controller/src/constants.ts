export const methodsRequiringNetwork = [
  'eth_sendTransaction',
  'wallet_watchAsset',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
]

export const methodsWithConfirmation = [
  ...methodsRequiringNetwork,
  'eth_signTypedData_v4',
  'wallet_requestPermissions',
  'wallet_requestSnaps',
  'personal_sign',
  'eth_sign',
  'eth_requestAccounts',
];
