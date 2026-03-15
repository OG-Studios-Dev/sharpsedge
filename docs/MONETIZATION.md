# Goosalytics Monetization Plan

## Tiers

### Free ($0)
- AI picks of the day (delayed 30 min after lock)
- Basic schedule + standings
- Limited trends (top 5 only)

### Pro ($4.99/mo)
- Real-time AI picks at lock
- All player + team trends
- Line shopping (best book prices)
- Prop analysis + player drill-down
- Quick Hitters (1P/1Q markets)
- Pick History with W/L tracking

### Sharp ($9.99/mo)
- Everything in Pro
- Sharp money alerts
- Line movement tracking
- SGP builder with combined hit rates
- My Picks (personal pick tracking + parlays)
- 100% Club access
- Priority pick notifications (future)

## Special Access

### Beta Users
- All current signups during beta period get FULL Sharp access FREE
- Flag in Supabase profiles: `tier: "beta"` — bypasses all paywalls
- Beta period ends when we hit 50 users or Marco says so

### Family/Friends Discount Code
- Discount code system: `GOOSEFAM` → lifetime free Sharp access
- Stored in Supabase: discount_codes table
  - code (text), tier (text), discount_pct (integer), max_uses (integer), uses (integer), expires_at (timestamptz)
- Marco can create codes from admin dashboard
- Applied during signup or in settings

## Implementation (Stripe + Supabase)

### Stripe Setup
- Create Stripe account
- Products: "Goosalytics Pro" ($4.99/mo), "Goosalytics Sharp" ($9.99/mo)
- Stripe Checkout for subscription signup
- Stripe Customer Portal for managing subscription
- Webhook to sync subscription status → Supabase profiles.tier

### Supabase Schema Updates
```sql
-- Add tier + subscription fields to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

-- Discount codes table
CREATE TABLE IF NOT EXISTS public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  tier text NOT NULL DEFAULT 'sharp',
  discount_pct integer NOT NULL DEFAULT 100,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  created_by uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Middleware Tier Check
- Free users: redirect to upgrade page when accessing Pro/Sharp features
- Pro users: show Sharp features as locked with upgrade prompt
- Beta users: bypass all checks
- Check profile.tier in middleware or page-level

### Admin Dashboard
- Add "Revenue" tab: MRR, active subscribers, churn
- Discount code management: create, view uses, expire
- User tier management: manually upgrade/downgrade users

## Pricing Strategy
- Launch at $4.99/$9.99 — undercut LineMate ($29.99) significantly
- Beta users stay free forever (loyalty reward)
- Family code: GOOSEFAM (lifetime free)
- Consider annual pricing: $39.99/yr Pro, $79.99/yr Sharp (save ~33%)
- First 100 paying users get locked-in beta pricing forever
