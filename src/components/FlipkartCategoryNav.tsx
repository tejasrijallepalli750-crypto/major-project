import React from 'react';
import {
  Sparkles,
  Shirt,
  Smartphone,
  Laptop,
  Headphones,
  Lamp,
  Tv,
  Briefcase,
  BookOpen,
  Flame,
} from 'lucide-react';

export interface CategoryItem {
  id: string;
  name: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badge?: string;
  catalogCategory?: string;
}

export const CATEGORIES: CategoryItem[] = [
  {
    id: 'for-you',
    name: 'For You',
    icon: Sparkles,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    badge: 'Popular',
    catalogCategory: 'All',
  },
  {
    id: 'mobiles',
    name: 'Mobiles & Tech',
    icon: Smartphone,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    badge: '5G Deals',
    catalogCategory: 'Electronics',
  },
  {
    id: 'fashion',
    name: 'Fashion',
    icon: Shirt,
    color: 'bg-rose-100 text-rose-700 border-rose-200',
    badge: 'Min 70% Off',
    catalogCategory: 'Apparel',
  },
  {
    id: 'electronics',
    name: 'Electronics',
    icon: Laptop,
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    catalogCategory: 'Electronics',
  },
  {
    id: 'audio',
    name: 'Audio & Sound',
    icon: Headphones,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    badge: 'Top Rated',
    catalogCategory: 'Audio & Wearables',
  },
  {
    id: 'home',
    name: 'Home & Living',
    icon: Lamp,
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    catalogCategory: 'Home & Living',
  },
  {
    id: 'appliances',
    name: 'Appliances',
    icon: Tv,
    color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    badge: '4K AI',
    catalogCategory: 'Electronics',
  },
  {
    id: 'bags',
    name: 'Bags & Travel',
    icon: Briefcase,
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    catalogCategory: 'Bags & Accessories',
  },
  {
    id: 'books',
    name: 'Books & Station',
    icon: BookOpen,
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    catalogCategory: 'Stationery & Books',
  },
  {
    id: 'festive-deals',
    name: 'Festive Utsav',
    icon: Flame,
    color: 'bg-red-100 text-red-600 border-red-200',
    badge: 'Live',
    catalogCategory: 'All',
  },
];

interface FlipkartCategoryNavProps {
  selectedCategoryId: string;
  onSelectCategory: (category: CategoryItem) => void;
}

export const FlipkartCategoryNav: React.FC<FlipkartCategoryNavProps> = ({
  selectedCategoryId,
  onSelectCategory,
}) => {
  return (
    <div className="bg-white border-b border-slate-200/90 shadow-xs">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between overflow-x-auto py-3 gap-2 sm:gap-4 no-scrollbar">
          {CATEGORIES.map((cat) => {
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
