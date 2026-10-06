export const PERMISSIONS = {
  'dashboard.view': 'Дашборд',
  'bookings.view': 'Просмотр заявок',
  'bookings.edit': 'Редактирование заявок',
  'users.view': 'Просмотр пользователей',
  'users.edit': 'Работа с пользователями',
  'points.edit': 'Корректировка баллов',
  'quests.edit': 'Управление квестами',
  'content.edit': 'Тексты и контакты',
  'recordings.manage': 'Видеозаписи',
  'reports.view': 'Отчётность',
  'payments.view': 'Платежи',
  'promo.edit': 'Промокоды и сертификаты',
  'settings.edit': 'Настройки записи и лояльности',
  'logs.view': 'Журнал действий',
  'roles.manage': 'Управление ролями',
} as const;

export type Permission = keyof typeof PERMISSIONS;
const ALL = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLES: { key: string; name: string; permissions: Permission[] }[] = [
  { key: 'owner', name: 'Главный администратор', permissions: ALL },
  { key: 'deputy', name: 'Заместитель администратора', permissions: ALL.filter((p) => p !== 'roles.manage') },
  {
    key: 'accountant',
    name: 'Бухгалтер',
    permissions: ['dashboard.view', 'bookings.view', 'reports.view', 'payments.view'],
  },
  {
    key: 'operator',
    name: 'Оператор / администратор зала',
    permissions: ['dashboard.view', 'bookings.view', 'bookings.edit', 'users.view', 'users.edit', 'recordings.manage'],
  },
];
