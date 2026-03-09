type Props = {
  eyebrow?: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export default function EmptyStateCard({ eyebrow, title, body, ctaLabel, ctaHref }: Props) {
  return (
    <div className="mx-4 mt-4 rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
      {eyebrow && <div className="text-[11px] uppercase tracking-[0.2em] text-accent-blue/80 mb-2">{eyebrow}</div>}
      <h3 className="text-white text-lg font-semibold leading-tight">{title}</h3>
      <p className="text-sm text-gray-400 mt-2 leading-relaxed max-w-[34rem]">{body}</p>
      {ctaLabel && ctaHref && (
        <a href={ctaHref} className="inline-flex mt-4 rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white">
          {ctaLabel}
        </a>
      )}
    </div>
  );
}
