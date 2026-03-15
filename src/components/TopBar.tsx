"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";

export default function TopBar() {
  const [league, setLeague] = useState<"NHL" | "NBA">("NHL");

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 h-[72px] bg-dark-bg/80 backdrop-blur-lg z-40 px-4 flex items-center justify-between border-b border-dark-border/50">
      <div className="flex items-center shrink-0">
        <Link href="/dashboard" className="block mt-1">
          <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-lg object-cover" />
        </Link>
      </div>

      <div className="flex-1 flex justify-center">
        <div className="bg-dark-card border border-dark-border/80 p-1 rounded-full flex gap-1 relative overflow-hidden">
          <button
            onClick={() => setLeague("NHL")}
            className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${league === "NHL" ? "text-white" : "text-text-platinum/50 hover:text-text-platinum"}`}
          >
            NHL
          </button>
          <button
            onClick={() => setLeague("NBA")}
            className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${league === "NBA" ? "text-white" : "text-text-platinum/50 hover:text-text-platinum"}`}
          >
            NBA
          </button>
          <div 
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-accent-blue rounded-full transition-transform duration-300 ease-in-out z-0"
            style={{ transform: `translateX(${league === "NHL" ? "4px" : "calc(100% + 4px)"})` }}
          />
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <Link href="/settings" className="w-9 h-9 rounded-full bg-dark-card border border-dark-border flex items-center justify-center font-mono text-xs font-bold text-text-platinum hover:border-accent-blue/50 transition-colors">
          U
        </Link>
      </div>
    </div>
  );
}
