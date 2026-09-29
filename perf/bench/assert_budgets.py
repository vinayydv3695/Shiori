#!/usr/bin/env python3
"""Budget assertions for the SQL bench (Phase 3 regression guard).

Fails (exit 1) when a hot-path query regresses past its budget. Budgets are
deliberately ~3-5x the measured baseline so CI machines with noisy neighbors
don't flap; the point is catching order-of-magnitude regressions (missing
index, N+1 reintroduced, trigger explosion).

Run: python3 perf/bench/sql_bench.py --label ci && python3 perf/bench/assert_budgets.py
Requires perf/seed/bench.db (python3 perf/seed/seed_db.py).
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results", "ci.md")

# query -> (budget_ms, note)
READ_BUDGETS = {
    "Q1_default_page_keyset": (5.0, "default library page (keyset)"),
    "Q2_fts_prefix_page": (8.0, "FTS search-as-you-type page"),
    "Q3_series_books_all": (20.0, "1100-chapter series fetch"),
    "Q6_library_stats": (8.0, "library stats"),
    "Q7_count_default": (5.0, "pagination total"),
    "Q8_author_sort_page": (10.0, "author-sorted page"),
    "Q10_manga_domain_page": (8.0, "manga domain page"),
    "Q11_series_volumes": (8.0, "series volumes"),
}
# per-op budgets for the batched-write pattern
WRITE_BUDGETS = {
    "Q4b_status_update_x200_1tx": (10.0, "200 status updates in one tx"),
    "Q5b_linkage_update_x200_1tx": (10.0, "200 linkage updates in one tx"),
}
# autocommit loops must stay clearly worse than batching (sanity: batching exists)
LOOP_BUDGETS = {
    "Q4_status_update_one": (200.0, "200 autocommit status updates"),
    "Q5_linkage_update_one": (100.0, "200 autocommit linkage updates"),
}


def parse() -> dict:
    if not os.path.exists(RESULTS):
        print(f"missing {RESULTS}; run sql_bench.py --label ci first")
        sys.exit(2)
    rows = {}
    row_re = re.compile(r"^\|\s*(\w+)\s*\|\s*\d+\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|")
    with open(RESULTS) as f:
        for line in f:
            m = row_re.match(line)
            if m:
                rows[m.group(1)] = (float(m.group(2)), float(m.group(3)))
    return rows


def main() -> int:
    rows = parse()
    failures = []
    for name, (budget, note) in {**READ_BUDGETS, **WRITE_BUDGETS, **LOOP_BUDGETS}.items():
        if name not in rows:
            failures.append(f"{name}: missing from results")
            continue
        median, _ = rows[name]
        # For write benches the "median" column holds the total ms for N ops.
        if median > budget:
            failures.append(f"{name}: {median:.2f} ms > budget {budget} ms ({note})")
        else:
            print(f"ok  {name}: {median:.2f} ms <= {budget} ms")
    if failures:
        print("\nFAILED budgets:")
        for f in failures:
            print(" -", f)
        return 1
    print("\nall SQL budgets met")
    return 0


if __name__ == "__main__":
    sys.exit(main())
