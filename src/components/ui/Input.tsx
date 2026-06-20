import React from 'react';
import { erpInputClass, erpTypography } from '@/lib/design/tokens';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-2 w-full">
        {label && (
          <label htmlFor={inputId} className={erpTypography.label}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${erpInputClass} ${error ? 'border-rose-400 bg-rose-50 focus:border-rose-500' : ''} ${className}`}
          {...props}
        />
        {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
        {!error && hint && <p className="text-[11px] font-bold text-slate-400">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
