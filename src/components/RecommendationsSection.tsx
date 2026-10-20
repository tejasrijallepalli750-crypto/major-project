import React, { useState } from 'react';
import { Sparkles, Star, ShoppingBag, Check, Flame, Award, Heart, ArrowRight } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';

interface RecommendationsSectionProps {
  products: Product[];
  onSelectProduct: (productId: string) => void;
  onExploreMore: () => void;
}

type FilterTab = 'all' | 'top-rated' | 'under-5000' | 'tech-audio' | 'apparel-decor';

export const RecommendationsSection: React.FC<RecommendationsSectionProps> = ({
  products,
  onSelectProduct,
  onExploreMore,
}) => {
  const { addToCart } = useCart();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [addedProductIds, setAddedProductIds] = useState<Record<string, boolean>>({});

  const handleAddToCart = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    if (product.stock > 0) {
      addToCart(product, 1);
      setAddedProductIds((prev) => ({ ...prev, [product.id]: true }));
      setTimeout(() => {
        setAddedProductIds((prev) => ({ ...prev, [product.id]: false }));
      }, 1500);
    }
  };

  // Filter recommendations based on active tab
  const filteredProducts = products.filter((prod) => {
    if (activeTab === 'top-rated') return prod.rating >= 4.8;
    if (activeTab === 'under-5000') return prod.price <= 5000;
    if (activeTab === 'tech-audio') {
      return prod.category === 'Electronics' || prod.category === 'Audio & Wearables';
    }
    if (activeTab === 'apparel-decor') {
      return prod.category === 'Apparel' || prod.category === 'Home & Living' || prod.category === 'Bags & Accessories';
    }
    return true;
  });

  // Take top 8
  const displayList = filteredProducts.slice(0, 8);

  const getRecommendationBadge = (prod: Product, index: number) => {
    if (index === 0) return { text: '99% Match', bg: 'bg-emerald-600 text-white' };
    if (prod.rating >= 4.9) return { text: 'Top Rated 4.9★', bg: 'bg-amber-500 text-white' };
    if (prod.price <= 3500) return { text: 'Best Value', bg: 'bg-indigo-600 text-white' };
    if (index % 3 === 0) return { text: 'Festive Pick', bg: 'bg-rose-600 text-white' };
    return { text: 'Recommended', bg: 'bg-slate-800 text-white' };
  };

  return (
    <section id="recommendations-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Personalized For You</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Recommended Products
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Curated items tailored to your browsing preferences, highest ratings, and ongoing festival specials.
          </p>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center flex-wrap gap-2">
          {[
            { id: 'all', label: 'All Picks' },
            { id: 'top-rated', label: 'Top Rated (4.8+ ★)' },
            { id: 'under-5000', label: 'Under ₹5,000' },
            { id: 'tech-audio', label: 'Tech & Audio' },
            { id: 'apparel-decor', label: 'Apparel & Decor' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as FilterTab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Recommended Products */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {displayList.map((product, idx) => {
          const badge = getRecommendationBadge(product, idx);
          const isAdded = addedProductIds[product.id];
          const discountPercent = Math.min(45, Math.round(15 + ((product.price % 30))));
          const originalPrice = Math.round(product.price * (1 + discountPercent / 100));

          return (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product.id)}
              className="group bg-white rounded-2xl border border-slate-200/90 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              {/* Image slot */}
              <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden flex items-center justify-center">
                <img
                  src={product.image}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />

                {/* Recommendation Match Badge */}
                <div
                  className={`absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase shadow-xs ${badge.bg}`}
                >
                  {badge.text}
                </div>

                {/* Discount Tag */}
                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-xs text-rose-600 font-extrabold text-[11px] px-2 py-0.5 rounded shadow-xs">
                  {discountPercent}% OFF
                </div>
              </div>

              {/* Content */}
              <div className="p-4 flex flex-col flex-grow justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-1">
                    <span>{product.category}</span>
                    <span className="text-slate-600 font-semibold">{product.brand}</span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-1">
                    {product.name}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                    {product.description}
                  </p>
                </div>

                {/* Pricing & Quick Action */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-extrabold text-slate-900 font-mono">
                        ₹{product.price.toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs line-through text-slate-400 font-mono">
                        ₹{originalPrice.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-slate-700">{product.rating.toFixed(1)}</span>
                      <span>({product.numReviews})</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleAddToCart(e, product)}
                    disabled={product.stock === 0}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-xs ${
                      product.stock === 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : isAdded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* View All Recommendations CTA */}
      <div className="mt-8 text-center">
        <button
          onClick={onExploreMore}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer"
        >
          <span>Explore All 24+ Recommended Items</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
};
