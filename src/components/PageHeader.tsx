"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { useAppChrome } from "@/components/AppChromeProvider";

type PageHeaderProps = {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
};

export default function PageHeader({
  title,
  subtitle,
  right,
  children,
}: PageHeaderProps) {
  const { openMenu } = useAppChrome();

  return (
    <header className="sticky top-0 z-40 safe-top border-b border-dark-border bg-dark-bg/95 backdrop-blur-sm">
      <div className="px-4 py-3 lg:px-0">
        <div className="flex items-center justify-between gap-2">
          {/* Left: hamburger menu */}
          <button
            type="button"
            onClick={openMenu}
            className="tap-button shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dark-border bg-dark-surface text-white lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>

          {/* Center: logo */}
          <Link
            href="/"
            className="tap-button inline-flex items-center rounded-xl border border-dark-border bg-dark-surface/80 p-1"
            aria-label="Go to home"
          >
            <img src="/logo.jpg" alt="Goosalytics" className="h-8 w-auto rounded-lg" />
          </Link>

          {/* Desktop title */}
          {title && (
            <div className="min-w-0 hidden lg:block flex-1">
              <h1 className="page-heading truncate">{title}</h1>
              {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
            </div>
          )}

          {/* Right: league dropdown or custom content */}
          <div className="shrink-0">
            {right || <div className="w-10" />}
          </div>
        </div>

        {title && (
          <div className="mt-2 lg:hidden">
            <h1 className="truncate text-base font-bold text-white">{title}</h1>
            {subtitle && <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{subtitle}</p>}
          </div>
        )}

        {children && (
          <div className="pt-3">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
