import HomeContent from "@/components/HomeContent";

export default function HomePage() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return <HomeContent today={today} />;
}
