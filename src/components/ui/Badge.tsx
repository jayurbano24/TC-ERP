import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate';
}

export const Badge = ({ className = '', variant = 'default', children, ...props }: BadgeProps) => {
  const baseStyles =
    'inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black tracking-widest uppercase';

  /** Tokens del tema (claro/oscuro) — evita badges blancos en dark mode. */
  const variants = {
    default: 'border border-border bg-surface-hover text-muted',
    outline: 'border border-border bg-transparent text-muted',
    blue: 'border border-accent/30 bg-accent/15 text-accent',
    green: 'border border-success/30 bg-success/15 text-success',
    red: 'border border-danger/30 bg-danger/15 text-danger',
    yellow: 'border border-warning/30 bg-warning/15 text-warning',
    purple: 'border border-primary/20 bg-primary/10 text-heading',
    slate: 'border border-border bg-primary text-primary-foreground',
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
};
