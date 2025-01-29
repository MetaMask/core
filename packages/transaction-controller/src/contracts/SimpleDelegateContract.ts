export const SimpleDelgateContractAbi = [
  { type: 'receive', stateMutability: 'payable' },
  {
    type: 'function',
    name: 'execute',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        internalType: 'struct SimpleDelegateContract.Call[]',
        components: [
          { name: 'data', type: 'bytes', internalType: 'bytes' },
          { name: 'to', type: 'address', internalType: 'address' },
          { name: 'value', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'Executed',
    inputs: [
      {
        name: 'to',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'data',
        type: 'bytes',
        indexed: false,
        internalType: 'bytes',
      },
    ],
    anonymous: false,
  },
];
