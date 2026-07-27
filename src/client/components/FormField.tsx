import { type ReactNode, useId } from "react";
import { cn } from "@/client/lib/utils";

interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  // Use for a field whose children are NOT a single focusable control (a list with an "Add" button,
  // several inputs, a picker). See the component note.
  group?: boolean;
}

// Label + control + (description | error) stack. By default wraps the control in a <label>, so clicking
// the label focuses the native control inside (Input/Select/Textarea forward to a real element).
//
// Pass `group` when the children are NOT a single focusable control. A <label> forwards a click on its
// text to the first focusable descendant; for a list with an "Add" button that descendant IS the "Add"
// button, so clicking the field title would add a row. `group` instead renders a <div role="group">
// with the title as a plain <span> linked via aria-labelledby: screen readers still announce the group,
// but a click on the title does nothing.
export function FormField({
  label,
  children,
  description,
  hint,
  error,
  required,
  className,
  group,
}: FormFieldProps) {
  const subtext = description ?? hint;
  const labelId = useId();
  const body = (
    <>
      <span
        id={group ? labelId : undefined}
        className="font-medium text-sm text-text-secondary"
      >
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </span>
      {children}
      {error ? (
        <span className="text-error text-xs">{error}</span>
      ) : subtext ? (
        <span className="text-text-muted text-xs">{subtext}</span>
      ) : null}
    </>
  );
  if (group) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: a <fieldset>/<legend> brings UA border + legend-layout baggage unfit for this lightweight stacked field; role="group" + aria-labelledby gives the same grouping semantics.
      <div
        role="group"
        aria-labelledby={labelId}
        className={cn("flex flex-col gap-1.5", className)}
      >
        {body}
      </div>
    );
  }
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is rendered as children (a real input/select/textarea); the rule cannot see through composition.
    <label className={cn("flex flex-col gap-1.5", className)}>{body}</label>
  );
}
