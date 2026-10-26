// Placeholder — the real workload lives in build.mjs/entry.ts and is built
// into bundle.js (this file stays for the harness fallback contract only).
//
// .auto/bench/measure.sh prefers .auto/bench/bundle.js when present and
// .auto/measure.sh REBUILDS it from the production source before every
// measurement, so do not benchmark this placeholder.
print('SELF_CHECK=FAIL workload placeholder — run .auto/bench/build.mjs');
