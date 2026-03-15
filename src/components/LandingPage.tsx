"use client";

import { ChevronRight, Percent, ArrowUpRight, Flame, Shield, Activity, DollarSign } from "lucide-react";
import Link from "next/link";
import LandingNav from "./LandingNav";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-dark-bg text-text-platinum font-sans overflow-x-hidden">
      <LandingNav />

      {/* Hero Section */}
      <section className="relative h-[100dvh] flex items-center justify-center lg:justify-start lg:pl-[10%] px-6 overflow-hidden">
        {/* Deep gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-dark-surface/50 to-dark-bg -z-10" />
        
        {/* Subtle radial glow from accent color */}
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-accent-blue/5 rounded-full blur-[120px] -z-10" />

        <div className="max-w-3xl z-10 w-full pt-20">
          <div className="space-y-6">
            <h1 className="font-heading font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-text-platinum to-text-platinum/60 text-5xl md:text-7xl lg:text-[5rem] leading-tight tracking-tight animate-slide-up" style={{ animationDelay: "0.05s" }}>
              The Goose Knows.
            </h1>
            <p className="font-sans text-lg md:text-xl text-text-platinum/70 max-w-2xl leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
              AI-driven trend signals, player prop analysis, and same-game parlays across NHL & NBA. Your edge, quantified.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-6 pt-4 animate-slide-up" style={{ animationDelay: "0.15s" }}>
              <Link
                href="/signup"
                className="group relative overflow-hidden bg-accent-blue text-dark-bg px-8 py-4 rounded-full font-bold text-lg w-full sm:w-auto text-center transition-transform hover:scale-[1.02]"
                style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Let the Goose Loose <ChevronRight size={20} />
                </span>
                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></span>
              </Link>
              <Link href="/login" className="text-text-platinum/80 hover:text-text-platinum font-semibold transition-colors">
                Log In
              </Link>
            </div>
          </div>
        </div>

        {/* Hero Mockup (Prop Card) */}
        <div className="hidden lg:block absolute top-[55%] right-[5%] -translate-y-1/2 rotate-[4deg] w-[400px] animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="p-[1px] rounded-3xl bg-gradient-to-br from-accent-blue/30 to-transparent shadow-[0_0_50px_-12px_rgba(74,158,255,0.25)]">
            <div className="bg-dark-card rounded-[23px] overflow-hidden backdrop-blur-xl border border-dark-border/50 p-6 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-heading font-bold text-xl">Auston Matthews</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    <span className="text-sm text-text-platinum/60">TOR vs MTL</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-text-platinum/60 uppercase tracking-wider">Goals</div>
                  <div className="mt-1 bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded text-sm font-bold font-mono inline-block">O 0.5</div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between text-text-platinum/50"><span>L10 Games</span><span>80%</span></div>
                  <div className="h-1.5 w-full bg-dark-bg rounded-full overflow-hidden">
                    <div className="h-full bg-accent-green w-[80%]"></div>
                  </div>
                </div>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between text-text-platinum/50"><span>Home</span><span>75%</span></div>
                  <div className="h-1.5 w-full bg-dark-bg rounded-full overflow-hidden">
                    <div className="h-full bg-accent-yellow w-[75%]"></div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-dark-border/50 pt-4">
                <div>
                  <div className="text-xs text-text-platinum/50 uppercase tracking-widest font-mono">Edge</div>
                  <div className="font-mono text-xl font-bold text-accent-green">+14.2%</div>
                </div>
                <div className="flex gap-1">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-red/20 text-accent-red"><Flame size={12} /></span>
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-green/20 text-accent-green"><DollarSign size={12} /></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-heading text-4xl font-bold tracking-tight">The Edge</h2>
          <p className="text-text-platinum/60 mt-4 max-w-xl mx-auto text-lg">World-class insight powered by real data, presented in a terminal built for winning.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="group bg-dark-card border border-dark-border rounded-3xl p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_8px_30px_-12px_rgba(74,158,255,0.15)] flex flex-col items-center text-center">
            <div className="w-full bg-dark-surface rounded-2xl p-4 mb-6 border border-dark-border/50 relative overflow-hidden">
              <div className="h-1 w-[60%] bg-accent-green rounded-full bg-gradient-to-r from-accent-green/20 to-accent-green animate-pulse"></div>
              <div className="h-1 w-[40%] bg-accent-red rounded-full bg-gradient-to-r from-accent-red/20 to-accent-red mt-2 opacity-50"></div>
              <div className="absolute inset-0 bg-gradient-to-t from-dark-surface to-transparent"></div>
            </div>
            <h3 className="font-heading text-xl font-bold mb-2">AI-Graded Player Props</h3>
            <p className="text-sm text-text-platinum/60">Every prop graded across L10, home/away, and matchup splits to find the mathematical edge.</p>
          </div>

          {/* Card 2 */}
          <div className="group bg-dark-card border border-dark-border rounded-3xl p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_8px_30px_-12px_rgba(74,158,255,0.15)] flex flex-col items-center text-center">
            <div className="w-full bg-dark-surface rounded-2xl p-4 mb-6 border border-dark-border/50 relative overflow-hidden flex flex-col gap-2">
              <div className="h-6 w-full bg-dark-bg rounded border border-dark-border/50 flex items-center px-2"><div className="h-2 w-16 bg-text-platinum/20 rounded"></div></div>
              <div className="h-6 w-full bg-dark-bg rounded border border-dark-border/50 flex items-center px-2"><div className="h-2 w-12 bg-text-platinum/20 rounded"></div></div>
              <div className="absolute bottom-2 right-2 font-mono text-accent-blue font-bold text-sm">+450</div>
            </div>
            <h3 className="font-heading text-xl font-bold mb-2">Same-Game Parlay Engine</h3>
            <p className="text-sm text-text-platinum/60">Stack high-confidence micro-edges into plus-money parlays mathematically correlated for success.</p>
          </div>

          {/* Card 3 */}
          <div className="group bg-dark-card border border-dark-border rounded-3xl p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_8px_30px_-12px_rgba(74,158,255,0.15)] flex flex-col items-center text-center">
            <div className="w-full bg-dark-surface rounded-2xl p-6 mb-6 border border-dark-border/50 flex justify-center gap-2">
              <span className="w-8 h-8 rounded bg-accent-blue/20 text-accent-blue flex items-center justify-center animate-pulse" style={{ animationDelay: "0s" }}><Activity size={16} /></span>
              <span className="w-8 h-8 rounded bg-accent-green/20 text-accent-green flex items-center justify-center animate-pulse" style={{ animationDelay: "0.2s" }}><Percent size={16} /></span>
              <span className="w-8 h-8 rounded bg-accent-yellow/20 text-accent-yellow flex items-center justify-center animate-pulse" style={{ animationDelay: "0.4s" }}><Flame size={16} /></span>
            </div>
            <h3 className="font-heading text-xl font-bold mb-2">Real-Time Trend Signals</h3>
            <p className="text-sm text-text-platinum/60">Instant categorization of streaks, surges, and drops. Let the indicators highlight what human eyes miss.</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 border-t border-dark-border/50 bg-dark-surface/30">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-heading text-3xl font-bold text-center mb-16">The Protocol</h2>
          <div className="flex flex-col md:flex-row gap-8 justify-between relative">
            <div className="hidden md:block absolute top-[28px] left-[10%] right-[10%] h-[1px] bg-dark-border/50 z-0"></div>
            
            {[
              { num: "01", title: "Pick Your League", desc: "Toggle seamlessly between NHL and NBA ecosystems." },
              { num: "02", title: "Surface The Edges", desc: "Our engine scans thousands of props, grading splits instantly." },
              { num: "03", title: "Make Smarter Bets", desc: "Save picks, build parlays, and track your performance over time." }
            ].map((step, i) => (
              <div key={i} className="flex-1 text-center relative z-10">
                <div className="w-14 h-14 mx-auto bg-dark-card border border-accent-blue/30 text-accent-blue rounded-2xl flex items-center justify-center font-mono text-xl font-bold mb-6 shadow-[0_0_15px_-5px_rgba(74,158,255,0.3)]">
                  {step.num}
                </div>
                <h4 className="font-heading font-bold text-lg mb-2">{step.title}</h4>
                <p className="text-sm text-text-platinum/60">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 text-center relative overflow-hidden border-t border-dark-border/50">
        <div className="absolute inset-0 bg-gradient-to-b from-dark-bg to-accent-blue/10 -z-10" />
        <h2 className="font-heading text-4xl md:text-5xl font-bold mb-6">Stop Guessing.<br/>Start Finding Edges.</h2>
        <p className="text-lg text-text-platinum/60 mb-10 max-w-xl mx-auto">Join the private members' terminal for sports bettors who take statistics seriously.</p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 bg-accent-blue text-dark-bg px-10 py-5 rounded-full font-bold text-lg hover:scale-105 transition-transform"
          style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
        >
          Let the Goose Loose <ArrowUpRight size={20} />
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-dark-card border-t border-dark-border py-12 rounded-t-3xl mt-[-20px] relative z-20">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-4">
            <span className="font-drama text-2xl tracking-tight text-text-platinum font-bold italic">
              Goosa<span className="font-heading not-italic font-black text-accent-blue">lytics</span>
            </span>
            <p className="text-sm text-text-platinum/50 max-w-sm">The automated sports betting terminal for finding mathematical edges in player props and parlays across North American sports.</p>
            <div className="flex items-center gap-2 text-xs font-mono text-text-platinum/50 bg-dark-bg/50 inline-flex px-3 py-1.5 rounded-full border border-dark-border/50">
              <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse"></span>
              System Status: ONLINE
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-text-platinum/80">Platform</h4>
            <div className="flex flex-col gap-2 text-sm text-text-platinum/50">
              <Link href="#features" className="hover:text-text-platinum transition-colors">Features</Link>
              <Link href="#pricing" className="hover:text-text-platinum transition-colors">Pricing</Link>
              <Link href="/login" className="hover:text-text-platinum transition-colors">Log In</Link>
              <Link href="/signup" className="hover:text-text-platinum transition-colors">Sign Up</Link>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-text-platinum/80">Legal</h4>
            <div className="flex flex-col gap-2 text-sm text-text-platinum/50">
              <Link href="#" className="hover:text-text-platinum transition-colors">Terms of Service</Link>
              <Link href="#" className="hover:text-text-platinum transition-colors">Privacy Policy</Link>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 mt-12 pt-8 border-t border-dark-border/50 text-xs text-text-platinum/40 flex justify-between items-center">
          <span>&copy; {new Date().getFullYear()} Goosalytics. All rights reserved.</span>
          <span className="font-mono">v1.2.0-midnight</span>
        </div>
      </footer>
    </div>
  );
}
