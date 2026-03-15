import { formatAmericanOdds, formatOddsLine } from "@/lib/book-odds";

type BookBadgeProps = {
  book: string;
  odds?: number | null;
  line?: number | null;
  highlight?: boolean;
  showLine?: boolean;
  showOdds?: boolean;
  className?: string;
};

type BookMeta = {
  label: string;
  border: string;
  background: string;
  text: string;
};

const DEFAULT_META: BookMeta = {
  label: "BOOK",
  border: "rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.55)",
  text: "#e5e7eb",
};

function resolveBookMeta(book: string): BookMeta {
  const normalized = book.toLowerCase();

  if (normalized.includes("draftkings")) {
    return {
      label: "DK",
      border: "rgba(249, 115, 22, 0.36)",
      background: "rgba(249, 115, 22, 0.12)",
      text: "#fdba74",
    };
  }

  if (normalized.includes("fanduel")) {
    return {
      label: "FD",
      border: "rgba(59, 130, 246, 0.34)",
      background: "rgba(59, 130, 246, 0.12)",
      text: "#93c5fd",
    };
  }

  if (normalized.includes("betmgm")) {
    return {
      label: "MGM",
      border: "rgba(234, 179, 8, 0.34)",
      background: "rgba(234, 179, 8, 0.12)",
      text: "#fde68a",
    };
  }

  if (normalized.includes("caesars")) {
    return {
      label: "CZR",
      border: "rgba(250, 204, 21, 0.3)",
      background: "rgba(250, 204, 21, 0.12)",
      text: "#fef08a",
    };
  }

  if (normalized.includes("pointsbet")) {
    return {
      label: "PB",
      border: "rgba(239, 68, 68, 0.34)",
      background: "rgba(239, 68, 68, 0.12)",
      text: "#fca5a5",
    };
  }

  return {
    ...DEFAULT_META,
    label: book.slice(0, 4).toUpperCase(),
  };
}

export default function BookBadge({
  book,
  odds,
  line,
  highlight = false,
  showLine = false,
  showOdds = true,
  className = "",
}: BookBadgeProps) {
  const meta = resolveBookMeta(book);
  const styles = highlight
    ? {
        borderColor: "rgba(16, 185, 129, 0.42)",
        background: "rgba(16, 185, 129, 0.14)",
        color: "#d1fae5",
      }
    : {
        borderColor: meta.border,
        background: meta.background,
        color: meta.text,
      };

  return (
    <span
      title={book}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}
      style={styles}
    >
      <span className="font-semibold">{meta.label}</span>
      {showLine && typeof line === "number" && Number.isFinite(line) && line !== 0 && (
        <span className="text-[10px] opacity-80">{formatOddsLine(line)}</span>
      )}
      {showOdds && typeof odds === "number" && Number.isFinite(odds) && (
        <span>{formatAmericanOdds(odds)}</span>
      )}
      {highlight && showOdds && <span className="text-emerald-200">✓</span>}
    </span>
  );
}
