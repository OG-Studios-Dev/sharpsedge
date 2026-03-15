"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { League } from "@/lib/types";

const LEAGUES: Array<{ key: League; icon: string; label: string }> = [
  { key: "All", icon: "🪿", label: "All" },
  { key: "NHL", icon: "🏒", label: "NHL" },
  { key: "NBA", icon: "🏀", label: "NBA" },
  { key: "MLB", icon: "⚾", label: "MLB" },
];

interface Props {
  active: League;
  onChange: (league: League) => void;
}

export default function LeagueSwitcher({ active, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const activeIndex = LEAGUES.findIndex(opt => opt.key === active);
    if (activeIndex === -1) return;
    
    // index + 1 because the first element is the absolute sliding background box
    const activeBtn = containerRef.current.children[activeIndex + 1] as HTMLElement;
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        opacity: 1
      });
    }
  }, [active]);

  return (
    <div className="flex justify-center w-full mb-6">
      <div 
        ref={containerRef}
        className="relative flex items-center bg-dark-card/50 border border-dark-border/80 rounded-full p-1 shadow-inner h-[44px]"
      >
        <div 
          className="absolute top-1 bottom-1 bg-accent-blue rounded-full transition-all duration-300 ease-in-out shadow-[0_0_15px_-3px_rgba(74,158,255,0.4)] z-0"
          style={indicatorStyle}
        />
        
        {LEAGUES.map(({ key, icon, label }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`relative z-10 flex items-center justify-center gap-1.5 h-full px-6 rounded-full font-sans text-sm font-bold transition-colors duration-300 ${
                isActive ? "text-dark-bg" : "text-text-platinum/60 hover:text-text-platinum"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
