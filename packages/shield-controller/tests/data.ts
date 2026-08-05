import type { SimulationData } from '@metamask/transaction-controller';
import { SimulationTokenStandard } from '@metamask/transaction-controller';

export const TX_META_SIMULATION_DATA_MOCKS: {
  description: string;
  previousSimulationData: SimulationData | undefined;
  newSimulationData: SimulationData;
}[] = [
  {
    description: '`SimulationData.nativeBalanceChange` has changed',
    previousSimulationData: {
      tokenBalanceChanges: [],
    },
    newSimulationData: {
      nativeBalanceChange: {
        difference: '0x1',
        previousBalance: '0x1',
        newBalance: '0x2',
        isDecrease: true,
      },
      tokenBalanceChanges: [],
    },
  },
  {
    description: '`SimulationData.tokenBalanceChanges` has changed',
    previousSimulationData: {
      tokenBalanceChanges: [
        {
          difference: '0x1',
          previousBalance: '0x1',
          standard: SimulationTokenStandard.erc20,
          address: '0x1',
          newBalance: '0x2',
          isDecrease: true,
        },
      ],
    },
    newSimulationData: {
      tokenBalanceChanges: [
        {
          difference: '0x2',
          previousBalance: '0x1',
          standard: SimulationTokenStandard.erc20,
          address: '0x1',
          newBalance: '0x3',
          isDecrease: true,
        },
      ],
    },
  },
  {
    description: '`SimulationData.error` has changed',
    previousSimulationData: {
      tokenBalanceChanges: [],
    },
    newSimulationData: {
      error: {
        code: '-123',
        message: 'Reverted',
      },
      tokenBalanceChanges: [],
    },
  },
  {
    description: '`SimulationData.isUpdatedAfterSecurityCheck` has changed',
    previousSimulationData: {
      tokenBalanceChanges: [],
    },
    newSimulationData: {
      isUpdatedAfterSecurityCheck: true,
      tokenBalanceChanges: [],
    },
  },
];
