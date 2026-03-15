"use client";

import { Calendar, Layers, Users, Settings, LogOut, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function MobileMoreSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  const onAnimationEnd = () => {
    if (!isOpen) setShouldRender(false);
  };

  if (!shouldRender) return null;

  return (
    <>
      <div 
        className={`fixed inset-0 bg-dark-bg/80 backdrop-blur-sm z-50 transition-opacity duration-300 lg:hidden ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div 
        className={`fixed bottom-0 left-0 right-0 bg-dark-card border-t border-dark-border z-50 rounded-t-3xl pt-2 pb-8 px-4 transition-transform duration-300 ease-in-out lg:hidden ${isOpen ? "translate-y-0" : "translate-y-full"}`}
        onTransitionEnd={onAnimationEnd}
      >
        <div className="w-12 h-1.5 bg-dark-border rounded-full mx-auto mb-6"></div>
        
        <div className="flex justify-between items-center mb-6 px-2">
          <h3 className="font-heading font-bold text-lg">More</h3>
          <button onClick={onClose} className="p-2 bg-dark-surface rounded-full text-text-platinum/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-2">
          {[
            { href: "/schedule", label: "Schedule", icon: Calendar },
            { href: "/parlays", label: "Parlays", icon: Layers },
            { href: "/teams", label: "Teams", icon: Users },
            { href: "/settings", label: "Settings", icon: Settings },
          ].map((item) => (
            <Link 
              key={item.href} 
              href={item.href} 
              onClick={onClose}
              className="flex items-center gap-4 p-4 rounded-2xl hover:bg-dark-surface transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-dark-bg flex items-center justify-center text-accent-blue shrink-0 border border-dark-border/50">
                <item.icon size={20} />
              </div>
              <span className="font-sans font-medium text-base">{item.label}</span>
            </Link>
          ))}

          <button className="flex items-center gap-4 p-4 rounded-2xl hover:bg-accent-red/10 group transition-colors w-full text-left mt-4 border-t border-dark-border/50">
            <div className="w-10 h-10 rounded-full bg-dark-bg flex items-center justify-center text-accent-red shrink-0 border border-dark-border/50 group-hover:bg-accent-red/20 transition-colors">
              <LogOut size={20} />
            </div>
            <span className="font-sans font-medium text-base text-accent-red">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
}
