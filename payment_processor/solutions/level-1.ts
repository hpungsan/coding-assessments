import {
  PaymentRequest,
  PaymentResponse,
  TransactionStatus,
  ActionType,
  WebhookEvent,
} from "../src/types";

const TRANSITIONS: Partial<Record<TransactionStatus, Partial<Record<ActionType, TransactionStatus>>>> = {
  PENDING:    { authorize: "AUTHORIZED" },
  AUTHORIZED: { capture: "CAPTURED" },
  CAPTURED:   { settle: "SETTLED" },
  SETTLED:    { complete: "COMPLETED" },
};

export class PaymentProcessor {
  private transactions = new Map<string, TransactionStatus>();

  constructor(_clock?: () => number) {}

  handle(request: PaymentRequest): PaymentResponse[] {
    const { id, type } = request;

    // Submit — create new transaction
    if (type === "submit") {
      if (this.transactions.has(id)) {
        return [{ id, status: "IGNORED", message: "Transaction already exists" }];
      }
      this.transactions.set(id, "PENDING");
      return [{ id, status: "PENDING", message: "Transaction created" }];
    }

    // Transition — look up in table
    const current = this.transactions.get(id);
    if (!current) {
      return [{ id, status: "IGNORED", message: "Transaction not found" }];
    }

    const next = TRANSITIONS[current]?.[type];
    if (!next) {
      return [{ id, status: "IGNORED", message: `Cannot ${type} from ${current}` }];
    }

    this.transactions.set(id, next);
    return [{ id, status: next, message: `Transitioned to ${next}` }];
  }

  tick(): string[] {
    return [];
  }

  flushWebhooks(): WebhookEvent[] {
    return [];
  }

  reportWebhookFailure(_event: WebhookEvent): void {}
}
