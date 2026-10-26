"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function generateCertCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "GIFT-";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createCertificateOrderAction(formData: FormData) {
  const amount = Number(formData.get("amount"));
  const purchaserEmail = String(formData.get("purchaserEmail") ?? "").trim();
  const recipientName = String(formData.get("recipientName") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!Number.isFinite(amount) || amount < 500) {
    return { error: "Укажите сумму сертификата (от 500 ₽)" };
  }
  if (!purchaserEmail) {
    return { error: "Укажите email — на него придёт сертификат" };
  }

  const session = await auth();

  const certificate = await prisma.giftCertificate.create({
    data: {
      code: generateCertCode(),
      amount,
      balance: amount,
      ownerId: session?.user?.id,
      purchaserEmail,
      recipientName: recipientName || undefined,
      message: message || undefined,
    },
  });

  const order = await prisma.order.create({
    data: {
      userId: session?.user?.id,
      type: "CERTIFICATE",
      certificateId: certificate.id,
      amount,
      status: "PENDING",
    },
  });

  return { orderId: order.id };
}
