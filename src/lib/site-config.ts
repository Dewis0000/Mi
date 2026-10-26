export const siteConfig = {
  name: "Лабиринт",
  fullName: "Квест-клуб «Лабиринт»",
  description:
    "Квесты в реальности в Москве: живые комнаты с актёрами, онлайн-бронирование, баллы за каждое посещение и видео на память.",
  url: "https://example.com",
  // TODO: заменить на реальные юридические и контактные данные перед запуском
  legalEntity: "ИП Иванов Иван Иванович, ИНН 000000000000",
  phone: "+7 (900) 000-00-00",
  email: "info@example.com",
  address: "Москва, ул. Примерная, 1",
  workingHours: "Ежедневно, 10:00–23:00",
  social: {
    vk: "https://vk.com/",
    telegram: "https://t.me/",
  },
};

export const mainNav = [
  { title: "Квесты", href: "/quests" },
  { title: "Цены", href: "/pricing" },
  { title: "Лояльность", href: "/loyalty" },
  { title: "Для бизнеса", href: "/business" },
  { title: "Отзывы", href: "/reviews" },
  { title: "Блог", href: "/blog" },
  { title: "Контакты", href: "/contacts" },
] as const;

export const footerNav = {
  club: [
    { title: "Квесты", href: "/quests" },
    { title: "Цены и абонементы", href: "/pricing" },
    { title: "Подарочные сертификаты", href: "/certificates" },
    { title: "Программа лояльности", href: "/loyalty" },
    { title: "Отзывы", href: "/reviews" },
  ],
  company: [
    { title: "О клубе", href: "/about" },
    { title: "Для бизнеса и праздников", href: "/business" },
    { title: "Блог", href: "/blog" },
    { title: "Вопросы и ответы", href: "/faq" },
    { title: "Контакты", href: "/contacts" },
  ],
  legal: [
    { title: "Публичная оферта", href: "/legal/offer" },
    { title: "Политика конфиденциальности", href: "/legal/privacy" },
    { title: "Правила посещения", href: "/legal/rules" },
  ],
} as const;
