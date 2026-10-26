"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { demoteStaffAction } from "./actions";

export function StaffRow({ user }: { user: { id: string; name: string; phone: string; role: string; locationName: string | null } }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">{user.name}</p>
        <p className="text-sm text-muted-foreground">
          {user.phone} {user.locationName ? `· ${user.locationName}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge>{user.role}</Badge>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => startTransition(() => demoteStaffAction(user.id))}>
          Снять роль
        </Button>
      </div>
    </div>
  );
}
