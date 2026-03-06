const variants = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  red: "bg-red-500/15 text-red-400 border-red-500/20",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  slate: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/20",
};

export default function Badge({
  children,
  variant = "slate",
  className = "",
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
