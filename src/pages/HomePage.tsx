import React, { useEffect, useState } from 'react';
import { ArrowRight, PackageCheck, Sparkles, Truck } from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { FlipkartCategoryNav, CategoryItem } from '../components/FlipkartCategoryNav';
import { SpotlightWideBanner } from '../components/SpotlightWideBanner';
import { RecommendationsSection } from '../components/RecommendationsSection';
import { CuratedBundlesSection } from '../components/CuratedBundlesSection';
import { formatCategoryLabel } from '../utils/productPresentation';

interface HomePageProps {
  onNavigate: (view: string, param?: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await api.getProducts({ limit: 1000 });
        setAllProducts(res.data);
      } catch (error) {
        console.error('Unable to load products for homepage', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProducts();
  }, []);

  const handleCategorySelect = (cat: CategoryItem) => {
    setSelectedCategory(cat.id);
    if (cat.catalogCategory && cat.catalogCategory !== 'All') {
      onNavigate('catalog', cat.catalogCategory);
    } else {
      // Smooth scroll to recommendations
      document.getElementById('recommendations-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Flipkart-style Category Icon Navigation Row */}
      <FlipkartCategoryNav
        products={allProducts}
        selectedCategoryId={selectedCategory}
        onSelectCategory={handleCategorySelect}
      />

      {/* Feature a product from the current catalog */}
      {!isLoading && allProducts.length > 0 && (
        <SpotlightWideBanner
          product={allProducts[0]}
          onSelectProduct={(id) => onNavigate('product-detail', id)}
        />
      )}

      {/* Recommendations come from the current catalog */}
      {!isLoading && allProducts.length > 0 && (
        <RecommendationsSection
          products={allProducts}
          onSelectProduct={(id) => onNavigate('product-detail', id)}
          onExploreMore={() => onNavigate('catalog')}
        />
      )}

      {/* Product pairing from the current catalog */}
      {!isLoading && allProducts.length > 0 && (
        <CuratedBundlesSection
          products={allProducts}
          onSelectProduct={(id) => onNavigate('product-detail', id)}
        />
      )}

      {/* Browse categories currently available in the catalog */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Explore Collections</p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Browse Categories
            </h2>
          </div>
          <button
            onClick={() => onNavigate('catalog')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            <span>View all products</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from(new Set(allProducts.map((product) => product.category))).map((category, idx) => {
            const count = allProducts.filter((product) => product.category === category).length;
            return (
              <button
                key={category}
                onClick={() => onNavigate('catalog', category)}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-1 hover:border-slate-400 hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[140px]"
              >
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    0{idx + 1}
                  </span>
                  <span className="mt-3 block text-xs font-bold text-slate-900 group-hover:text-amber-700 transition-colors leading-snug">
                    {formatCategoryLabel(category)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-medium">{count} {count === 1 ? 'item' : 'items'}</span>
                  <ArrowRight className="mt-1 h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-amber-600" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 9. Brand & Service Assurance */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <div className="grid gap-5 rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-7 text-slate-900 shadow-sm sm:grid-cols-3 sm:p-10">
          <div className="flex gap-3.5">
            <Sparkles className="h-6 w-6 shrink-0 text-amber-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Thoughtfully selected</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Explore a considered mix of everyday products across home, wellness, technology, and more.
              </p>
            </div>
          </div>
          <div className="flex gap-3.5">
            <Truck className="h-6 w-6 shrink-0 text-amber-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Clear delivery costs</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Shipping is complimentary on orders above ₹2,000; the applicable charge is shown at checkout.
              </p>
            </div>
          </div>
          <div className="flex gap-3.5">
            <PackageCheck className="h-6 w-6 shrink-0 text-amber-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Orders in one place</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Review your order history and download an invoice from your account.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
