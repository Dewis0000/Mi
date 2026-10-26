// Нормализация телефона к формату +7XXXXXXXXXX (телефон — основной идентификатор клиента).
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  return null;
}

export function isPendingPhone(phone: string) {
  return phone.startsWith("pending:");
}
