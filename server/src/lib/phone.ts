import { z } from 'zod';

/** Приводит российский номер к формату +7XXXXXXXXXX */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 11 && (d.startsWith('8') || d.startsWith('7'))) d = '7' + d.slice(1);
  else if (d.length === 10) d = '7' + d;
  else return null;
  return '+' + d;
}

export const phoneSchema = z
  .string()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Неверный формат телефона' });
      return z.NEVER;
    }
    return p;
  });

export function formatPhone(p: string) {
  const d = p.replace(/\D/g, '');
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}
