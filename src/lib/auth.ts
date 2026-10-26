import NextAuth, { type User as NextAuthUser } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import VK from "next-auth/providers/vk";
import Yandex from "next-auth/providers/yandex";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { verifyTelegramPayload, type TelegramAuthPayload } from "@/lib/auth-providers/telegram";
import type { ExternalProvider } from "../../generated/enums";

function mapOAuthProvider(provider: string): ExternalProvider | null {
  switch (provider) {
    case "vk":
      return "VK";
    case "yandex":
      return "YANDEX";
    default:
      return null;
  }
}

const providers: Provider[] = [
  Credentials({
    id: "credentials",
    name: "Телефон и пароль",
    credentials: {
      phone: { label: "Телефон", type: "text" },
      password: { label: "Пароль", type: "password" },
    },
    async authorize(creds): Promise<NextAuthUser | null> {
      const phone = normalizePhone(String(creds?.phone ?? ""));
      const password = String(creds?.password ?? "");
      if (!phone || !password) return null;

      const user = await prisma.user.findUnique({ where: { phone } });
      if (!user?.passwordHash) return null;

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      };
    },
  }),
];

// Вход через Telegram Login Widget — активен только при заданном токене бота.
if (process.env.TELEGRAM_BOT_TOKEN) {
  providers.push(
    Credentials({
      id: "telegram",
      name: "Telegram",
      credentials: { payload: { label: "Telegram payload", type: "text" } },
      async authorize(creds): Promise<NextAuthUser | null> {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken || !creds?.payload) return null;

        let payload: TelegramAuthPayload;
        try {
          payload = JSON.parse(String(creds.payload));
        } catch {
          return null;
        }
        if (!verifyTelegramPayload(payload, botToken)) return null;

        const providerAccountId = String(payload.id);
        const existing = await prisma.externalAccount.findUnique({
          where: { provider_providerAccountId: { provider: "TELEGRAM", providerAccountId } },
          include: { user: true },
        });
        if (existing) {
          return {
            id: existing.user.id,
            name: existing.user.name,
            email: existing.user.email,
            role: existing.user.role,
            phone: existing.user.phone,
          };
        }

        const created = await prisma.user.create({
          data: {
            name: [payload.first_name, payload.last_name].filter(Boolean).join(" ") || "Без имени",
            phone: `pending:telegram:${providerAccountId}`,
            avatarUrl: payload.photo_url,
            externalAccounts: {
              create: { provider: "TELEGRAM", providerAccountId, rawProfile: JSON.parse(JSON.stringify(payload)) },
            },
          },
        });
        return { id: created.id, name: created.name, email: created.email, role: created.role, phone: created.phone };
      },
    })
  );
}

// VK ID и Яндекс ID — активны только при заданных ключах приложения (AUTH_VK_ID/AUTH_VK_SECRET,
// AUTH_YANDEX_ID/AUTH_YANDEX_SECRET), подхватываются next-auth автоматически из env.
if (process.env.AUTH_VK_ID && process.env.AUTH_VK_SECRET) {
  providers.push(VK);
}
if (process.env.AUTH_YANDEX_ID && process.env.AUTH_YANDEX_SECRET) {
  providers.push(Yandex);
}

// MAX (национальный мессенджер VK Group) — на момент разработки нет стабильного публичного
// OAuth-эндпоинта для сверки. Провайдер подключается по той же схеме (generic OAuth provider),
// когда появится официальная документация — см. docs/ARCHITECTURE.md, раздел 3 и 15.

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account && account.provider !== "credentials" && account.provider !== "telegram") {
        const providerEnum = mapOAuthProvider(account.provider);
        if (providerEnum && account.providerAccountId) {
          const existing = await prisma.externalAccount.findUnique({
            where: {
              provider_providerAccountId: { provider: providerEnum, providerAccountId: account.providerAccountId },
            },
            include: { user: true },
          });

          if (existing) {
            token.userId = existing.userId;
            token.role = existing.user.role;
            token.phone = existing.user.phone;
          } else {
            const created = await prisma.user.create({
              data: {
                name: (profile?.name as string) ?? user?.name ?? "Без имени",
                phone: `pending:${account.provider}:${account.providerAccountId}`,
                avatarUrl: (profile?.image as string) ?? user?.image ?? undefined,
                externalAccounts: {
                  create: {
                    provider: providerEnum,
                    providerAccountId: account.providerAccountId,
                    rawProfile: profile ? JSON.parse(JSON.stringify(profile)) : undefined,
                  },
                },
              },
            });
            token.userId = created.id;
            token.role = created.role;
            token.phone = created.phone;
          }
        }
      } else if (user) {
        token.userId = (user as { id: string }).id;
        token.role = (user as { role?: typeof token.role }).role;
        token.phone = (user as { phone?: string }).phone;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as typeof session.user.role) ?? "CUSTOMER";
        session.user.phone = (token.phone as string) ?? "";
      }
      return session;
    },
  },
});
