export interface DefaultSession {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires: string;
}

export interface Session extends DefaultSession {
  user: Record<string, any> & NonNullable<DefaultSession["user"]>;
}

export interface User extends Record<string, any> {
  id: string;
  email: string;
  name: string;
}

export interface JWT extends Record<string, any> {
  sub?: string;
  email?: string | null;
  name?: string | null;
  iat?: number;
  exp?: number;
}

export type CredentialsAuthorize = (
  credentials?: Record<string, any> | null,
) => Promise<User | null> | User | null;

export interface CredentialsConfig {
  id?: string;
  name?: string;
  credentials?: Record<string, { label: string; type: string }>;
  authorize: CredentialsAuthorize;
}

export interface Provider extends CredentialsConfig {
  id: string;
  type: "credentials";
}

export interface NextAuthOptions {
  secret?: string;
  session?: {
    strategy?: "jwt";
    maxAge?: number;
  };
  pages?: {
    signIn?: string;
  };
  providers: Provider[];
  callbacks?: {
    jwt?: (params: { token: JWT; user?: User | null }) => Promise<JWT> | JWT;
    session?: (params: { session: Session; token: JWT }) => Promise<Session> | Session;
  };
}
