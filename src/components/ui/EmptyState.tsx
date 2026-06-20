import React from 'react';
import { ErpIcon, type ErpIconName } from '@/lib/design/icons';
import { erpTypography } from '@/lib/design/tokens';

type EmptyStateProps = {
  icon?: ErpIconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon = 'package', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center">
      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
        <ErpIcon name={icon} className="w-7 h-7 sm:w-8 sm:h-8 text-slate-300" />
      </div>
      <h4 className={`${erpTypography.sectionTitle} text-sm sm:text-base normal-case tracking-normal`}>{title}</h4>
      {description && (
        <p className="text-xs sm:text-sm font-bold text-slate-400 mt-2 max-w-md">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
