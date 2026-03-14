import AuthShell from "@/components/auth/AuthShell";
import SignupForm from "@/components/auth/SignupForm";
import { getSafeCallbackUrl } from "@/lib/auth-redirect";

type SignupPageProps = {
  searchParams?: {
    callbackUrl?: string | string[];
  };
};

export default function SignupPage({ searchParams }: SignupPageProps) {
  const callbackUrl = getSafeCallbackUrl(searchParams?.callbackUrl);

  return (
    <AuthShell
      title="Create your account"
      description="Set up a test account in a few seconds and Goosalytics will drop you straight into the main dashboard."
    >
      <SignupForm callbackUrl={callbackUrl} />
    </AuthShell>
  );
}
