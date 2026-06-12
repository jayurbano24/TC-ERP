"use client";

import React from 'react';
import { Badge, Button } from '@/components/ui';
import { ChevronLeft, Search, Plus, Filter, Download } from 'lucide-react';
import Link from 'next/link';

interface ModulePageProps {
  title: string;
  subtitle?: string;
  category: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  backHref?: string;
}

export const ModulePage = ({ 
  title, 
  subtitle, 
  category, 
  actions, 
  children, 
  backHref 
}: ModulePageProps) => {
  return (
    <div className="flex flex-col gap-10 py-6 animate-rise-in">
      {/* Breadcrumbs & Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {backHref && (
              <Link 
                href={backHref}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-900"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
            )}
            <Badge variant="purple">{category}</Badge>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-[var(--foreground)]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-slate-500 font-medium max-w-2xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {actions}
        </div>
      </header>

      {/* Content Area */}
      <main className="w-full">
        {children}
      </main>
    </div>
  );
};

// Sub-component for standard toolbars
export const ModuleToolbar = ({ 
  onSearch, 
  onAdd, 
  addLabel = "New Entry",
  filters,
  onFilter,
  onExport
}: { 
  onSearch?: (val: string) => void; 
  onAdd?: () => void;
  addLabel?: string;
  filters?: React.ReactNode;
  onFilter?: () => void;
  onExport?: () => void;
}) => {
  return (
    <div className="flex flex-col md:flex-row items-center gap-4 mb-8 bg-[var(--surface)]/50 p-2 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm">
      <div className="relative flex-1 group w-full">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] group-focus-within:text-[var(--accent)] transition-colors" />
        <input 
          type="text" 
          placeholder="Search records..." 
          onChange={(e) => onSearch?.(e.target.value)}
          className="w-full h-12 pl-12 pr-4 bg-transparent rounded-xl text-sm font-medium outline-none border border-transparent focus:border-[var(--border)] focus:bg-[var(--surface)] transition-all"
        />
      </div>
      
      <div className="flex items-center gap-2 w-full md:w-auto">
        {filters}
        <Button variant="outline" size="md" leftIcon={<Filter className="w-4 h-4" />} onClick={onFilter}>
          Filters
        </Button>
        <Button variant="outline" size="md" leftIcon={<Download className="w-4 h-4" />} onClick={onExport}>
          Export
        </Button>
        {onAdd && (
          <Button 
            variant="primary" 
            size="md" 
            onClick={onAdd}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {addLabel}
          </Button>
        )}
      </div>
    </div>
  );
};
