// import { ControllerMessenger } from '@metamask/base-controller';
// import {
//   EarnController,
//   controllerName,
//   type EarnControllerActions,
//   type EarnControllerEvents,
//   type EarnControllerState,
//   type EarnOpportunity,
//   type StakeSdkConfig,
// } from './EarnController';

// const sampleOpportunity: EarnOpportunity = {
//   id: '1',
//   protocol: 'Aave',
//   type: 'lend',
//   apy: 5.5,
//   token: {
//     address: '0x1234',
//     symbol: 'DAI',
//     decimals: 18,
//   },
//   network: {
//     chainId: 1,
//     name: 'Ethereum Mainnet',
//   },
// };

// const sampleConfig: StakeSdkConfig = {
//   rpcUrl: 'https://mainnet.infura.io/v3/your-api-key',
//   chainId: 1,
//   apiKey: 'test-api-key',
// };

// describe('EarnController', () => {
//   let messenger: ControllerMessenger<
//     EarnControllerActions,
//     EarnControllerEvents
//   >;
//   let controller: EarnController;

//   beforeEach(() => {
//     messenger = new ControllerMessenger<
//       EarnControllerActions,
//       EarnControllerEvents
//     >();
//     controller = new EarnController({
//       messenger: messenger.getRestricted({
//         name: controllerName,
//         allowedActions: [
//           `${controllerName}:getState`,
//           `${controllerName}:fetchOpportunities`,
//           `${controllerName}:updateConfig`,
//           `${controllerName}:stateChange`,
//         ],
//         allowedEvents: [],
//       }),
//     });
//   });

//   it('should initialize with default state', () => {
//     expect(controller.state).toEqual({
//       opportunities: [],
//       isLoading: false,
//       error: null,
//       config: null,
//     });
//   });

//   it('should initialize with custom state and config', () => {
//     const customState: Partial<EarnControllerState> = {
//       opportunities: [sampleOpportunity],
//     };

//     const customController = new EarnController({
//       messenger: messenger.getRestricted({
//         name: controllerName,
//         allowedActions: [
//           `${controllerName}:getState`,
//           `${controllerName}:fetchOpportunities`,
//           `${controllerName}:updateConfig`,
//           `${controllerName}:stateChange`,
//         ],
//         allowedEvents: [],
//       }),
//       state: customState,
//       config: sampleConfig,
//     });

//     expect(customController.state.opportunities).toEqual(
//       customState.opportunities,
//     );
//     expect(customController.state.config).toEqual({
//       chainId: sampleConfig.chainId,
//       rpcUrl: sampleConfig.rpcUrl,
//     });
//   });

//   describe('updateConfig', () => {
//     it('should update SDK configuration', async () => {
//       await controller.updateConfig(sampleConfig);

//       expect(controller.state.config).toEqual({
//         chainId: sampleConfig.chainId,
//         rpcUrl: sampleConfig.rpcUrl,
//       });
//     });

//     it('should maintain state after config update', async () => {
//       // @ts-expect-error: Accessing protected method for testing
//       controller.update((state) => {
//         state.opportunities = [sampleOpportunity];
//       });

//       await controller.updateConfig(sampleConfig);

//       expect(controller.state.opportunities).toEqual([sampleOpportunity]);
//       expect(controller.state.config).toEqual({
//         chainId: sampleConfig.chainId,
//         rpcUrl: sampleConfig.rpcUrl,
//       });
//     });
//   });

//   describe('fetchOpportunities', () => {
//     it('should set loading state while fetching', async () => {
//       const fetchPromise = controller.fetchOpportunities();
//       expect(controller.state.isLoading).toBe(true);
//       await fetchPromise;
//     });

//     it('should clear error state on successful fetch', async () => {
//       // @ts-expect-error: Accessing protected method for testing
//       controller.update((state) => {
//         state.error = 'Previous error';
//       });
//       await controller.fetchOpportunities();
//       expect(controller.state.error).toBeNull();
//     });

//     it('should handle errors during fetch', async () => {
//       await controller.fetchOpportunities();
//       expect(controller.state.isLoading).toBe(false);
//     });

//     it('should fetch opportunities for specific chain', async () => {
//       await controller.updateConfig(sampleConfig);
//       await controller.fetchOpportunities(1);
//       expect(controller.state.isLoading).toBe(false);
//     });
//   });

//   describe('getOpportunitiesByNetwork', () => {
//     beforeEach(() => {
//       // @ts-expect-error: Accessing protected method for testing
//       controller.update((state) => {
//         state.opportunities = [
//           sampleOpportunity,
//           {
//             ...sampleOpportunity,
//             id: '2',
//             network: {
//               chainId: 137,
//               name: 'Polygon',
//             },
//           },
//         ];
//       });
//     });

//     it('should return opportunities for specified network', () => {
//       const opportunities = controller.getOpportunitiesByNetwork(1);
//       expect(opportunities).toHaveLength(1);
//       expect(opportunities[0].network.chainId).toBe(1);
//     });

//     it('should return empty array for network with no opportunities', () => {
//       const opportunities = controller.getOpportunitiesByNetwork(56);
//       expect(opportunities).toHaveLength(0);
//     });
//   });

//   describe('getOpportunitiesByToken', () => {
//     beforeEach(() => {
//       // @ts-expect-error: Accessing protected method for testing
//       controller.update((state) => {
//         state.opportunities = [
//           sampleOpportunity,
//           {
//             ...sampleOpportunity,
//             id: '2',
//             network: {
//               chainId: 137,
//               name: 'Polygon',
//             },
//           },
//         ];
//       });
//     });

//     it('should return opportunities for specified token', () => {
//       const opportunities = controller.getOpportunitiesByToken('0x1234');
//       expect(opportunities).toHaveLength(2);
//       opportunities.forEach((opp) => {
//         expect(opp.token.address.toLowerCase()).toBe('0x1234'.toLowerCase());
//       });
//     });

//     it('should return empty array for token with no opportunities', () => {
//       const opportunities = controller.getOpportunitiesByToken('0xabcd');
//       expect(opportunities).toHaveLength(0);
//     });

//     it('should be case insensitive for token addresses', () => {
//       const opportunities = controller.getOpportunitiesByToken('0x1234');
//       const opportunitiesUpper = controller.getOpportunitiesByToken('0X1234');
//       expect(opportunities).toEqual(opportunitiesUpper);
//     });
//   });
// });
