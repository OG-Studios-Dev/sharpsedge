export default function TeamLogo({ team, color, size = 36 }: { team: string; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.35,
      }}
    >
      {team.slice(0, 3)}
    </div>
  );
}
