"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

type LogoutButtonProps = {
  className?: string;
};

export default function LogoutButton({ className }: LogoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    setIsLoading(true);
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? "Logging out..." : "Log Out"}
    </button>
  );
}
