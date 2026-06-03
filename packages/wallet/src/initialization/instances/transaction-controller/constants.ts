export const TRANSACTION_CONTROLLER_EXTERNAL_ACTIONS = [
  'AccountsController:getSelectedAccount',
  'AccountsController:getState',
  'ApprovalController:addRequest',
  'GasFeeController:fetchGasFeeEstimates',
  'KeyringController:getState',
  'KeyringController:signEip7702Authorization',
  'KeyringController:signTransaction',
  'NetworkController:findNetworkClientIdByChainId',
  'NetworkController:getEIP1559Compatibility',
  'NetworkController:getNetworkClientById',
  'NetworkController:getNetworkClientRegistry',
  'NetworkController:getState',
  'RemoteFeatureFlagController:getState',
] as const;

export const TRANSACTION_CONTROLLER_EXTERNAL_EVENTS = [
  'AccountActivityService:statusChanged',
  'AccountActivityService:transactionUpdated',
  'AccountsController:selectedAccountChange',
  'BackendWebSocketService:connectionStateChanged',
  'NetworkController:stateChange',
] as const;
