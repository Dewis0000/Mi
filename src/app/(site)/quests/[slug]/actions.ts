"use server";

import { auth } from "@/lib/auth";
import { createBooking, BookingError } from "@/lib/booking";

export async function createBookingAction({
  slotId,
  playersCount,
}: {
  slotId: string;
  playersCount: number;
}) {
  const session = await auth();
  try {
    const { order } = await createBooking({ slotId, playersCount, userId: session?.user?.id });
    return { orderId: order.id };
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message };
    console.error(error);
    return { error: "Не удалось создать бронирование, попробуйте ещё раз" };
  }
}
