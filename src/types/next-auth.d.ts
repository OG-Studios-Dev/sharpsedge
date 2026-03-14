import type { DefaultSession } from "next-auth";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      username?: string | null;
      role: "user" | "admin";
      createdAt?: string;
      lastLoginAt?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    username?: string | null;
    role: "user" | "admin";
    createdAt?: string;
    lastLoginAt?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string | null;
    role?: "user" | "admin";
    createdAt?: string;
    lastLoginAt?: string | null;
  }
}
