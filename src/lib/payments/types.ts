export interface CreatePaymentInput {
  orderId: string;
  amount: number;
  description: string;
  returnUrl: string;
}

export interface CreatePaymentResult {
  status: "SUCCEEDED" | "PENDING";
  externalId: string;
  redirectUrl?: string;
}

export interface RefundResult {
  status: "SUCCEEDED" | "FAILED";
  externalId: string;
}

export interface PaymentProvider {
  name: "MOCK" | "YOOKASSA" | "CLOUDPAYMENTS" | "ROBOKASSA";
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  refundPayment(paymentExternalId: string, amount: number): Promise<RefundResult>;
}
