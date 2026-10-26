import { requireUser } from "@/lib/current-user";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { updateNotificationPrefsAction } from "./actions";

export const metadata = { title: "Уведомления" };
export const dynamic = "force-dynamic";

export default async function AccountNotificationsPage() {
  const user = await requireUser();

  return (
    <div>
      <h1 className="text-2xl font-bold">Уведомления</h1>
      <p className="mt-2 text-muted-foreground">Как напоминать о бронированиях и акциях</p>

      <form action={updateNotificationPrefsAction} className="mt-6 space-y-4 rounded-xl border p-5">
        <label className="flex items-center justify-between">
          <span>
            <span className="font-medium">SMS</span>
            <span className="block text-sm text-muted-foreground">Напоминания за 24 и 2 часа до игры</span>
          </span>
          <Checkbox name="notifyBySms" defaultChecked={user.notifyBySms} />
        </label>
        <label className="flex items-center justify-between">
          <span>
            <span className="font-medium">Email</span>
            <span className="block text-sm text-muted-foreground">Чеки, подтверждения, новости</span>
          </span>
          <Checkbox name="notifyByEmail" defaultChecked={user.notifyByEmail} />
        </label>
        <label className="flex items-center justify-between">
          <span>
            <span className="font-medium">Telegram</span>
            <span className="block text-sm text-muted-foreground">Бесплатные напоминания через бота (если вход через Telegram)</span>
          </span>
          <Checkbox name="notifyByTelegram" defaultChecked={user.notifyByTelegram} />
        </label>
        <Button type="submit">Сохранить</Button>
      </form>
    </div>
  );
}
