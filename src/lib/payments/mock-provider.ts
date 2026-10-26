import type { PaymentProvider } from "./types";

// Тестовый провайдер: мгновенно подтверждает оплату, без реального эквайринга.
// Используется, пока не настроен реальный провайдер (см. docs/ARCHITECTURE.md, раздел 9).
export const mockProvider: PaymentProvider = {
  name: "MOCK",
  async createPayment() {
    return { status: "SUCCEEDED", externalId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  },
  async refundPayment() {
    return { status: "SUCCEEDED", externalId: `mock_refund_${Date.now()}` };
  },
};
