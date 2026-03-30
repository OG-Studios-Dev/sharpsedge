import { GoosePageLoader } from "@/components/GooseLoader";

/**
 * Root-level Next.js loading.tsx
 * Shown as the Suspense boundary fallback during initial route loads
 * and server-side data fetching for all routes.
 */
export default function RootLoading() {
  return <GoosePageLoader />;
}
