export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY || "";
}

function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || "";
}

export function createStripeServer() {
  const secretKey = getStripeSecretKey();
  const webhookSecret = getStripeWebhookSecret();

  return {
    isConfigured: Boolean(secretKey && webhookSecret),
    async verifyWebhookEvent(payload: string, signature?: string | null): Promise<StripeWebhookEvent | null> {
      if (!secretKey || !webhookSecret) return null;
      if (!signature) throw new Error("Missing Stripe signature");

      // Placeholder verification structure. Swap to the official SDK once keys are present.
      const parsed = JSON.parse(payload) as StripeWebhookEvent;
      return parsed;
    },
  };
}
