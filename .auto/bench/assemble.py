#!/opt/homebrew/bin/python3
"""Assemble .auto/bench/workload.js from vendored deps + section files.

Vendored:
  - bignumber.js 9.1.2 (node_modules/bignumber.js/bignumber.mjs, exports stripped,
    wrapped in an IIFE exposing BigNumberJS)
  - lodash-es isEqual chain (real implementations, imports flattened)

Sections:
  - 03-helpers-original.js  : bench helpers + frozen ORIGINAL implementation
  - 04-candidate.js         : CANDIDATE mirror (editable experiment target;
                              bootstrapped once from the ORIGINAL section if
                              missing; afterwards it is the source of truth)
  - 05-harness.js          : deterministic inputs, timing, parity, metrics

The CANDIDATE section in workload.js is copied verbatim from
04-candidate.js. Experiments edit 04-candidate.js (and the matching
production file); see prompt.md for the mirror-edit contract.
"""
import re
import sys
from pathlib import Path

BENCH = Path(__file__).resolve().parent
CORE = BENCH.parent.parent
OUT = BENCH / "workload.js"

HEADER = """\
// ============================================================================
// assets-controller #updateState producer bench (Hermes).
//
// Source: packages/assets-controller/src/AssetsController.ts (MetaMask/core,
// origin/main @ 0120311d887). The bench extracts the producer passed to
// this.update() inside #updateState (the applyV5AccountBalanceUpdate hot path
// flagged by Hermes profile run 39731720623 "Measure Warm Start: Login To
// Wallet Screen"), plus its module-level helpers, and drives it with a
// deterministic warm-start response sequence (accounts API v5: merge-mode
// balance polls, metadata merges, price updates, chain-slice replaces,
// full-mode replace, new accounts/assets, odd amount strings).
//
// Sections:
//   1. bignumber.js 9.1.2 (vendored, exports stripped)      -> BigNumberJS
//   2. lodash-es isEqual chain (vendored, real chain)       -> isEqual
//   3. bench helpers (CAIP parsing, native/staking checks, zero balances,
//      #getAssetType) — shared by ORIGINAL and CANDIDATE
//   4. ORIGINAL — frozen reference (normalizeAmountString,
//      effectiveAccountBalancesV5, updateStateProducer). DO NOT EDIT.
//   5. CANDIDATE — mirror of the production file. Edit with experiments;
//      parity vs ORIGINAL is enforced on every run.
//   6. harness — deterministic inputs, timing, parity, SELF_CHECK.
//
// Output contract: prints METRIC lines, DET detail lines, and a final
// SELF_CHECK=OK / SELF_CHECK=FAIL line. Exit status 0 only when OK.
// ============================================================================

"""


def vendor_bignumber() -> str:
    src = (CORE / "node_modules/bignumber.js/bignumber.mjs").read_text()
    assert "export var BigNumber = clone();" in src
    assert "export default BigNumber;" in src
    src = src.replace("export var BigNumber = clone();", "var BigNumber = clone();")
    src = src.replace("export default BigNumber;", "")
    src = src.rstrip() + "\n"
    return (
        "// ==== VENDOR: bignumber.js 9.1.2 (real library, exports stripped) ====\n"
        "var BigNumberJS = (function() {\n"
        + src
        + "return BigNumber;\n})();\n"
    )


def vendor_lodash() -> str:
    root = CORE / "node_modules/lodash-es"
    order, seen, alias_pairs = [], {}, []

    def load(fn: str) -> None:
        if fn in seen:
            return
        seen[fn] = True
        src = (root / fn).read_text()
        deps, body_lines = [], []
        for line in src.split("\n"):
            m = re.match(r"import (\w+) from './([_.\w]+)\.js';", line)
            if m:
                deps.append((m.group(1), m.group(2) + ".js"))
                alias_pairs.append((m.group(1), m.group(2) + ".js"))
            else:
                body_lines.append(line)
        for _alias, dep in deps:
            load(dep)
        body = "\n".join(body_lines)
        mod = "L_" + fn[:-3].replace(".", "_")
        m = re.search(r"export default (.*?);", body, re.S)
        default_expr = m.group(1) if m else None
        if default_expr is not None:
            body = body[: m.start()] + body[m.end() :]
        body = re.sub(r"^export \{[^}]*\};\s*$", "", body, flags=re.M)
        code = body
        if default_expr is not None:
            code += f"\nvar {mod} = {default_expr};\n"
        order.append((fn, mod, code))

    load("isEqual.js")
    out = ["// ==== VENDOR: lodash-es isEqual chain (real chain, imports flattened) ====\n"]
    for fn, mod, code in order:
        out.append(f"// ---- lodash-es {fn} ----")
        out.append(code)
    out.append("// ---- import alias bindings ----")
    done = set()
    for alias, dep in alias_pairs:
        mod = "L_" + dep[:-3].replace(".", "_")
        if alias not in done:
            out.append(f"var {alias} = {mod};")
            done.add(alias)
    out.append("var isEqual = L_isEqual;")
    out.append("")
    return "\n".join(out)


def split_original(body: str):
    marker = "// ============================================================================\n// ORIGINAL"
    idx = body.index(marker)
    return body[:idx], body[idx:]


def make_candidate(original_section: str) -> str:
    header_new = """\
// ============================================================================
// CANDIDATE — the experiment target. Mirrors the production
// packages/assets-controller/src/AssetsController.ts producer. At baseline it
// is an exact copy of the ORIGINAL section (modulo symbol suffixes). Keep
// behaviour identical to ORIGINAL (parity + SELF_CHECK enforce it) while
// optimizing. When you edit here, make the matching edit in
// packages/assets-controller/src/AssetsController.ts, and vice versa.
// ============================================================================
"""
    stripped = re.sub(
        r"^// ORIGINAL.*?\n===========+\n", "", original_section, count=1, flags=re.S
    )
    m = re.match(r"(.*?\n)(// ============+\n)", stripped, re.S)
    inner = stripped[m.end(0) :] if m else stripped
    inner = re.sub(
        r"^// -+ #updateState producer body \(AssetsController.ts:2982-3243, verbatim\) -+$",
        "// -+ #updateState producer body (AssetsController.ts:2982-3243, mirrored) -+",
        inner,
        flags=re.M,
    )
    inner = inner.replace("_ORIG(", "_CAND(").replace("_ORIG;", "_CAND;")
    inner = inner.replace("_ORIG", "_CAND")
    return header_new + inner


def main() -> None:
    body = (BENCH / "03-helpers-original.js").read_text()
    helpers, original_section = split_original(body)
    candidate_path = BENCH / "04-candidate.js"
    if candidate_path.exists():
        candidate = candidate_path.read_text()
        mode = "existing"
    else:
        candidate = make_candidate(original_section)
        candidate_path.write_text(candidate)
        mode = "bootstrapped"
    harness = (BENCH / "05-harness.js").read_text()
    parts = [
        HEADER,
        vendor_bignumber(),
        "\n",
        vendor_lodash(),
        "\n",
        "// ==== BENCH HELPERS + ORIGINAL (frozen reference) ====\n",
        helpers,
        "\n",
        original_section,
        "\n",
        candidate,
        "\n",
        harness,
    ]
    OUT.write_text("".join(parts))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes; candidate from {mode} 04-candidate.js)")


if __name__ == "__main__":
    sys.exit(main())
