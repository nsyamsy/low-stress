import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helpText?: string;
  error?: string;
}

/**
 * Kolom isian Design_System §7.2: label di atas, bantuan dan error di bawah.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helpText,
    error,
    id,
    className,
    type = "text",
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [helpText ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="ls-field">
      <label className="ls-field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="ls-field__control">
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type={type}
          className={cn("ls-input", error && "ls-input--invalid", className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>
      {helpText ? (
        <p className="ls-field__help" id={helpId}>
          {helpText}
        </p>
      ) : null}
      {error ? (
        <p className="ls-field__error" id={errorId}>
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
});
