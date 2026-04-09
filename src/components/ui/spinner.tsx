import * as React from "react";

import { cn } from "@/lib/utils";

type SpinnerProps = React.ComponentProps<"div">;

export default function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    >
      <span className="h-8 w-8 animate-spin rounded-full border-3 border-solid border-gray-400/90 border-r-transparent" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
