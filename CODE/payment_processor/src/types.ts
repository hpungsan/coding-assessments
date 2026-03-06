export type TransactionStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "SETTLED"
  | "COMPLETED"
  | "EXPIRED"
  | "FAILED"
  | "REFUND_PENDING"
  | "REFUNDED";

export type ActionType =
  | "submit"
  | "authorize"
  | "capture"
  | "settle"
  | "complete"
  | "refund"
  | "refund_complete";

export interface PaymentRequest {
  id: string;
  type: ActionType;
  idempotencyKey?: string;
  success?: boolean;
  webhookUrl?: string;
  amount?: number;
}

export interface PaymentResponse {
  id: string;
  status: TransactionStatus | "QUEUED" | "IGNORED";
  message: string;
}

export interface WebhookEvent {
  transactionId: string;
  status: TransactionStatus;
  timestamp: number;
  webhookUrl: string;
}

export interface QueueEntry {
  id: string;
  action: "submit" | "refund";
  amount: number;
  idempotencyKey?: string;
  webhookUrl?: string;
}
