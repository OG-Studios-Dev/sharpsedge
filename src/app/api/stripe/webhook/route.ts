import { NextResponse } from "next/server";
import { createStripeServer } from "@/lib/stripe-server";

function extractCustomerId(object: Record<string, unknown>) {
  return typeof object.customer === "string" ? object.customer : null;
}

function extractSubscriptionStatus(object: Record<string, unknown>) {
  return typeof object.status === "string" ? object.status : "none";
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const stripe = createStripeServer();

  if (!stripe.isConfigured) {
    return NextResponse.json({
      received: true,
      configured: false,
      message: "Stripe keys are not configured yet.",
    }, { status: 202 });
  }

  const event = await stripe.verifyWebhookEvent(payload, signature);
  if (!event) {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const customerId = extractCustomerId(event.data.object);
      const status = extractSubscriptionStatus(event.data.object);
      return NextResponse.json({
        received: true,
        action: "checkout.session.completed",
        customerId,
        status,
      });
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const customerId = extractCustomerId(event.data.object);
      const status = extractSubscriptionStatus(event.data.object);
      return NextResponse.json({
        received: true,
        action: event.type,
        customerId,
        status,
      });
    }
    default:
      return NextResponse.json({ received: true, ignored: event.type });
  }
}
