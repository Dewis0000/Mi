// Минимальная настройка для продакшена — в отличие от seed.ts здесь НЕТ демо-квестов
// и фейковых бронирований, только то, без чего сайт не будет работать:
// уровни лояльности, одна локация-заготовка и аккаунт первого администратора.
// Безопасно запускать повторно при каждом деплое (идемпотентно).
import "dotenv/config";
import { PrismaClient } from "../generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.loyaltyTier.upsert({
    where: { level: "BASE" },
    update: {},
    create: { level: "BASE", minVisits: 0, bonusPercent: 0, perks: "Базовое начисление баллов" },
  });
  await prisma.loyaltyTier.upsert({
    where: { level: "SILVER" },
    update: {},
    create: { level: "SILVER", minVisits: 3, bonusPercent: 10, perks: "+10% к начислению баллов" },
  });
  await prisma.loyaltyTier.upsert({
    where: { level: "GOLD" },
    update: {},
    create: { level: "GOLD", minVisits: 6, bonusPercent: 20, perks: "+20% к начислению, приоритетная бронь" },
  });
  await prisma.loyaltyTier.upsert({
    where: { level: "VIP" },
    update: {},
    create: { level: "VIP", minVisits: 11, bonusPercent: 30, perks: "+30%, бесплатный квест на день рождения" },
  });
  console.log("Уровни лояльности готовы.");

  const location = await prisma.location.upsert({
    where: { id: "loc-default" },
    update: {},
    create: {
      id: "loc-default",
      name: process.env.BOOTSTRAP_LOCATION_NAME || "Главная локация",
      city: process.env.BOOTSTRAP_LOCATION_CITY || "Укажите город",
      address: process.env.BOOTSTRAP_LOCATION_ADDRESS || "Укажите адрес в /admin/locations",
    },
  });
  console.log(`Локация готова: ${location.name} (отредактируйте в /admin/locations).`);

  const adminPhoneRaw = process.env.ADMIN_PHONE;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPhoneRaw || !adminPassword) {
    console.log("ADMIN_PHONE/ADMIN_PASSWORD не заданы — аккаунт администратора не создан.");
    return;
  }

  const digits = adminPhoneRaw.replace(/\D/g, "");
  const adminPhone = digits.length === 11 ? `+7${digits.slice(1)}` : digits.length === 10 ? `+7${digits}` : adminPhoneRaw;
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const existing = await prisma.user.findUnique({ where: { phone: adminPhone } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
    console.log(`Пользователь ${adminPhone} назначен администратором.`);
  } else {
    await prisma.user.create({
      data: {
        name: process.env.ADMIN_NAME || "Администратор",
        phone: adminPhone,
        passwordHash,
        role: "ADMIN",
        phoneVerifiedAt: new Date(),
        dataConsentAt: new Date(),
      },
    });
    console.log(`Создан администратор: ${adminPhone}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
