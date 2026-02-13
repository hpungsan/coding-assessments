import {
  PaymentRequest,
  PaymentResponse,
  TransactionStatus,
  ActionType,
  WebhookEvent,
  QueueEntry,
} from "../src/types";
import { MAX_ACTIVE } from "../src/config";

const TRANSITIONS: Partial<Record<TransactionStatus, Partial<Record<ActionType, TransactionStatus>>>> = {
  PENDING:    { authorize: "AUTHORIZED" },
  AUTHORIZED: { capture: "CAPTURED" },
  CAPTURED:   { settle: "SETTLED" },
  SETTLED:    { complete: "COMPLETED" },
};

export class PaymentProcessor {
  private transactions = new Map<string, TransactionStatus>();
  private activeCount = 0;
  private queue: QueueEntry[] = [];
  private queued = new Set<string>();
  private idempotencyCache = new Map<string, PaymentResponse[]>();

  constructor(_clock?: () => number) {}

  handle(request: PaymentRequest): PaymentResponse[] {
    const { id, type, idempotencyKey } = request;

    // Check idempotency cache first
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

      this.transactions.set(id, "PENDING");
      this.activeCount++;
      return [{ id, status: "PENDING", message: "Transaction created" }];
    }

    if (this.queued.has(id)) {
      return [{ id, status: "IGNORED", message: "Transaction is queued" }];
    }

    const current = this.transactions.get(id);
    if (!current) {
      return [{ id, status: "IGNORED", message: "Transaction not found" }];
    }

    const next = TRANSITIONS[current]?.[type];
    if (!next) {
      return [{ id, status: "IGNORED", message: `Cannot ${type} from ${current}` }];
    }

    this.transactions.set(id, next);
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
    this.transactions.set(entry.id, "PENDING");
    this.activeCount++;
    responses.push({ id: entry.id, status: "PENDING", message: "Promoted from queue" });
  }

  tick(): string[] {
    return [];
  }

  flushWebhooks(): WebhookEvent[] {
    return [];
  }

  reportWebhookFailure(_event: WebhookEvent): void {}
}
