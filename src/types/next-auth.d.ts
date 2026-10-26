import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CUSTOMER" | "ACTOR" | "MANAGER" | "ADMIN";
      phone: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "CUSTOMER" | "ACTOR" | "MANAGER" | "ADMIN";
    phone?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: "CUSTOMER" | "ACTOR" | "MANAGER" | "ADMIN";
    phone?: string;
  }
}
