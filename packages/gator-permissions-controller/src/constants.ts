/**
 * Delegation framework version used to select the correct deployed enforcer
 * contract addresses from `@metamask/delegation-deployments`.
 */
export const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

/**
 * `Rule.type` / `wallet_getSupportedExecutionPermissions` `ruleTypes` entry for
 * redeemer allowlists (RedeemerEnforcer). Hosts should advertise this for every
 * supported execution permission type.
 */
export const EXECUTION_PERMISSION_REDEEMER_RULE_TYPE = 'redeemer' as const;
