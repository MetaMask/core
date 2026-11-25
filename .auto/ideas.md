# Ideas

Append ideas here instead of chasing them immediately. Delete a line once it has been tried.

- Defer long non-canonical inputs (length > ~100) straight to BigNumber to
  skip the ~30µs/512-char scanner path — only affects absurd inputs,
  expected sub-noise on the corpus; skip unless a long-input workload
  shows up in a future Hermes profile.
- Re-measure the final build on an idle box (load < 5) to get a clean
  guard-cost delta and a trustworthy final number for the PR description
  (~95-105ms band today is contention-inflated).
