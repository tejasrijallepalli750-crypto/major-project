import React from 'react';
import { ShoppingBag, Sparkles } from 'lucide-react';
import { Product } from '../types';
import { formatCategoryLabel } from '../utils/productPresentation';

export interface CategoryItem {
  id: string;
  name: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badge?: string;
  catalogCategory?: string;
}

interface FlipkartCategoryNavProps {
  products: Product[];
  selectedCategoryId: string;
  onSelectCategory: (category: CategoryItem) => void;
}

export const FlipkartCategoryNav: React.FC<FlipkartCategoryNavProps> = ({
  products,
  selectedCategoryId,
  onSelectCategory,
}) => {
  const categories: CategoryItem[] = [
    {
      id: 'all',
      name: 'All Products',
      icon: Sparkles,
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      catalogCategory: 'All',
    },
    ...Array.from(new Set(products.map((product) => product.category))).map((category) => ({
      id: category,
      name: formatCategoryLabel(category),
      icon: ShoppingBag,
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      catalogCategory: category,
    })),
  ];

  return (
    <div className="bg-white border-b border-slate-200/90 shadow-xs">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between overflow-x-auto py-3 gap-2 sm:gap-4 no-scrollbar">
          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            const Icon = cat.icon;

            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat)}
                className={`group relative flex flex-col items-center justify-center min-w-[76px] sm:min-w-[90px] px-2 py-1.5 rounded-xl transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {/* Optional Badge */}
                {cat.badge && (
                  <span
                    className={`absolute -top-1 px-1.5 py-0.2 text-[9px] font-bold rounded-full border shadow-xs whitespace-nowrap leading-tight transition-transform group-hover:scale-105 ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-rose-500 text-white border-rose-400'
                    }`}
                  >
                    {cat.badge}
                  </span>
                )}

                {/* Icon Container */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                    isSelected
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200/80'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                {/* Label */}
                <span
                  className={`mt-1.5 text-xs font-semibold whitespace-nowrap tracking-tight ${
                    isSelected ? 'text-white font-bold' : 'text-slate-700 group-hover:text-slate-900'
                  }`}
                >
                  {cat.name}
                </span>

                {/* Active indicator underline */}
                {isSelected && (
                  <span className="w-6 h-0.5 bg-amber-400 rounded-full mt-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
