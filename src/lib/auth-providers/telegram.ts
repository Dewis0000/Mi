import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramAuthPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

// Проверка подписи данных от Telegram Login Widget.
// https://core.telegram.org/widgets/login#checking-authorization
export function verifyTelegramPayload(
  payload: TelegramAuthPayload,
  botToken: string
): boolean {
  const { hash, ...rest } = payload;
  if (!hash) return false;

  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const expected = Buffer.from(computedHash, "hex");
  const actual = Buffer.from(hash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - payload.auth_date;
  return ageSeconds >= 0 && ageSeconds <= MAX_AUTH_AGE_SECONDS;
}
