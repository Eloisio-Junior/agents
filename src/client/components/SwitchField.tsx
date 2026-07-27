import { useId } from "react";
import { cn } from "@/client/lib/utils";
import { Switch } from "./Switch";

interface SwitchFieldProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

// Switch + clickable label as one inline unit. The <label htmlFor> association
// makes clicking the text toggle the switch (a <button> is a labelable element),
// and the container is inline-flex so the clickable area is exactly the content
// width — it never stretches into empty space to the right.
export function SwitchField({
  checked,
  onCheckedChange,
  label,
  disabled,
  id,
  className,
}: SwitchFieldProps) {
  const reactId = useId();
  const switchId = id ?? reactId;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 text-sm text-text-secondary",
        className,
      )}
    >
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <label
        htmlFor={switchId}
        data-clickable={disabled ? undefined : "true"}
        className={cn("select-none", disabled && "opacity-50")}
      >
        {label}
      </label>
    </div>
  );
}
