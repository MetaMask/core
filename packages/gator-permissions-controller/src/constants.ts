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

/**
 * `Rule.type` / `wallet_getSupportedExecutionPermissions` `ruleTypes` entry for
 * payee allowlists (AllowedCalldataEnforcer / AllowedTargetsEnforcer). Hosts
 * should advertise this for every supported execution permission type that supports
 * payee restrictions.
 */
export const EXECUTION_PERMISSION_PAYEE_RULE_TYPE = 'payee' as const;

/**
 * `Rule.type` / `wallet_getSupportedExecutionPermissions` `ruleTypes` entry for
 * permission expiry derived from a TimestampEnforcer caveat. The decoded
 * permission additionally hoists the expiry value onto its top-level `expiry`
 * field for convenience.
 */
export const EXECUTION_PERMISSION_EXPIRY_RULE_TYPE = 'expiry' as const;
