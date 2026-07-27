import { cn } from "@/client/lib/utils";

type BadgeVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "info"
  | "error";

const VARIANT_COLORS: Record<BadgeVariant, string> = {
  primary: "bg-badge-primary text-text-primary",
  secondary: "bg-badge-secondary text-text-primary",
  success: "bg-badge-success text-text-primary",
  warning: "bg-badge-warning text-text-primary",
  info: "bg-badge-info text-text-primary",
  error: "bg-badge-error text-text-primary",
};

export function Badge({
  children,
  variant = "secondary",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 font-medium text-xs",
        VARIANT_COLORS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
