# Architecture

The `MarketingConsentController` keeps a user's marketing consent in sync between this device and their Authenticated User Storage (AUS) profile, and keeps the AUS marketing notification channels consistent with it.

For setup and usage, see the [README](./README.md).

## Local and remote consent

Marketing consent lives in two places:

- **Local**: `optedInToMarketing` and `marketingConsentDecisionMade` in `AnalyticsController`. Analytics on this device reads it.
- **Remote**: the marketing consent record in AUS. Every device and client signed in to the same profile reads it, and marketing notifications depend on it.

AUS is the source of truth. When the two disagree and there is no unsaved local change, the AUS value is applied locally. AUS is read even when nothing changed on this device, because another device or client signed in to the same profile may have changed it.

## Readiness and sessions

The controller only calls AUS when it is **ready**: the wallet is unlocked, the user is signed in (`AuthenticationController.isSignedIn`), and a consent decision has been made. Sign-in happens after unlock, so the wallet can be unlocked but not signed in yet (for example during onboarding). Whether locking signs the user out depends on the client: the extension signs out on lock, mobile stays signed in, so the controller tracks the lock state itself.

A **session** is one signed-in period. A new session starts whenever the signed-in status changes. Each sync run belongs to the session it started in. If the session changes or the controller stops being ready while it reads AUS, the result of the read is dropped. Before each AUS write the run checks again and stops if either changed, so a multi-step write never finishes on a profile that signed in since; an unsaved change stays pending for the new session. A write request already sent is not cancelled.

## Pending change

The controller's only state is `pendingMarketingConsent`: the consent value waiting to be saved to AUS. It is persisted, so it survives restarts.

| Value   | Meaning                        |
| ------- | ------------------------------ |
| `null`  | nothing waiting                |
| `true`  | an opt-in waiting to be saved  |
| `false` | an opt-out waiting to be saved |

It is set by `setMarketingConsent`, and by consent changes other code makes in `AnalyticsController` (seen through `AnalyticsController:stateChanged`). `setMarketingConsent` queues its value even when local consent already matches, so an explicit choice wins over a different value in AUS. Values the controller applies from AUS are not queued.

A pending change isn't tied to a profile: it is written to whichever profile signs in next.

```mermaid
flowchart LR
  nothing["Nothing waiting<br/>(null)"]
  waiting["Change waiting<br/>(true = opt-in, false = opt-out)"]
  nothing -- "consent changes" --> waiting
  waiting -- "saved to AUS, or dropped<br/>by a failed setMarketingConsent" --> nothing
```

While a change is waiting:

- A newer change replaces it (`true` becomes `false` or the other way round). Only one value is ever waiting.
- It stays put while the controller is not ready, or after a failed write. A failed write is retried on the next unlock, sign-in, consent change or `refresh()`, not straight away, so a run can't loop while AUS is down. There is no retry timer; individual AUS requests already retry with backoff through the service policy.

## Sync run

Only one sync run is in flight at a time; asking for a sync while one runs returns the same run. A run is started by `initialize()`, on sign-in, on unlock (through `refresh()`), on a consent change and on `refresh()`.

```mermaid
flowchart TD
  start([Sync run]) --> pending{Pending change?}
  pending -- yes --> write[Write it to AUS]
  write --> newer{Changed again during the write?}
  newer -- yes --> write
  newer -- no --> clear[Clear the pending change]
  pending -- no --> read[Read consent from AUS]
  read --> empty{AUS has a value?}
  empty -- no --> upload[Write the local value to AUS]
  empty -- yes --> apply[Apply the AUS value locally]
  apply --> off{AUS says off?}
  off -- yes --> notifications[Turn marketing notifications off]
```

If a change is queued while the AUS read is in progress, the read result is ignored and the change is written instead.

A write that has started is never cancelled; a newer change is written after it. Only the latest value is ever written next, so values the user moved past are skipped: if the user changes consent several times during a write, at most one more write follows, and none if they end up back on the value being written. Before sign-in, or while another run is still reading AUS, intermediate values are never sent at all.

When a run ends, another starts if the session changed, a `refresh()` was requested during the run, or the run succeeded and a change was queued after its last write.

See [MarketingConsentController.ts](/packages/marketing-consent-controller/src/MarketingConsentController.ts) (`#sync`, `#run`, `#reconcileWithAus`, `#flushPendingConsent`).

## Saving a consent change

`setMarketingConsent(enabled)`:

1. Applies the choice locally through `AnalyticsController`.
2. Queues it as the pending change and starts a sync, before awaiting anything, so an older call that resumes later cannot overwrite a newer one.
3. Resolves immediately if the controller is not ready. The change is saved once the wallet is unlocked and signed in.
4. Otherwise waits until AUS confirms this exact value in the same session.

On failure:

- If a newer choice was made while it waited (a newer `setMarketingConsent` call, or other code changing consent in `AnalyticsController`), it resolves; the newer choice is saved on its own.
- If the wallet locked or the user was signed out during the save, the change stays pending and the call rejects.
- Otherwise the change is dropped, consent is re-read from AUS and applied locally, and the call rejects.

## Marketing notifications

Marketing notifications rely on marketing consent, so whenever consent is off the AUS marketing push and in-app channels must be off too.

When saving an opt-out, the controller:

1. Reads notification preferences from AUS.
2. If a marketing channel is on, writes the preferences with both marketing channels off.
3. Re-reads the preferences, so UIs bound to the AUS cache through `@metamask/react-data-query` see the change.
4. Writes consent off to AUS.

The channels go off before consent is written, so AUS never has consent off while a marketing channel is on. If step 2 or 4 fails, or the session changes before either, the sequence stops and both are retried together. Steps 1 to 3 also run when a sync reads "off" from AUS, because another client may have revoked consent without turning the channels off.

Turning a marketing channel on is the reverse rule, and it is enforced by `NotificationServicesController:updateNotificationPreferences`, which rejects updates that turn a marketing channel on without consent. When notification preferences are created for the first time, `NotificationServicesController` sets both marketing channels (push, and in-app feature announcements) from marketing consent.
