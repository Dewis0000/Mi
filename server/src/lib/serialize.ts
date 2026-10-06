import type { AuthedUser } from '../middleware/auth.js';

/** Публичное представление пользователя. Название роли видно только главному администратору. */
export function serializeUser(user: AuthedUser) {
  const perms = user.role?.permissions ?? [];
  return {
    id: user.id,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    name: user.name,
    birthDate: user.birthDate,
    email: user.email,
    points: user.points,
    messenger: user.messenger,
    linked: { telegram: !!user.telegramChatId, vk: !!user.vkUserId, max: !!user.maxUserId },
    notify: { bookings: user.notifyBookings, reminders: user.notifyReminders, promo: user.notifyPromo },
    hasPassword: !!user.passwordHash,
    isStaff: perms.length > 0,
    permissions: perms,
    roleName: perms.includes('roles.manage') ? user.role?.name : undefined,
    createdAt: user.createdAt,
  };
}
