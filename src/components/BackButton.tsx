import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({ onClick, label = 'Back' }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900"
  >
    <ArrowLeft className="h-4 w-4" />
    <span>{label}</span>
  </button>
);
