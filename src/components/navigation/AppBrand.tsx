"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface AppBrandProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

function navigateToHref(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  window.location.assign(href);
}

export function AppBrand({
  className,
  iconClassName,
  textClassName,
}: AppBrandProps) {
  return (
    <a
      href="/"
      onClick={(event) => navigateToHref(event, "/")}
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
    </a>
  );
}
