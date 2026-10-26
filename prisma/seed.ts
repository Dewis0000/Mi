import "dotenv/config";
import { PrismaClient } from "../generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "quest12345";

async function main() {
  console.log("Сидирование базы данных...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const location = await prisma.location.upsert({
    where: { id: "loc-moscow-center" },
    update: {},
    create: {
      id: "loc-moscow-center",
      name: "Лабиринт на Тверской",
      city: "Москва",
      address: "ул. Тверская, 1",
      phone: "+7 (900) 000-00-00",
      lat: 55.7616,
      lng: 37.6066,
    },
  });

  const admin = await prisma.user.upsert({
    where: { phone: "+79000000001" },
    update: {},
    create: {
      name: "Админ Админов",
      phone: "+79000000001",
      email: "admin@example.com",
      passwordHash,
      role: "ADMIN",
      phoneVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
      dataConsentAt: new Date(),
    },
  });

  const manager = await prisma.user.upsert({
    where: { phone: "+79000000002" },
    update: {},
    create: {
      name: "Мария Менеджер",
      phone: "+79000000002",
      email: "manager@example.com",
      passwordHash,
      role: "MANAGER",
      locationId: location.id,
      phoneVerifiedAt: new Date(),
      dataConsentAt: new Date(),
    },
  });

  const customer = await prisma.user.upsert({
    where: { phone: "+79000000003" },
    update: {},
    create: {
      name: "Иван Игроков",
      phone: "+79000000003",
      email: "customer@example.com",
      passwordHash,
      role: "CUSTOMER",
      locationId: location.id,
      phoneVerifiedAt: new Date(),
      dataConsentAt: new Date(),
      marketingConsent: true,
    },
  });

  console.log(`Пользователи: admin=${admin.phone}, manager=${manager.phone}, customer=${customer.phone}, пароль для всех: ${DEMO_PASSWORD}`);

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

  const roomsData = [
    {
      slug: "zov-ktkhulu",
      title: "Зов Ктулху",
      description:
        "Экспедиция пропала в заброшенном особняке на окраине города. Вам предстоит выяснить, что там произошло, — и не сойти с ума от того, что откроется. Атмосферный хоррор с живым актёром и декорациями в полный рост.",
      genre: "HORROR" as const,
      difficulty: "HARD" as const,
      minPlayers: 2,
      maxPlayers: 5,
      durationMinutes: 60,
      basePrice: 3500,
      extraPlayerPrice: 500,
      ageLimit: 16,
    },
    {
      slug: "delo-sherloka",
      title: "Дело Шерлока",
      description:
        "В Лондоне пропал важный документ, и только вы можете его найти по следам, которые оставил сам Холмс. Детективный квест с логическими головоломками и неожиданной разгадкой.",
      genre: "DETECTIVE" as const,
      difficulty: "MEDIUM" as const,
      minPlayers: 2,
      maxPlayers: 6,
      durationMinutes: 60,
      basePrice: 3200,
      extraPlayerPrice: 450,
      ageLimit: 10,
    },
    {
      slug: "stantsiya-ekho",
      title: "Станция «Эхо»",
      description:
        "Исследовательская станция на орбите потеряла связь с Землёй. Разберитесь, что случилось с экипажем, пока системы жизнеобеспечения не отключились окончательно.",
      genre: "SCIFI" as const,
      difficulty: "MEDIUM" as const,
      minPlayers: 2,
      maxPlayers: 5,
      durationMinutes: 60,
      basePrice: 3800,
      extraPlayerPrice: 500,
      ageLimit: 12,
    },
    {
      slug: "cherdak-kukolnogo-mastera",
      title: "Чердак кукольного мастера",
      description:
        "Старый кукольный мастер оставил на чердаке загадку для своих внуков. Добрый, в меру жуткий квест для всей семьи — с головоломками для детей и взрослых.",
      genre: "FAMILY" as const,
      difficulty: "EASY" as const,
      minPlayers: 2,
      maxPlayers: 8,
      durationMinutes: 50,
      basePrice: 2800,
      extraPlayerPrice: 350,
      ageLimit: 6,
    },
    {
      slug: "pobeg-iz-alkatrasa",
      title: "Побег из Алькатраса",
      description:
        "Вы — заключённые знаменитой тюрьмы, и у вас есть 60 минут, чтобы подготовить побег, пока охрана не вернулась с обхода. Динамичный квест с элементами физической активности.",
      genre: "ADVENTURE" as const,
      difficulty: "HARD" as const,
      minPlayers: 3,
      maxPlayers: 6,
      durationMinutes: 60,
      basePrice: 3900,
      extraPlayerPrice: 550,
      ageLimit: 12,
    },
  ];

  const rooms = [];
  for (const data of roomsData) {
    const room = await prisma.room.upsert({
      where: { slug: data.slug },
      update: {},
      create: { ...data, locationId: location.id },
    });
    rooms.push(room);

    for (let weekday = 0; weekday <= 6; weekday++) {
      await prisma.scheduleTemplate.create({
        data: {
          roomId: room.id,
          weekday,
          startTime: "11:00",
          endTime: "23:00",
        },
      });
    }

    await prisma.camera.create({
      data: {
        roomId: room.id,
        label: "Общий план",
        status: "OFFLINE",
      },
    });

    // Демо-отзыв на каждый квест
    await prisma.review.create({
      data: {
        roomId: room.id,
        authorName: "Команда « Огонь и лёд»",
        rating: 5,
        text: `Прошли «${data.title}» командой из четырёх человек — очень атмосферно, актёр отыграл на отлично, декорации на уровне!`,
        isPublished: true,
      },
    });
  }

  console.log(`Создано комнат: ${rooms.length}`);

  // Генерация слотов на 10 дней вперёд, с 11:00 до 23:00, шаг = длительность + уборка
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let slotsCreated = 0;

  for (const room of rooms) {
    const stepMinutes = room.durationMinutes + room.cleanupMinutes;
    for (let day = 1; day <= 10; day++) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() + day);
      dayStart.setHours(11, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 0, 0, 0);

      let slotStart = new Date(dayStart);
      while (slotStart.getTime() + room.durationMinutes * 60000 <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + room.durationMinutes * 60000);
        await prisma.slot.upsert({
          where: { roomId_startsAt: { roomId: room.id, startsAt: slotStart } },
          update: {},
          create: {
            roomId: room.id,
            startsAt: new Date(slotStart),
            endsAt: slotEnd,
            status: "OPEN",
          },
        });
        slotsCreated++;
        slotStart = new Date(slotStart.getTime() + stepMinutes * 60000);
      }
    }
  }
  console.log(`Создано слотов: ${slotsCreated}`);

  // Демо-промокод
  await prisma.promoCode.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: { code: "WELCOME10", type: "PERCENT", value: 10, maxUses: 1000, isActive: true },
  });

  // Демо-бронирование: уже завершённый визит клиента с начислением баллов
  const pastRoom = rooms[0];
  const pastSlot = await prisma.slot.create({
    data: {
      roomId: pastRoom.id,
      startsAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      endsAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + pastRoom.durationMinutes * 60000),
      status: "BOOKED",
    },
  });

  const pastBooking = await prisma.booking.create({
    data: {
      code: "QC-DEMO01",
      slotId: pastSlot.id,
      userId: customer.id,
      playersCount: 4,
      priceTotal: pastRoom.basePrice + 2 * pastRoom.extraPlayerPrice,
      status: "COMPLETED",
      filmingConsent: true,
      players: {
        create: [
          { fullName: "Иван Игроков" },
          { fullName: "Анна Смирнова" },
          { fullName: "Пётр Кузнецов" },
          { fullName: "Елена Волкова" },
        ],
      },
    },
  });

  const pastOrder = await prisma.order.create({
    data: {
      userId: customer.id,
      type: "BOOKING",
      bookingId: pastBooking.id,
      amount: pastBooking.priceTotal,
      status: "PAID",
      payments: {
        create: [
          {
            provider: "MOCK",
            status: "SUCCEEDED",
            amount: pastBooking.priceTotal,
            externalId: "mock_demo_payment_1",
            receipts: { create: [{ type: "SALE", amount: pastBooking.priceTotal, url: "#" }] },
          },
        ],
      },
    },
  });

  const pointsEarned = 100;
  await prisma.pointsTransaction.create({
    data: {
      userId: customer.id,
      type: "ACCRUAL",
      amount: pointsEarned,
      balanceAfter: pointsEarned,
      bookingId: pastBooking.id,
      note: `Начисление за визит «${pastRoom.title}»`,
    },
  });
  await prisma.user.update({ where: { id: customer.id }, data: { pointsBalance: pointsEarned } });

  console.log(`Демо-заказ создан: ${pastOrder.id}`);

  // Демо-пост в блоге
  await prisma.blogPost.upsert({
    where: { slug: "kak-vybrat-kvest-dlya-kompanii" },
    update: {},
    create: {
      slug: "kak-vybrat-kvest-dlya-kompanii",
      title: "Как выбрать квест для компании друзей",
      excerpt: "Собрали короткий гид: на что смотреть при выборе квеста, если идёте большой компанией впервые.",
      content:
        "Если вы идёте на квест впервые, обратите внимание на три вещи: уровень сложности, уровень активности и возрастной рейтинг. Для первого раза лучше выбрать квест со сложностью «Средне» — так будет интересно, но без разочарований. Если в команде есть люди, которые боятся замкнутых пространств или резких звуков, предупредите администратора — он подскажет, какие комнаты будут комфортнее.",
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  console.log("Готово.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
