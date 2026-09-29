"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode, SVGProps } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type PointerHighlightProps = {
  children: ReactNode;
  rectangleClassName?: string;
  pointerClassName?: string;
  containerClassName?: string;
};

/**
 * Draws a quiet, single-use highlight around a short piece of copy.
 *
 * The wrapper is a span so it can be used inside headings without creating
 * invalid heading markup. The outline is revealed with clip-path instead of
 * animating width/height, keeping the effect independent from layout.
 */
export function PointerHighlight({
  children,
  rectangleClassName,
  pointerClassName,
  containerClassName,
}: PointerHighlightProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateDimensions = () => {
      const { width, height } = element.getBoundingClientRect();
      setDimensions({ width, height });
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  const hasDimensions = dimensions.width > 0 && dimensions.height > 0;
  const motionDuration = prefersReducedMotion ? 0 : 0.8;

  return (
    <span
      ref={containerRef}
      className={cn("relative inline-block isolate", containerClassName)}
    >
      {children}
      {hasDimensions && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          initial={
            prefersReducedMotion
              ? { opacity: 1 }
              : { opacity: 0, scale: 0.98, transformOrigin: "top left" }
          }
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: motionDuration, ease: "easeOut" }}
        >
          <motion.span
            className={cn(
              "absolute inset-0 rounded-sm border border-primary/60",
              rectangleClassName,
            )}
            initial={
              prefersReducedMotion
                ? { clipPath: "inset(0 0 0 0)" }
                : { clipPath: "inset(0 100% 100% 0)" }
            }
            animate={{ clipPath: "inset(0 0 0 0)" }}
            transition={{ duration: motionDuration, ease: "easeInOut" }}
          />
          {!prefersReducedMotion && (
            <motion.span
              className="pointer-events-none absolute left-0 top-0"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                x: dimensions.width + 4,
                y: dimensions.height + 4,
              }}
              transition={{
                opacity: { duration: 0.1 },
                duration: motionDuration,
                ease: "easeInOut",
              }}
            >
              <Pointer className={cn("size-4 text-primary", pointerClassName)} />
            </motion.span>
          )}
        </motion.span>
      )}
    </span>
  );
}

function Pointer({ ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103Z" />
    </svg>
  );
}
