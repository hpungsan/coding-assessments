import {
  PaymentRequest,
  PaymentResponse,
  WebhookEvent,
} from "./types";

export class PaymentProcessor {
  constructor(clock?: () => number) {
    // TODO: store clock, initialize data structures
  }

  handle(request: PaymentRequest): PaymentResponse[] {
    // TODO: implement
    return [{ id: request.id, status: "IGNORED", message: "Not implemented" }];
  }

  tick(): string[] {
    // TODO: implement — advance time, expire transactions, emit retry signals
    return [];
  }

  flushWebhooks(): WebhookEvent[] {
    // TODO: implement — return and clear pending webhook events
    return [];
  }

  reportWebhookFailure(event: WebhookEvent): void {
    // TODO: implement — re-queue a failed webhook for one retry
  }
}
