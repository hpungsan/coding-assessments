import { TransactionStatus } from "./types";

export const MAX_ACTIVE = 4;
export const MAX_RETRIES = 3;

export const STATE_TTLS: Partial<Record<TransactionStatus, number>> = {
  PENDING: 30_000,
  AUTHORIZED: 60_000,
  CAPTURED: 60_000,
  SETTLED: 30_000,
  REFUND_PENDING: 30_000,
};

export function backoffMs(attempt: number): number {
  return 1000 * Math.pow(2, attempt);
}
