"use client";

import Link from "next/link";

const FEATURE_ROWS = [
  { feature: "Schedule & Standings", free: true, pro: true, sharp: true },
  { feature: "Trends (1 visible)", free: true, pro: false, sharp: false },
  { feature: "Props (3 visible)", free: true, pro: false, sharp: false },
  { feature: "All Trends", free: false, pro: true, sharp: true },
  { feature: "All Props", free: false, pro: true, sharp: true },
  { feature: "AI Picks (daily)", free: false, pro: true, sharp: true },
  { feature: "Line Shopping", free: false, pro: true, sharp: true },
  { feature: "Quick Hitters", free: false, pro: true, sharp: true },
  { feature: "100% Club", free: false, pro: true, sharp: true },
  { feature: "SGP Builder", free: false, pro: true, sharp: true },
  { feature: "Pick History", free: false, pro: true, sharp: true },
  { feature: "Golf Tournament Picks", free: false, pro: false, sharp: true },
  { feature: "Sharp Money Signals", free: false, pro: false, sharp: true },
  { feature: "Line Movement", free: false, pro: false, sharp: true },
  { feature: "My Picks + Parlay Builder", free: false, pro: false, sharp: true },
  { feature: "DVP Analysis", free: false, pro: false, sharp: true },
];

function Check() {
  return <span className="text-emerald-400 text-sm">✓</span>;
}
function Lock() {
  return <span className="text-gray-600 text-sm">—</span>;
}

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-dark-bg pb-24">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <img src="/logo.jpg" alt="Goosalytics" className="w-20 h-auto mx-auto rounded-2xl" />
          <h1 className="text-2xl font-bold text-white">Pick Smarter</h1>
          <p className="text-sm text-gray-400">Choose the plan that fits your game</p>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-3">
          {/* Free */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">Free</h3>
                <p className="text-gray-500 text-xs">Limited access</p>
              </div>
              <span className="text-white font-bold text-xl">$0</span>
            </div>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border-2 border-accent-blue bg-accent-blue/5 p-4 relative">
            <div className="absolute -top-2.5 left-4 bg-accent-blue text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
              Most Popular
            </div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-white font-bold text-lg">Pro</h3>
                <p className="text-gray-400 text-xs">Full analytics access</p>
              </div>
              <div className="text-right">
                <span className="text-white font-bold text-2xl">$14.99</span>
                <span className="text-gray-400 text-xs">/mo</span>
                <p className="text-emerald-400 text-[10px] mt-0.5">or $125/year (save 31%)</p>
              </div>
            </div>
            <button className="w-full rounded-xl bg-accent-blue text-white font-semibold py-3 text-sm tap-button">
              Subscribe to Pro
            </button>
          </div>

          {/* Sharp */}
          <div className="rounded-2xl border border-accent-yellow/40 bg-accent-yellow/5 p-4 relative">
            <div className="absolute -top-2.5 left-4 bg-accent-yellow text-dark-bg text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
              ⭐ Best Value
            </div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-white font-bold text-lg">Sharp</h3>
                <p className="text-gray-400 text-xs">Everything + edge tools</p>
              </div>
              <div className="text-right">
                <span className="text-white font-bold text-2xl">$24.99</span>
                <span className="text-gray-400 text-xs">/mo</span>
                <p className="text-emerald-400 text-[10px] mt-0.5">or $200/year (save 33%)</p>
              </div>
            </div>
            <button className="w-full rounded-xl bg-accent-yellow text-dark-bg font-semibold py-3 text-sm tap-button">
              Subscribe to Sharp
            </button>
          </div>
        </div>

        {/* Feature Comparison */}
        <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_50px_50px_50px] gap-1 px-4 py-2.5 border-b border-dark-border/50 text-[10px] uppercase tracking-wider text-gray-500">
            <div>Feature</div>
            <div className="text-center">Free</div>
            <div className="text-center text-accent-blue">Pro</div>
            <div className="text-center text-accent-yellow">Sharp</div>
          </div>
          {FEATURE_ROWS.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_50px_50px_50px] gap-1 px-4 py-2 border-b border-dark-border/20 text-xs">
              <div className="text-gray-300">{row.feature}</div>
              <div className="text-center">{row.free ? <Check /> : <Lock />}</div>
              <div className="text-center">{row.pro ? <Check /> : <Lock />}</div>
              <div className="text-center">{row.sharp ? <Check /> : <Lock />}</div>
            </div>
          ))}
        </div>

        {/* Discount Code */}
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs text-gray-400 mb-2">Have a discount code?</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter code"
              className="flex-1 h-10 rounded-xl border border-dark-border bg-dark-bg px-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-accent-blue"
            />
            <button className="h-10 rounded-xl border border-accent-blue bg-accent-blue/10 px-4 text-sm font-semibold text-accent-blue tap-button">
              Apply
            </button>
          </div>
        </div>

        {/* Beta note */}
        <p className="text-center text-[10px] text-gray-600">
          Beta testers enjoy full Sharp access for free. Subscriptions activate after beta.
        </p>

        <Link href="/" className="block text-center text-sm text-accent-blue font-medium tap-button">
          ← Back to app
        </Link>
      </div>
    </main>
  );
}
