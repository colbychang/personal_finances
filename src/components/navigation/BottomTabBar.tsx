"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { mobileTabLinks, moreMenuLinks, moreTab } from "./nav-links";

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

export function BottomTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLLIElement>(null);

  // Determine if current path is in the "More" section
  const isMoreActive = moreMenuLinks.some((link) =>
    link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)
  );

  const closeMoreMenu = useCallback(() => {
    setMoreOpen(false);
  }, []);

  // Close the more menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [moreOpen]);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-neutral-200 z-50"
      aria-label="Mobile navigation"
    >
      <ul className="flex items-stretch justify-around">
        {mobileTabLinks.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          const Icon = link.icon;

          return (
            <li key={link.href} className="flex-1">
              <a
                href={link.href}
                onClick={(event) => {
                  closeMoreMenu();
                  navigateToHref(event, link.href);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-xs font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-neutral-500 hover:text-neutral-700"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                <span>{link.label}</span>
              </a>
            </li>
          );
        })}

        {/* More tab */}
        <li className="flex-1 relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-xs font-medium transition-colors w-full",
              isMoreActive || moreOpen
                ? "text-primary"
                : "text-neutral-500 hover:text-neutral-700"
            )}
            aria-expanded={moreOpen}
            aria-haspopup="true"
          >
            <moreTab.icon className="h-5 w-5" />
            <span>{moreTab.label}</span>
          </button>

          {/* More menu popup */}
          {moreOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50">
              <ul>
                {moreMenuLinks.map((link) => {
                  const isLinkActive =
                    link.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(link.href);
                  const Icon = link.icon;

                    return (
                      <li key={link.href}>
                        <a
                          href={link.href}
                          onClick={(event) => {
                            closeMoreMenu();
                            navigateToHref(event, link.href);
                          }}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                            isLinkActive
                              ? "bg-primary/10 text-primary"
                              : "text-neutral-600 hover:bg-neutral-50"
                          )}
                          aria-current={isLinkActive ? "page" : undefined}
                        >
                          <Icon className="h-5 w-5 flex-shrink-0" />
                          <span>{link.label}</span>
                        </a>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </li>
      </ul>
    </nav>
  );
}
