# Implementation Summary: Social Pairing with SeedlessOnboardingController AccessToken

## Overview

This implementation modifies the authentication flow to use the `accessToken` from `SeedlessOnboardingController` state instead of expecting a `socialPairingToken` to be injected into the `AuthenticationController`.

## Changes Made

### 1. AuthenticationController State Updates

**File**: `packages/profile-sync-controller/src/controllers/authentication/AuthenticationController.ts`

- **Added new state properties**:
  - `socialPairingDone?: boolean` - Tracks if pairing has been completed successfully
  - `pairingInProgress?: boolean` - Prevents concurrent pairing attempts

- **Updated metadata configuration** to include persistence settings for the new state properties

### 2. Messaging System Integration

- **Added allowed action** to access SeedlessOnboardingController state:
  ```typescript
  {
    type: 'SeedlessOnboardingController:getState';
    handler: () => { accessToken?: string };
  }
  ```

### 3. Pairing Logic Implementation

#### Core Pairing Method: `#pairSocialIdentifier`
- Exchanges the accessToken for a valid OIDC token
- Prepares SRP signature using snap public key and user profile
- Makes API call to `PAIR_SOCIAL_IDENTIFIER` endpoint
- Returns `true` on success, throws `PairError` on failure

#### Coordination Method: `#tryPairingWithSeedlessAccessToken`
- **Guards against duplicate execution**: Checks `socialPairingDone` and `pairingInProgress` flags
- **Safely accesses SeedlessOnboardingController**: Uses try-catch around messaging system call
- **Non-blocking operation**: Updates state flags to track progress
- **Error handling**: Ignores pairing failures to prevent disrupting other flows

### 4. Integration with SignIn Flow

- **Modified `performSignIn()`**: Added non-blocking call to pairing logic
- **Fire-and-forget pattern**: Uses `.catch(() => {})` to ensure pairing errors don't affect signIn
- **Proper state cleanup**: `performSignOut()` resets `socialPairingDone` flag

### 5. API Endpoint Addition

**File**: `packages/profile-sync-controller/src/sdk/authentication-jwt-bearer/services.ts`

- **Added `PAIR_SOCIAL_IDENTIFIER` endpoint**:
  ```typescript
  export const PAIR_SOCIAL_IDENTIFIER = (env: Env) =>
    `${getEnvUrls(env).authApiUrl}/api/v2/identifiers/pair/social`;
  ```

## Key Features

### 1. Single Execution Guarantee
- Pairing occurs only once per session through state tracking
- `socialPairingDone` flag prevents repeat attempts
- `pairingInProgress` flag prevents concurrent attempts

### 2. Non-Blocking Operation
- Pairing runs asynchronously during `performSignIn()`
- Failures in pairing don't delay or break the authentication flow
- Error handling ensures graceful degradation

### 3. Safe Controller Access
- Uses messaging system to safely access SeedlessOnboardingController state
- Handles cases where SeedlessOnboardingController is not available
- Gracefully exits if `accessToken` is not present

### 4. Environment Configuration
- Currently hardcoded to `Env.DEV` (as noted in TODO comment)
- Uses appropriate MetaMetrics agent for platform identification

## Flow Diagram

```
performSignIn()
    ↓
Generate SRP access tokens
    ↓
Launch pairing (non-blocking)
    ↓
#tryPairingWithSeedlessAccessToken()
    ↓
Check pairing guards (done/in-progress)
    ↓
Get accessToken from SeedlessOnboardingController
    ↓
#pairSocialIdentifier()
    ↓
Exchange token → Create SRP signature → API call
    ↓
Update socialPairingDone flag
```

## Error Handling Strategy

1. **Controller Access Errors**: Silent failure if SeedlessOnboardingController unavailable
2. **Missing AccessToken**: Silent exit if token not present
3. **Pairing API Errors**: Logged but don't propagate to signIn flow
4. **Network Errors**: Caught and ignored to maintain authentication stability

## Testing Considerations

- The implementation preserves all existing authentication functionality
- New state properties are properly persisted/non-persisted as appropriate
- Pairing logic is isolated and doesn't affect core authentication paths
- Error scenarios are handled gracefully without breaking existing flows

## Future Improvements

1. **Environment Configuration**: Remove hardcoded `Env.DEV` when production environment is available
2. **Retry Logic**: Consider adding retry mechanism for failed pairing attempts
3. **Metrics**: Add telemetry for pairing success/failure rates
4. **Testing**: Add unit tests for pairing logic once development is complete