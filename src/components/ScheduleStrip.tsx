"use client";

import Link from "next/link";
import ScheduleBoard from "@/components/ScheduleBoard";

export default function ScheduleStrip() {
  return (
    <div className="space-y-3">
      <ScheduleBoard compact />
      <div className="px-1">
        <Link href="/schedule" className="inline-flex rounded-xl border border-dark-border px-4 py-2 text-sm font-semibold text-gray-200 bg-dark-surface hover:border-gray-600">
          Open full schedule
        </Link>
      </div>
    </div>
  );
}
