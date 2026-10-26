import type { PaymentProvider } from "./types";

// Реальная интеграция с ЮKassa (https://yookassa.ru/developers/api).
// Активируется только при заданных YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY — см. getPaymentProvider().
// Чек (54-ФЗ) формируется на стороне ЮKassa автоматически при передаче объекта `receipt`;
// здесь это упрощено — объект чека нужно будет донастроить под реальные товары/налоговую систему.
export const yookassaProvider: PaymentProvider = {
  name: "YOOKASSA",
  async createPayment({ orderId, amount, description, returnUrl }) {
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      throw new Error("ЮKassa не настроена: заданы не все переменные YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY");
    }

    const response = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": orderId,
        Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: { value: amount.toFixed(2), currency: "RUB" },
        capture: true,
        confirmation: { type: "redirect", return_url: returnUrl },
        description,
        metadata: { orderId },
      }),
    });

    if (!response.ok) {
      throw new Error(`ЮKassa вернула ошибку ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return {
      status: data.status === "succeeded" ? "SUCCEEDED" : "PENDING",
      externalId: data.id,
      redirectUrl: data.confirmation?.confirmation_url,
    };
  },

  async refundPayment(paymentExternalId: string, amount: number) {
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) throw new Error("ЮKassa не настроена");

    const response = await fetch("https://api.yookassa.ru/v3/refunds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": `refund_${paymentExternalId}_${Date.now()}`,
        Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`,
      },
      body: JSON.stringify({ payment_id: paymentExternalId, amount: { value: amount.toFixed(2), currency: "RUB" } }),
    });
    if (!response.ok) throw new Error(`ЮKassa вернула ошибку ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return { status: data.status === "succeeded" ? "SUCCEEDED" : "FAILED", externalId: data.id };
  },
};

// Безопасная проверка статуса по вебхуку: вместо того, чтобы доверять телу запроса,
// запрашиваем актуальный статус платежа напрямую у ЮKassa по его id.
export async function fetchYookassaPaymentStatus(paymentId: string) {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) throw new Error("ЮKassa не настроена");

  const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}` },
  });
  if (!response.ok) throw new Error(`ЮKassa вернула ошибку ${response.status}`);
  return response.json();
}
