# Claude Code Context

## Repo Purpose

Interview prep split into two tracks:
- **CODE/** — timed coding assessments (not leetcode). Each subdirectory is a self-contained challenge with leveled tasks that build cumulatively.
- **STUDY-NOTES/** — system design and LLD study notes in Markdown.

## Repo Structure

```
intv_prep/
  CODE/
    payment_processor/    # first assessment (TypeScript, vitest)
    rate_limiter/         # planned
    validation_system/    # planned (Java)
    parking_lot/          # planned
    food_delivery/        # planned
    dev/                  # internal design docs
  STUDY-NOTES/
    cur.md                # current working notes
```

## Assessment Structure (convention for all challenges)

Each assessment under `CODE/` follows the same pattern:

```
CODE/<assessment>/
  README.md              # candidate-facing instructions — levels + rules
  DESIGN.md              # internal specs for unbuilt levels (not for candidates)
  package.json           # or build file for the language
  src/
    types.ts             # shared types/interfaces
    config.ts            # constants (limits, TTLs, retries)
    handler.ts           # skeleton — compiles but fails all tests (candidate edits this)
    index.ts             # barrel re-exports
  tests/
    level-N.test.ts      # one file per level, each with a describe("Level N - Title")
  solutions/
    level-N.ts           # cumulative — level-N implements levels 1 through N
```

**Key conventions:**
- Solutions are cumulative: `level-3.ts` passes L1 + L2 + L3 tests.
- `SOLUTION_LEVEL=N npm test` swaps the handler import to `solutions/level-N.ts` via vitest alias (`@handler`).
- `npm test` with no env var uses the skeleton `src/handler.ts`.
- Skeleton must compile and fail gracefully (no crashes, just assertion failures).
- Tests use `vitest` with verbose reporter. Each level is one `describe` block.
- Clock injection via `constructor(clock?: () => number)` for time-dependent levels.

## Building New Assessments

When creating a new assessment:
1. Write README.md first (candidate-facing, level descriptions only).
2. Create infra (package.json, tsconfig, test config with `@handler` alias).
3. Create types, config, skeleton handler.
4. Write tests and solutions in batches. Validate each solution level passes cumulatively.
5. If deferring levels to a future session, write DESIGN.md with full specs.

## Validation Checklist

- `npm test` → skeleton fails gracefully (no crashes)
- `SOLUTION_LEVEL=N npm test` → all tests through level N pass
- Each intermediate solution (`SOLUTION_LEVEL=1`, `2`, ...) passes its level and all below
- 0 npm audit vulnerabilities

## Current State

- **payment_processor**: L1-L4 tests + solutions done. L5-L8 specs in DESIGN.md, tests/solutions not yet built.
