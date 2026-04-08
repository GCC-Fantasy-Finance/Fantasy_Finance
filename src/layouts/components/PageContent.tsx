import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export default function PageContent({ children, className }: PageContentProps) {
  return (
    <div className={cn("w-full max-w-7xl p-6", className)}>{children}</div>
  );
}
