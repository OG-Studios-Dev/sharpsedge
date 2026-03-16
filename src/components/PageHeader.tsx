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
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={openMenu}
              className="tap-button inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface text-lg text-white lg:hidden"
              aria-label="Open navigation menu"
            >
              ☰
            </button>

            <Link
              href="/"
              className="tap-button inline-flex items-center rounded-2xl border border-dark-border bg-dark-surface/80 p-1.5"
              aria-label="Go to home"
            >
              <img src="/logo.jpg" alt="Goosalytics" className="h-9 w-auto rounded-xl" />
            </Link>

            <div className="min-w-0 hidden lg:block">
              <h1 className="page-heading truncate">{title}</h1>
              {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
            </div>
          </div>

          {right && <div className="shrink-0">{right}</div>}
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
