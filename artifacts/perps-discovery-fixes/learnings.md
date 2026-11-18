# Review learnings

- A lenient read that is acceptable for display is not sufficient discovery for destructive cross-venue operations. Carry partial read failures rather than equating them with a confirmed empty venue.
- Enforce session-backed account scope before subscribing and before delivery. A rejected venue must not tear down healthy account streams or remain indefinitely pending.
- An explicit cancellation ID cannot acquire a fake symbol just to fit a successful-read result shape. Keep unresolved IDs in separate typed discovery metadata, and make incompleteness visible even when another venue succeeds.
- Review sibling and standalone paths whenever adding a strict-read option; the first static pass caught missing strict propagation there, which was regression-tested and fixed before the final pass.
- Core partial results need a consumer completeness contract. Source parity is not proof that older clients were upgraded, built or exercised.
