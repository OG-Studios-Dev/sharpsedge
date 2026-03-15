"use client";

type FilterOption = {
  label: string;
  value: string;
};

type Props = {
  filters: { label: string; options: FilterOption[]; value: string; onChange: (v: string) => void }[];
};

export default function FilterBar({ filters }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {filters.map((filter) => (
        <div key={filter.label} className="relative shrink-0">
          <select
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="tap-button appearance-none rounded-full border border-dark-border bg-dark-surface px-3 py-1.5 pr-7 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:border-accent-blue/50"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      ))}
    </div>
  );
}
