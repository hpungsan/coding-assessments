# Payment Processor

You're given a payment processing handler in a small TypeScript codebase. Transactions flow through a strict state machine:

```
submit → authorize → capture → settle → complete
```

Each level adds a new requirement on top of the previous ones. You work in the handler file — the rest of the codebase (index, config, tests) is provided.

## Levels

### Level 1 — Ordered Transitions
Enforce strict in-order state transitions per transaction. A transaction must go through each state sequentially. Out-of-order requests are ignored.

### Level 2 — Capacity Limits
Max 4 transactions can be active at once. Any additional submits are queued FIFO and promoted when a slot opens up (on complete).

### Level 3 — Idempotency
Duplicate requests with the same idempotency key must be safe. No double-charges, no duplicate state transitions. Return the original response for repeated requests.

### Level 4 — Timeouts
Transactions expire if stuck in any state too long. Define per-state TTLs. Expired transactions are cleaned up and their slot is freed for queued work.

### Level 5 — Retries
Authorize and capture can fail. Implement retry logic with exponential backoff. Track attempt counts and fail permanently after max retries.

### Level 6 — Refunds
Completed transactions can be reversed. Add a branching path off the state machine: `complete → refund_pending → refunded`. Refunds also consume a processing slot.

### Level 7 — Priority Queue
Replace FIFO queuing with priority-based ordering. High-value transactions get processed before low-value ones when competing for slots.

### Level 8 — Webhooks
Fire async notifications on every state change. Webhook delivery should be best-effort with retry. Consumers register a callback URL per transaction.

## Setup

```bash
npm install
```

## Running Tests

Run all tests against your handler:

```bash
npm test
```

Run a specific level:

```bash
npx vitest run tests/level-1.test.ts
```

## Validating Solutions

Solutions are provided in `solutions/`. To verify a solution passes all tests up to that level:

```bash
SOLUTION_LEVEL=4 npm test
```

This swaps the handler import to `solutions/level-4.ts`. Each solution is cumulative — `level-N.ts` implements levels 1 through N.

## Your Work

Edit `src/handler.ts`. Types, config, and tests are provided — don't modify them.
