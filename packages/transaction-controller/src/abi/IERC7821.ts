export const ABI_IERC7821 = [
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'mode', type: 'bytes32', internalType: 'ModeCode' },
      { name: 'executionData', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'supportsExecutionMode',
    inputs: [{ name: 'mode', type: 'bytes32', internalType: 'ModeCode' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
];
