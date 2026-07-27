import { forwardRef, useId } from "react";
import { cn } from "@/client/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
  errorMessage?: string;
  helperText?: string;
};

// Styled multiline input, matching <Input>'s look (border-border, bg-bg-tertiary,
// focus ring). Use inside a <FormField> for the label; the error/helper text here
// covers control-local validation feedback.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, errorMessage, helperText, rows = 5, ...props }, ref) => {
    const hasError = error || !!errorMessage;
    const descriptionId = useId();
    const hasDescription = !!errorMessage || !!helperText;
    return (
      <div className="w-full">
        <textarea
          ref={ref}
          rows={rows}
          aria-invalid={hasError || undefined}
          aria-describedby={hasDescription ? descriptionId : undefined}
          className={cn(
            // overflow-x-hidden: the textarea always wraps (pre-wrap + break-word), so it never needs a
            // horizontal scrollbar — pinning it off kills the spurious x-scrollbar track/flash.
            "w-full resize-y overflow-x-hidden rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder-text-placeholder focus:border-border-focus focus:outline-none disabled:opacity-60",
            { "border-error": hasError },
            className,
          )}
          {...props}
        />
        {errorMessage && (
          <span id={descriptionId} className="mt-1 block text-error text-xs">
            {errorMessage}
          </span>
        )}
        {helperText && !errorMessage && (
          <span
            id={descriptionId}
            className="mt-1 block text-text-muted text-xs"
          >
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
