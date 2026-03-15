type StripeLike = {
  redirectToCheckout: (options: { sessionId: string }) => Promise<{ error?: { message?: string } }>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeLike;
  }
}

let stripePromise: Promise<StripeLike | null> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Stripe.js"));
    document.head.appendChild(script);
  });
}

export async function loadStripeClient() {
  if (typeof window === "undefined") return null;

  if (!stripePromise) {
    stripePromise = (async () => {
      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) return null;
      await loadScript("https://js.stripe.com/v3/");
      return window.Stripe ? window.Stripe(publishableKey) : null;
    })();
  }

  return stripePromise;
}
