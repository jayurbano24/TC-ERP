import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate';
}

export const Badge = ({ className = '', variant = 'default', children, ...props }: BadgeProps) => {
  const baseStyles = 'inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest';
  
  const variants = {
    default: 'bg-slate-100 text-slate-600',
    outline: 'border border-slate-200 text-slate-500',
    blue: 'bg-blue-50 text-blue-600 border border-blue-100',
    green: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    red: 'bg-rose-50 text-rose-600 border border-rose-100',
    yellow: 'bg-amber-50 text-amber-600 border border-amber-100',
    purple: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
    slate: 'bg-slate-900 text-white',
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
};
