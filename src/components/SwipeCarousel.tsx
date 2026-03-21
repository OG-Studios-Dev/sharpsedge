"use client";

import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";

interface SwipeCarouselProps {
  children: ReactNode[];
  /** Show dot indicators below the carousel */
  dots?: boolean;
  /** Gap between items in px */
  gap?: number;
  /** CSS class for the outer wrapper */
  className?: string;
}

/**
 * Mobile-first horizontal swipe carousel with CSS snap scrolling.
 * Each child becomes a full-width slide on mobile, ~85% width on larger screens.
 */
export default function SwipeCarousel({
  children,
  dots = true,
  gap = 12,
  className = "",
}: SwipeCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const count = children.length;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || count === 0) return;
    const scrollLeft = el.scrollLeft;
    const itemWidth = el.scrollWidth / count;
    const index = Math.round(scrollLeft / itemWidth);
    setActiveIndex(Math.min(index, count - 1));
  }, [count]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollTo = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const itemWidth = el.scrollWidth / count;
    el.scrollTo({ left: itemWidth * index, behavior: "smooth" });
  };

  if (count === 0) return null;

  return (
    <div className={className}>
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory overflow-x-auto scrollbar-hide"
        style={{ gap: `${gap}px` }}
      >
        {children.map((child, index) => (
          <div
            key={index}
            className="w-[85%] min-w-[85%] snap-start sm:w-[80%] sm:min-w-[80%] lg:w-[48%] lg:min-w-[48%]"
          >
            {child}
          </div>
        ))}
      </div>

      {dots && count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === activeIndex
                  ? "w-4 bg-emerald-400"
                  : "w-1.5 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
