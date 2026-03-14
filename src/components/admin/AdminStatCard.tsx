const toneClasses = {
  blue: "border-accent-blue/20 bg-accent-blue/10 text-accent-blue",
  green: "border-accent-green/20 bg-accent-green/10 text-accent-green",
  yellow: "border-accent-yellow/20 bg-accent-yellow/10 text-accent-yellow",
  red: "border-accent-red/20 bg-accent-red/10 text-accent-red",
} as const;

export default function AdminStatCard({
  label,
  value,
  meta,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  meta?: string;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <div className={`rounded-3xl border p-4 shadow-[0_12px_36px_rgba(0,0,0,0.18)] ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-300">{label}</p>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      {meta ? <p className="mt-2 text-sm text-gray-300">{meta}</p> : null}
    </div>
  );
}
