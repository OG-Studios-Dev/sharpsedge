import type { ReactNode } from "react";

export default function AdminSectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#161b26_0%,#0d1118_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)]">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-gray-400">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
