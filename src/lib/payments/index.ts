import { mockProvider } from "./mock-provider";
import { yookassaProvider } from "./yookassa-provider";
import type { PaymentProvider } from "./types";

export function getPaymentProvider(): PaymentProvider {
  const configured = (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase();
  if (configured === "yookassa" && process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) {
    return yookassaProvider;
  }
  // CloudPayments/Robokassa — подключаются по той же схеме (см. docs/ARCHITECTURE.md, раздел 9),
  // провайдеры добавляются в этот файл по мере необходимости.
  return mockProvider;
}

export type { PaymentProvider, CreatePaymentInput, CreatePaymentResult } from "./types";
