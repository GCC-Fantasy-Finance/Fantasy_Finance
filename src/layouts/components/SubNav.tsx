import { Link, useLocation } from "react-router-dom";
import { type ReactNode } from "react";

interface SubNavItem {
  name: string;
  path: string;
}

interface SubNavProps {
  items: SubNavItem[];
  rightContent?: ReactNode;
}

export default function SubNav({ items, rightContent }: SubNavProps) {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-30 isolate h-12 w-screen border-b border-gray-300 bg-white flex items-center justify-between px-6 md:w-[calc(100dvw-15rem)]">
      <ul className="flex gap-8">
        {items.map((item) => (
          <li key={item.path}>
            <Link
              to={item.path}
              aria-current={isActive(item.path) ? "page" : undefined}
              className={`relative block py-3 transition-colors group ${
                isActive(item.path) ? "font-medium text-green-700" : ""
              }`}
            >
              <span className="pointer-events-none">{item.name}</span>
              <span
                className={`absolute -left-0.5 -right-0.5 h-[2.5px] ${
                  isActive(item.path)
                    ? "bg-green-700"
                    : "bg-transparent group-hover:bg-gray-300"
                } bottom-0`}
              />
            </Link>
          </li>
        ))}
      </ul>
      {rightContent && <div className="flex items-center">{rightContent}</div>}
    </nav>
  );
}
