"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAppChrome } from "@/components/AppChromeProvider";

type PageHeaderProps = {
  title: string;
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
    <header className="sticky top-0 z-40 border-b border-dark-border bg-dark-bg/95 backdrop-blur-sm">
      <div className="px-4 py-3 lg:px-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openMenu}
            className="tap-button shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dark-border bg-dark-surface text-xl text-white lg:hidden"
            aria-label="Open navigation menu"
          >
            ☰
          </button>

          <Link
            href="/"
            className="tap-button shrink-0 inline-flex items-center rounded-xl border border-dark-border bg-dark-surface/80 p-1"
            aria-label="Go to home"
          >
            <img src="/logo.jpg" alt="Goosalytics" className="h-8 w-auto rounded-lg" />
          </Link>

          <div className="min-w-0 hidden lg:block">
            <h1 className="page-heading truncate">{title}</h1>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>

          {right && <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">{right}</div>}
        </div>

        {children && (
          <div className="pt-3">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
