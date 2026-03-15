"use client";

import { useState, useRef, useEffect } from "react";

type FilterOption = {
  label: string;
  value: string;
};

type Props = {
  filters: { label: string; options: FilterOption[]; value: string; onChange: (v: string) => void }[];
};

function PillGroup({ filter }: { filter: Props["filters"][0] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });

  // Update background pill position
  useEffect(() => {
    if (!containerRef.current) return;
    const activeIndex = filter.options.findIndex(opt => opt.value === filter.value);
    if (activeIndex === -1) return;
    
    const activeBtn = containerRef.current.children[activeIndex + 1] as HTMLElement; // +1 to skip the background indicator div
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        opacity: 1
      });
    }
  }, [filter.value, filter.options]);

  return (
    <div className="flex flex-col gap-2 shrink-0 w-full mb-4 last:mb-0">
      <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 px-1">{filter.label}</div>
      <div 
        ref={containerRef}
        className="relative flex gap-1 overflow-x-auto pb-2 scrollbar-hide snap-x p-1 bg-dark-bg/50 border border-dark-border/50 rounded-2xl w-max max-w-full"
      >
        {/* Sliding active background */}
        <div 
          className="absolute top-1 bottom-3 bg-accent-blue rounded-xl transition-all duration-300 ease-in-out shadow-[0_0_15px_-3px_rgba(74,158,255,0.4)] z-0"
          style={indicatorStyle}
        />
        
        {filter.options.map((opt) => {
          const isActive = filter.value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => filter.onChange(opt.value)}
              className={`relative z-10 snap-start shrink-0 px-4 py-2 font-sans text-sm font-semibold rounded-xl transition-colors duration-300 ${isActive ? "text-dark-bg" : "text-text-platinum/60 hover:text-text-platinum"}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FilterBar({ filters }: Props) {
  return (
    <div className="w-full">
      {filters.map((filter) => (
        <PillGroup key={filter.label} filter={filter} />
      ))}
    </div>
  );
}
