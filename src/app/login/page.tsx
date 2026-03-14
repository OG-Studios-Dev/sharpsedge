import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";
import { getSafeCallbackUrl } from "@/lib/auth-redirect";

type LoginPageProps = {
  searchParams?: {
    callbackUrl?: string | string[];
    error?: string | string[];
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const callbackUrl = getSafeCallbackUrl(searchParams?.callbackUrl);
  const initialError = typeof searchParams?.error === "string" ? searchParams.error : undefined;

  return (
    <AuthShell
      title="Log in to your dashboard"
      description="Use your Goosalytics account to access live props, trends, schedules, and saved picks across the app."
    >
      <LoginForm callbackUrl={callbackUrl} initialError={initialError} />
    </AuthShell>
  );
}
