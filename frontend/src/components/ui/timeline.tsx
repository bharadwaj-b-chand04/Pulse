"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface TimelineEntry {
  title: string;
  content: ReactNode;
}

type TimelineProps = {
  data: TimelineEntry[];
  className?: string;
};

/**
 * Scroll-linked clinical timeline. The rail communicates chronology while
 * the existing entry cards preserve the EHR's click targets and semantics.
 */
export function Timeline({ data, className }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const [height, setHeight] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const updateHeight = () => setHeight(element.getBoundingClientRect().height);
    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 15%", "end 55%"],
  });
  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.08], [0, 1]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <ol ref={contentRef} className="relative space-y-0">
        {data.map((item, index) => (
          <li
            key={`${item.title}-${index}`}
            className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-4 pb-10 last:pb-0 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-8"
          >
            <div className="relative z-10 flex items-start justify-center pt-1 md:justify-end">
              <span
                aria-hidden="true"
                className="size-3 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20"
              />
              <h3 className="absolute right-8 top-0 hidden max-w-32 text-right text-sm font-semibold tabular-nums text-muted-foreground md:block">
                {item.title}
              </h3>
            </div>

            <div className="min-w-0">
              <h3 className="mb-3 text-sm font-semibold tabular-nums text-muted-foreground md:hidden">
                {item.title}
              </h3>
              {item.content}
            </div>
          </li>
        ))}
      </ol>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-0 w-px bg-border md:left-[8.625rem]"
        style={{ height }}
      >
        <motion.div
          className="absolute inset-x-0 top-0 w-px rounded-full bg-gradient-to-b from-primary via-primary/70 to-transparent"
          style={{
            height: prefersReducedMotion ? height : heightTransform,
            opacity: prefersReducedMotion ? 1 : opacityTransform,
          }}
        />
      </div>
    </div>
  );
}
