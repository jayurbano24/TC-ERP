import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className = '',
      glass,
      hoverable,
      padding = 'md',
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const paddings = {
      none: 'p-0',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
      xl: 'p-12',
    };

    return (
      <div
        ref={ref}
        className={`
          rounded-3xl border border-border shadow-[var(--card-shadow)]
          ${glass ? 'backdrop-blur-xl' : ''}
          ${hoverable ? 'transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl' : ''}
          ${paddings[padding]}
          ${className}
        `}
        style={{
          backgroundColor: glass
            ? 'color-mix(in srgb, var(--surface) 80%, transparent)'
            : 'var(--surface)',
          color: 'var(--foreground)',
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';
