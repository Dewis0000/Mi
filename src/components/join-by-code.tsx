"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function handleJoin() {
    if (!code.trim()) {
      toast.error("Введите код комнаты. Любой. Мы не гордые.");
      return;
    }
    toast.success(`Заходим в комнату «${code.toUpperCase()}»…`);
    router.push("/play/demo");
  }

  return (
    <div className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Код комнаты, например ПОНТ-42"
        className="uppercase placeholder:normal-case"
      />
      <Button onClick={handleJoin}>Войти</Button>
    </div>
  );
}
