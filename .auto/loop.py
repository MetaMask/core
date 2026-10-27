#!/opt/homebrew/bin/python3
"""Manual replication of pi-autoresearch's experiment loop tools.

The extension (init_experiment / run_experiment / log_experiment) is not
available in this harness session, so this script reproduces its exact
semantics against .auto/log.jsonl so a later /autoresearch can resume/dashboard:

  init                  -> write the {type:"config"} header (once)
  log --status S --metric N [--metrics k=v ...] --desc "..."
                        -> compute confidence (|best-kept - baseline| / MAD
                           over segment results; null if <3 points or MAD==0),
                           append the run entry, then commit (keep) or revert
                           everything except .auto (discard/crash/checks_failed).

Use /opt/homebrew/bin/python3 (system python3 is 3.9).
"""
import argparse
import json
import math
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / ".auto" / "log.jsonl"
SEGMENT = 0
DIRECTION = "lower"


def sh(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        args, cwd=ROOT, capture_output=True, text=True, check=check
    )


def read_results() -> list:
    if not LOG.exists():
        return []
    out = []
    for line in LOG.read_text().splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        if entry.get("type") == "config":
            continue
        out.append(entry)
    return out


def sorted_median(values):
    if not values:
        return 0
    s = sorted(values)
    mid = len(s) // 2
    return (s[mid - 1] + s[mid]) / 2 if len(s) % 2 == 0 else s[mid]


def compute_confidence(results, segment=SEGMENT, direction=DIRECTION):
    cur = [r for r in results if r.get("segment", 0) == segment and r.get("metric", 0) > 0]
    if len(cur) < 3:
        return None
    values = [r["metric"] for r in cur]
    median = sorted_median(values)
    mad = sorted_median([abs(v - median) for v in values])
    if mad == 0:
        return None
    baseline = cur[0]["metric"]
    kept = [r["metric"] for r in cur if r.get("status") == "keep"]
    if not kept:
        return None
    best = min(kept) if direction == "lower" else max(kept)
    if best == baseline:
        return None
    return abs(best - baseline) / mad


def cmd_init(args):
    if LOG.exists() and LOG.read_text().strip():
        print("log.jsonl already exists; not re-initializing")
        return 0
    header = {
        "type": "config",
        "name": "assets-controller-update-state-producer",
        "metricName": "primary_ms",
        "metricUnit": "ms",
        "bestDirection": "lower",
    }
    LOG.parent.mkdir(exist_ok=True)
    LOG.write_text(json.dumps(header) + "\n")
    print("initialized .auto/log.jsonl")
    return 0


def cmd_log(args):
    results = read_results()
    if not results and not LOG.exists():
        print("log.jsonl missing; run init first", file=sys.stderr)
        return 1
    metrics = {}
    for kv in args.metrics or []:
        k, v = kv.split("=", 1)
        metrics[k] = float(v)
    confidence = compute_confidence(results)
    commit = ""
    if args.status == "keep":
        msg = f"{args.desc}\n\nResult: {json.dumps({'status': args.status, 'primary_ms': args.metric, **metrics})}"
        sh("git", "add", "-A")
        diff = sh("git", "diff", "--cached", "--quiet", check=False)
        if diff.returncode != 0:
            sh("git", "-c", "commit.gpgsign=false", "commit", "-m", msg)
            commit = sh("git", "rev-parse", "--short=7", "HEAD").stdout.strip()
    else:
        revert = (
            "git checkout -- . ':(exclude,glob)**/.auto' ':(exclude,glob)**/.auto/**'"
            " ':(exclude,glob)**/autoresearch.*' ':(exclude,glob)**/autoresearch.*/**'; "
            "git clean -fd -e .auto -e '**/.auto/**' -e 'autoresearch.*' -e '**/autoresearch.*/**' 2>/dev/null || true"
        )
        sh("bash", "-c", revert, check=False)
    entry = {
        "run": len(results),
        "commit": commit,
        "metric": float(args.metric),
        "metrics": metrics,
        "status": args.status,
        "description": args.desc,
        "timestamp": int(time.time()),
        "segment": SEGMENT,
        "confidence": confidence,
    }
    if args.asi:
        asi = {}
        for kv in args.asi:
            k, v = kv.split("=", 1)
            asi[k] = v
        entry["asi"] = asi
    with LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    conf_str = "null" if confidence is None else f"{confidence:.2f}x"
    print(f"run #{entry['run']} {args.status} metric={args.metric} confidence={conf_str} commit={commit or '-'}")
    return 0


def cmd_confidence(args):
    results = read_results()
    c = compute_confidence(results)
    print("null" if c is None else f"{c:.3f}")
    return 0


def cmd_status(args):
    results = read_results()
    if not results:
        print("no runs")
        return 0
    print(f"{len(results)} runs, segment {SEGMENT}, direction {DIRECTION}")
    for r in results:
        conf = "" if r.get("confidence") is None else f" conf={r['confidence']:.2f}x"
        print(f"  #{r['run']:>2} {r['status']:<13} {r['metric']:>8.2f} {conf} {r['description'][:70]}")
    baseline = results[0]["metric"]
    kept = [r["metric"] for r in results if r["status"] == "keep"]
    if kept:
        best = min(kept)
        print(f"baseline={baseline} best_kept={best} delta={baseline - best:.2f} ({(baseline - best) / baseline * 100:.1f}%)")
    return 0


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init").set_defaults(fn=cmd_init)
    c = sub.add_parser("log")
    c.add_argument("--status", required=True, choices=["keep", "discard", "crash", "checks_failed"])
    c.add_argument("--metric", required=True, type=float)
    c.add_argument("--metrics", nargs="*")
    c.add_argument("--asi", nargs="*")
    c.add_argument("--desc", required=True)
    c.set_defaults(fn=cmd_log)
    sub.add_parser("confidence").set_defaults(fn=cmd_confidence)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    args = p.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
