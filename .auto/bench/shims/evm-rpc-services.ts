// Bench-only shim for the `../data-sources/evm-rpc-services/index.js` barrel.
// The barrel re-exports the entire RPC-services surface (MulticallClient,
// BalanceFetcher, ...), which drags network/controller code into the Hermes
// bundle. The production hot path only uses `isStakingContractAssetId`,
// whose real implementation lives in `utils/staking-contracts.ts`. This shim
// re-exports that real function unchanged.
export { isStakingContractAssetId } from '../../../packages/assets-controller/src/data-sources/evm-rpc-services/utils/staking-contracts.ts';
