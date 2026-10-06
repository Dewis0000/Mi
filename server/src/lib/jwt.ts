import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_DAYS = 30;

export type AccessPayload = { sub: string };

export const signAccess = (userId: string) =>
  jwt.sign({ sub: userId } satisfies AccessPayload, config.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL_SEC });

export function verifyAccess(token: string): AccessPayload | null {
  try {
    return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessPayload;
  } catch {
    return null;
  }
}
