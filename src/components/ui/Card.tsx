export default function Card({
  children,
  className = "",
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`bg-[#1E293B]/80 backdrop-blur-sm border border-slate-700/50 rounded-xl ${
        hover ? "transition-all duration-200 hover:border-slate-600 hover:bg-[#1E293B]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
