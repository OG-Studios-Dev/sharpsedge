"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLeague } from "@/hooks/useLeague";

export default function GolfPage() {
  const router = useRouter();
  const [, setLeague] = useLeague();

  useEffect(() => {
    setLeague("PGA");
    router.replace("/");
  }, [router, setLeague]);

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Loading Golf...</p>
      </div>
    </div>
  );
}
