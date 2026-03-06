import {
  PaymentRequest,
  PaymentResponse,
  TransactionStatus,
  ActionType,
  WebhookEvent,
  QueueEntry,
} from "../src/types";
import { MAX_ACTIVE, STATE_TTLS, IDEMPOTENCY_TTL } from "../src/config";

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
  private queueHead = 0;
  private queued = new Set<string>();
  private idempotencyCache = new Map<string, { fingerprint: string; responses: PaymentResponse[]; cachedAt: number }>();
  private clock: () => number;

  constructor(clock?: () => number) {
    this.clock = clock ?? Date.now;
  }

  handle(request: PaymentRequest): PaymentResponse[] {
    const { id, idempotencyKey } = request;

    if (idempotencyKey) {
      const cached = this.idempotencyCache.get(idempotencyKey);
      if (cached) {
        if (this.clock() - cached.cachedAt >= IDEMPOTENCY_TTL) {
          this.idempotencyCache.delete(idempotencyKey);
        } else if (cached.fingerprint === this.fingerprint(request)) {
          return cached.responses.map(r => ({ ...r }));
        } else {
          return [{ id, status: "CONFLICT", message: "Idempotency key conflict" }];
        }
      }
    }

    const responses = this.processRequest(request);

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, {
        fingerprint: this.fingerprint(request),
        responses: responses.map(r => ({ ...r })),
        cachedAt: this.clock(),
      });
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
      if (this.activeCount > 0) this.activeCount--;
      this.promoteQueue(responses);
    }

    return responses;
  }

  private fingerprint(req: PaymentRequest): string {
    return JSON.stringify([req.id, req.type, req.amount ?? null, req.webhookUrl ?? null, req.success ?? null]);
  }

  private promoteQueue(responses: PaymentResponse[]): void {
    if (this.queueHead >= this.queue.length || this.activeCount >= MAX_ACTIVE) return;
    const entry = this.queue[this.queueHead++];
    this.queued.delete(entry.id);
    this.transactions.set(entry.id, { status: "PENDING", stateEnteredAt: this.clock() });
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
    const now = this.clock();
    const signals: string[] = [];

    // Check for expirations
    for (const [id, tx] of this.transactions) {
      const ttl = STATE_TTLS[tx.status];
      if (ttl === undefined) continue; // COMPLETED, EXPIRED, etc. don't expire
      if (now - tx.stateEnteredAt >= ttl) {
        tx.status = "EXPIRED";
        if (this.activeCount > 0) this.activeCount--;
        signals.push(`${id}:expired`);
      }
    }

    // Idempotency correctness is handled lazily in handle() (evict-on-access).
    // This sweep is optional memory hygiene — it cleans entries that are never
    // re-accessed. Can be removed if the O(n) scan per tick becomes costly.
    for (const [key, entry] of this.idempotencyCache) {
      if (now - entry.cachedAt >= IDEMPOTENCY_TTL) {
        this.idempotencyCache.delete(key);
      }
    }

    // Promote from queue after freeing slots
    while (this.queueHead < this.queue.length && this.activeCount < MAX_ACTIVE) {
      const entry = this.queue[this.queueHead++];
      this.queued.delete(entry.id);
      this.transactions.set(entry.id, { status: "PENDING", stateEnteredAt: now });
      this.activeCount++;
      signals.push(`${entry.id}:promoted`);
    }

    this.compactQueue();
    return signals;
  }

  flushWebhooks(): WebhookEvent[] {
    return [];
  }

  reportWebhookFailure(_event: WebhookEvent): void {}
}
