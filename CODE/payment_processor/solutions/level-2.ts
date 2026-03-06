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
  private queueHead = 0;
  private queued = new Set<string>();

  constructor(_clock?: () => number) {}

  handle(request: PaymentRequest): PaymentResponse[] {
    const { id, type } = request;

    if (type === "submit") {
      if (this.transactions.has(id) || this.queued.has(id)) {
        return [{ id, status: "IGNORED", message: "Transaction already exists" }];
      }

      if (this.activeCount >= MAX_ACTIVE) {
        this.queue.push({
          id,
          action: "submit",
          amount: request.amount ?? 0,
          idempotencyKey: request.idempotencyKey,
          webhookUrl: request.webhookUrl,
        });
        this.queued.add(id);
        return [{ id, status: "QUEUED", message: "At capacity, queued" }];
      }

      this.transactions.set(id, "PENDING");
      this.activeCount++;
      return [{ id, status: "PENDING", message: "Transaction created" }];
    }

    // If queued, ignore non-submit
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
    if (this.queueHead >= this.queue.length || this.activeCount >= MAX_ACTIVE) return;
    const entry = this.queue[this.queueHead++];
    this.queued.delete(entry.id);
    this.transactions.set(entry.id, "PENDING");
    this.activeCount++;
    responses.push({ id: entry.id, status: "PENDING", message: "Promoted from queue" });
    this.compactQueue();
  }

  private compactQueue(): void {
    if (this.queueHead > 0 && this.queueHead >= this.queue.length / 2) {
      this.queue = this.queue.slice(this.queueHead);
      this.queueHead = 0;
    }
  }

  tick(): string[] {
    return [];
  }

  flushWebhooks(): WebhookEvent[] {
    return [];
  }

  reportWebhookFailure(_event: WebhookEvent): void {}
}
