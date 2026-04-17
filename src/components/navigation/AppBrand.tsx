"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AppBrandProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

export function AppBrand({
  className,
  iconClassName,
  textClassName,
}: AppBrandProps) {
  return (
    <Link
      href="/"
      prefetch={false}
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
      <span
        className={cn(
          "text-lg font-bold text-primary leading-none truncate",
          textClassName
        )}
      >
        Glacier Finance Tracker
      </span>
    </Link>
  );
}
