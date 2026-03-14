export default function AdminStatusPill({
  connected,
  label,
}: {
  connected: boolean;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
        connected
          ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
          : "border-accent-red/30 bg-accent-red/10 text-accent-red"
      }`}
    >
      {label ?? (connected ? "Connected" : "Disconnected")}
    </span>
  );
}
