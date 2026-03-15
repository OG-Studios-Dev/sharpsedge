"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

type Props = {
  eyebrow?: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
};

export default function EmptyStateCard({ eyebrow, title, body, ctaLabel, ctaHref, className = "" }: Props) {
  return (
    <div className={`mx-3 my-3 rounded-[24px] border border-dark-border/80 bg-gradient-to-b from-dark-surface/50 to-dark-bg p-8 shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] flex flex-col items-center text-center relative overflow-hidden group ${className}`.trim()}>
      {/* Noise Overlay */}
      <div className="absolute inset-0 opacity-10 mix-blend-overlay pointer-events-none" style={{ filter: "url(#noiseFilter)" }} />
      
      <div className="w-16 h-16 rounded-full bg-dark-surface border border-dark-border/80 flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 group-hover:bg-accent-blue/10 group-hover:border-accent-blue/30 transition-all duration-500">
        <Sparkles className="w-8 h-8 text-text-platinum/30 group-hover:text-accent-blue transition-colors duration-500" />
      </div>

      {eyebrow && <div className="text-[10px] uppercase font-mono tracking-widest text-accent-blue font-bold mb-3 drop-shadow-[0_0_8px_rgba(74,158,255,0.4)]">{eyebrow}</div>}
      <h3 className="text-text-platinum text-xl font-heading font-black leading-tight tracking-tight mb-3">{title}</h3>
      <p className="text-sm text-text-platinum/50 font-sans leading-relaxed max-w-[24rem] mb-6">{body}</p>
      
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="inline-flex items-center justify-center rounded-xl bg-accent-blue px-6 py-2.5 text-xs font-bold font-sans text-dark-bg transition-all hover:bg-accent-blue/90 hover:shadow-[0_0_15px_rgba(74,158,255,0.4)] active:scale-95">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
