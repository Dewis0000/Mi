import { NextResponse } from "next/server";
import { fetchYookassaPaymentStatus } from "@/lib/payments/yookassa-provider";
import { finalizePaidOrder } from "@/lib/payments/finalize";

// Вебхук ЮKassa. Не задействован без реальных YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY —
// см. docs/ARCHITECTURE.md, раздел 9. URL для настройки в личном кабинете ЮKassa:
// https://<домен>/api/payments/webhook
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const paymentId = body?.object?.id;
  if (typeof paymentId !== "string") {
    return NextResponse.json({ ok: false, error: "Некорректное тело запроса" }, { status: 400 });
  }

  // Тело вебхука не считаем источником правды — запрашиваем актуальный статус
  // платежа напрямую у ЮKassa по его id, это защищает от поддельных вызовов.
  let payment: { status?: string; metadata?: { orderId?: string } };
  try {
    payment = await fetchYookassaPaymentStatus(paymentId);
  } catch (error) {
    console.error("YooKassa webhook: не удалось проверить платёж", error);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const orderId = payment.metadata?.orderId;
  if (payment.status === "succeeded" && orderId) {
    await finalizePaidOrder(orderId, "YOOKASSA", paymentId);
  }

  return NextResponse.json({ ok: true });
}
