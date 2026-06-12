import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner = ({ size = 'md', className = '' }: SpinnerProps) => {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div className={`relative ${className}`}>
      <div
        className={`
          ${sizes[size]}
          rounded-full 
          border-slate-200 
          border-t-[#2ec4f1] 
          animate-spin
        `}
      />
    </div>
  );
};
