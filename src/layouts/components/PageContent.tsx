import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export default function PageContent({ children, className }: PageContentProps) {
  return <div className={cn("p-6", className)}>{children}</div>;
}
