import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { validateLoginInput } from "@/lib/auth-validation";
import { findUserByEmail, toSessionUser, updateUserLastLogin } from "@/lib/users";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        const validation = validateLoginInput({
          email: credentials?.email,
          password: credentials?.password,
        });

        if (!validation.success) {
          return null;
        }

        const user = await findUserByEmail(validation.data.email);

        if (!user) {
          return null;
        }

        const passwordMatches = await compare(validation.data.password, user.passwordHash);

        if (!passwordMatches) {
          return null;
        }

        const updatedUser = await updateUserLastLogin(user.id);
        return toSessionUser(updatedUser ?? user);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.username = user.username ?? null;
        token.role = user.role;
        token.createdAt = user.createdAt;
        token.lastLoginAt = user.lastLoginAt ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.email = token.email ?? "";
        session.user.name = token.name ?? "";
        session.user.username = typeof token.username === "string" ? token.username : null;
        session.user.role = token.role === "admin" ? "admin" : "user";
        session.user.createdAt = typeof token.createdAt === "string" ? token.createdAt : undefined;
        session.user.lastLoginAt = typeof token.lastLoginAt === "string" ? token.lastLoginAt : null;
      }

      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
