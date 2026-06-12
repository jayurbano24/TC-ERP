"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="fixed bottom-6 right-6 z-50 p-4 bg-white dark:bg-[#111827] border-2 border-[#e2e8f0] dark:border-[#1f2937] rounded-2xl shadow-2xl hover:scale-110 active:scale-95 transition-all group overflow-hidden"
      aria-label="Cambiar tema"
    >
      <div className="relative w-6 h-6">
        <Sun 
          className={`absolute inset-0 text-amber-500 transition-all duration-500 ${theme === 'dark' ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} 
          size={24} 
        />
        <Moon 
          className={`absolute inset-0 text-[#2ec4f1] transition-all duration-500 ${theme === 'light' ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} 
          size={24} 
        />
      </div>
      
      {/* Subtle Glow Effect */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-tr ${theme === 'light' ? 'from-amber-400 to-transparent' : 'from-[#2ec4f1] to-transparent'}`} />
    </button>
  );
}
