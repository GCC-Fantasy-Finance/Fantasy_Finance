import { Link, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface SubNavItem {
  name: string;
  path: string;
  variant?: "default" | "cta";
}

interface SubNavProps {
  items: SubNavItem[];
  rightContent?: ReactNode;
}

export default function SubNav({ items, rightContent }: SubNavProps) {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-30 isolate min-h-12 w-full shrink-0 border-b border-gray-300 bg-white px-6 py-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-x-8 gap-y-2">
          {items.map((item) => (
            <li key={item.path} className={item.variant === "cta" ? "flex-shrink-0" : ""}>
              {item.variant === "cta" ? (
                <Button asChild size="sm" className={` ml-2 `}>
                  <Link
                    to={item.path}
                    aria-current={isActive(item.path) ? "page" : undefined}
                  >
                    <span className="pointer-events-none">{item.name}</span>
                  </Link>
                </Button>
              ) : (
                <Link
                  to={item.path}
                  aria-current={isActive(item.path) ? "page" : undefined}
                  className={`group relative block py-2 transition-colors ${
                    isActive(item.path) ? "font-medium text-green-700" : ""
                  }`}
                >
                  <span className="pointer-events-none">{item.name}</span>
                  <span
                    className={`absolute -left-0.5 -right-0.5 h-[3px] ${
                      isActive(item.path)
                        ? "bg-green-700"
                        : "bg-transparent group-hover:bg-gray-300"
                    } -bottom-1`}
                  />
                </Link>
              )}
            </li>
          ))}
        </ul>
        {rightContent && (
          <div className="flex shrink-0 items-center">{rightContent}</div>
        )}
      </div>
    </nav>
  );
}
