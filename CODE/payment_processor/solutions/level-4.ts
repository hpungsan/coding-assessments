import {
  PaymentRequest,
  PaymentResponse,
  TransactionStatus,
  ActionType,
  WebhookEvent,
  QueueEntry,
} from "../src/types";
import { MAX_ACTIVE, STATE_TTLS } from "../src/config";

const TRANSITIONS: Partial<Record<TransactionStatus, Partial<Record<ActionType, TransactionStatus>>>> = {
  PENDING:    { authorize: "AUTHORIZED" },
  AUTHORIZED: { capture: "CAPTURED" },
  CAPTURED:   { settle: "SETTLED" },
  SETTLED:    { complete: "COMPLETED" },
};

interface TxRecord {
  status: TransactionStatus;
  stateEnteredAt: number;
}

export class PaymentProcessor {
  private transactions = new Map<string, TxRecord>();
  private activeCount = 0;
  private queue: QueueEntry[] = [];
  private queued = new Set<string>();
  private idempotencyCache = new Map<string, PaymentResponse[]>();
  private clock: () => number;

  constructor(clock?: () => number) {
    this.clock = clock ?? Date.now;
  }

  handle(request: PaymentRequest): PaymentResponse[] {
    const { idempotencyKey } = request;

    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey)!;
    }

    const responses = this.processRequest(request);

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, responses);
    }

    return responses;
  }

  private processRequest(request: PaymentRequest): PaymentResponse[] {
    const { id, type } = request;

    if (type === "submit") {
      if (this.transactions.has(id) || this.queued.has(id)) {
        return [{ id, status: "IGNORED", message: "Transaction already exists" }];
      }

      if (this.activeCount >= MAX_ACTIVE) {
        this.queue.push({ id, action: "submit", amount: request.amount ?? 0 });
        this.queued.add(id);
        return [{ id, status: "QUEUED", message: "At capacity, queued" }];
      }

      this.transactions.set(id, { status: "PENDING", stateEnteredAt: this.clock() });
      this.activeCount++;
      return [{ id, status: "PENDING", message: "Transaction created" }];
    }

    if (this.queued.has(id)) {
      return [{ id, status: "IGNORED", message: "Transaction is queued" }];
    }

    const tx = this.transactions.get(id);
    if (!tx) {
      return [{ id, status: "IGNORED", message: "Transaction not found" }];
    }

    const next = TRANSITIONS[tx.status]?.[type];
    if (!next) {
      return [{ id, status: "IGNORED", message: `Cannot ${type} from ${tx.status}` }];
    }

    tx.status = next;
    tx.stateEnteredAt = this.clock();
    const responses: PaymentResponse[] = [
      { id, status: next, message: `Transitioned to ${next}` },
    ];

    if (next === "COMPLETED") {
      this.activeCount--;
      this.promoteQueue(responses);
    }

    return responses;
  }

  private promoteQueue(responses: PaymentResponse[]): void {
    if (this.queue.length === 0 || this.activeCount >= MAX_ACTIVE) return;
    const entry = this.queue.shift()!;
    this.queued.delete(entry.id);
    this.transactions.set(entry.id, { status: "PENDING", stateEnteredAt: this.clock() });
    this.activeCount++;
    responses.push({ id: entry.id, status: "PENDING", message: "Promoted from queue" });
  }

  tick(): string[] {
    const now = this.clock();
    const signals: string[] = [];

    // Check for expirations
    for (const [id, tx] of this.transactions) {
      const ttl = STATE_TTLS[tx.status];
      if (ttl === undefined) continue; // COMPLETED, EXPIRED, etc. don't expire
      if (now - tx.stateEnteredAt >= ttl) {
        tx.status = "EXPIRED";
        this.activeCount--;
        signals.push(`${id}:expired`);
      }
    }

    // Promote from queue after freeing slots
    while (this.queue.length > 0 && this.activeCount < MAX_ACTIVE) {
      const entry = this.queue.shift()!;
      this.queued.delete(entry.id);
      this.transactions.set(entry.id, { status: "PENDING", stateEnteredAt: now });
      this.activeCount++;
      signals.push(`${entry.id}:promoted`);
    }

    return signals;
  }

  flushWebhooks(): WebhookEvent[] {
    return [];
  }

  reportWebhookFailure(_event: WebhookEvent): void {}
}
