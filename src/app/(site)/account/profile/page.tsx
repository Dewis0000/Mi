import { requireUser } from "@/lib/current-user";
import { isPendingPhone } from "@/lib/phone";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Профиль" };
export const dynamic = "force-dynamic";

export default async function AccountProfilePage() {
  const user = await requireUser();
  const phonePending = isPendingPhone(user.phone);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Профиль</h1>
        <ProfileForm name={user.name} email={user.email} phone={phonePending ? "" : user.phone} phonePending={phonePending} />
      </div>
      {user.passwordHash && (
        <div>
          <h2 className="text-lg font-semibold">Смена пароля</h2>
          <div className="mt-3">
            <PasswordForm />
          </div>
        </div>
      )}
    </div>
  );
}
