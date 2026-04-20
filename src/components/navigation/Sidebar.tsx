"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { sidebarLinks } from "./nav-links";
import { AppBrand } from "./AppBrand";

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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-neutral-200">
      {/* Logo / App Name */}
      <div className="flex items-center h-16 px-6 border-b border-neutral-200">
        <AppBrand />
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Sidebar navigation">
        <ul className="space-y-1">
          {sidebarLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            const Icon = link.icon;

            return (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={(event) => navigateToHref(event, link.href)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span>{link.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
