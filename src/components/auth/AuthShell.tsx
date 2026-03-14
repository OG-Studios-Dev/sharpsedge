import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export default function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-dark-bg px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(74,158,255,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.14),transparent_28%),linear-gradient(180deg,#0a0a0f_0%,#10131a_100%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full overflow-hidden rounded-[30px] border border-dark-border bg-[linear-gradient(180deg,rgba(26,26,34,0.96)_0%,rgba(13,17,24,0.98)_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="mb-8">
            <div className="inline-flex rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-blue">
              Goosalytics
            </div>
            <p className="mt-4 text-sm font-medium text-accent-green">Pickin&apos; Sports Smarter</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-gray-400">{description}</p>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
