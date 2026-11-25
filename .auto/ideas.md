# Ideas

Append ideas here instead of chasing them immediately. Delete a line once it has been tried.

- Defer long non-canonical inputs (length > ~100) straight to BigNumber to
  skip the ~30µs/512-char scanner path — only affects absurd inputs,
  expected sub-noise on the corpus; skip unless a long-input workload
  shows up in a future Hermes profile.
- Re-measure the final build on an idle box (load < 5) to get a clean
  guard-cost delta and a trustworthy final number for the PR description
  (132-135ms band today is contention-inflated; load avg ~15).
- Terminal finding (do NOT retry): the exact-semantics per-call
  `BigNumber.config().RANGE` read cannot be made cheaper — bignumber.js
  allocates a 10-prop object + RANGE array on every no-arg `config()` call,
  there is no allocation-free public read, and caching/sampling is
  semantically forbidden (exp19 dead end, wrapper-call overhead is noise).
  The only sound reduction was the config-independent magnitude class
  (|e| ≤ 1, exp16) — already implemented.
- If a future reviewer challenges the exactness requirement: the sampled
  RANGE cache (exp12, ~97ms) is 25% faster but returns WRONG values for up
  to 63 calls after a global `BigNumber.config({RANGE})` change — the
  warm-then-change parity suite proves it. 133ms is the honest floor.
