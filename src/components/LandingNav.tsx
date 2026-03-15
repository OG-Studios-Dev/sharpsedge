"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 w-full animate-slide-down">
      <nav
        className={`flex items-center justify-between px-6 py-3 rounded-full transition-all duration-300 w-full max-w-4xl border ${
          isScrolled
            ? "bg-dark-card/70 backdrop-blur-xl border-dark-border/50 shadow-lg"
            : "bg-transparent border-transparent"
        }`}
      >
        <Link href="/" className="flex items-center">
          <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-lg object-cover" />
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8 font-sans text-sm font-medium text-text-platinum/80">
          <a href="#features" className="hover:text-text-platinum transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-text-platinum transition-colors">
            How It Works
          </a>
          <a href="#pricing" className="hover:text-text-platinum transition-colors">
            Pricing
          </a>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="hidden sm:block text-sm font-semibold text-text-platinum/90 hover:text-text-platinum transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="relative overflow-hidden group bg-accent-blue text-dark-bg px-5 py-2 rounded-full font-bold text-sm transition-transform hover:scale-105"
            style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
          >
            <span className="relative z-10 flex items-center gap-1">
              Sign Up Free <ChevronRight size={16} />
            </span>
            <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
