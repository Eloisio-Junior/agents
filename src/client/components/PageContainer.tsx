import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/client/lib/utils";

type PageContainerSize = "narrow" | "wide" | "full";

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: PageContainerSize;
}

export function PageContainer({
  children,
  size = "wide",
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        {
          "max-w-3xl": size === "narrow",
          "max-w-7xl": size === "wide",
        },
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
