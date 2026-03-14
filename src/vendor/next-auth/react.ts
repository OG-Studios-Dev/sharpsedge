type SignInOptions = {
  redirect?: boolean;
  callbackUrl?: string;
  [key: string]: any;
};

type SignOutOptions = {
  redirect?: boolean;
  callbackUrl?: string;
};

export async function signIn(provider: string, options: SignInOptions = {}) {
  const response = await fetch(`/api/auth/callback/${provider}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  const data = await response.json().catch(() => null);
  const result = {
    ok: response.ok && !data?.error,
    error: data?.error ?? null,
    status: response.status,
    url: data?.url ?? options.callbackUrl ?? null,
  };

  if (options.redirect !== false && result.url) {
    window.location.assign(result.url);
  }

  return result;
}

export async function signOut(options: SignOutOptions = {}) {
  const response = await fetch("/api/auth/signout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  const data = await response.json().catch(() => null);
  const url = data?.url ?? options.callbackUrl ?? "/";

  if (options.redirect !== false) {
    window.location.assign(url);
  }

  return { url };
}
