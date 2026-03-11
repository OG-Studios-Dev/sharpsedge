import HomeContent from "@/components/HomeContent";

export default function HomePage() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">🪿MONEYTEAM🪿</h1>
      </header>
      <HomeContent today={today} />
    </div>
  );
}
