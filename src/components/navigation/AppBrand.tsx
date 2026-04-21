"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface AppBrandProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

export function AppBrand({
  className,
  iconClassName,
  textClassName,
  titleClassName,
  subtitleClassName,
}: AppBrandProps) {
  return (
    <a
      href="/"
      className={cn("flex items-center gap-3", className)}
      aria-label="Glacier Finance Tracker"
    >
      <Image
        src="/glacier-icon.svg"
        alt=""
        width={32}
        height={32}
        className={cn("h-8 w-8 rounded-xl", iconClassName)}
      />
      <span className={cn("min-w-0", textClassName)}>
        <span
          className={cn(
            "block truncate text-xl font-bold leading-none text-primary",
            titleClassName,
          )}
        >
          Glacier
        </span>
        <span
          className={cn(
            "mt-1 block truncate text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-neutral-500",
            subtitleClassName,
          )}
        >
          Finance Tracker
        </span>
      </span>
    </a>
  );
}
