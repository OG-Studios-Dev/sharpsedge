import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  href?: string;
  actionLabel?: string;
};

export default function SectionHeader({ title, subtitle, href, actionLabel = "See All" }: Props) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="page-heading tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="tap-button shrink-0 text-xs font-semibold text-accent-blue hover:text-blue-300 transition-colors"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
