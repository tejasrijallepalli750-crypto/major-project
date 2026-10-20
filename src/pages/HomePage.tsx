import React, { useEffect, useState } from 'react';
import { ArrowRight, PackageCheck, Sparkles, Truck, Flame, ShoppingBag } from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { FlipkartCategoryNav, CategoryItem, CATEGORIES } from '../components/FlipkartCategoryNav';
import { FestiveHeroCarousel } from '../components/FestiveHeroCarousel';
import { SpotlightWideBanner } from '../components/SpotlightWideBanner';
import { RecommendationsSection } from '../components/RecommendationsSection';
import { FlashDealsCountdown } from '../components/FlashDealsCountdown';
import { CuratedBundlesSection } from '../components/CuratedBundlesSection';
import { TrustOffersStrip } from '../components/TrustOffersStrip';

interface HomePageProps {
  onNavigate: (view: string, param?: string) => void;
}

const collectionLabels = [
  { name: 'Audio & Wearables', count: '6 items', desc: 'Planar sound, Hi-Res DACs & GPS watches' },
  { name: 'Electronics', count: '7 items', desc: '5G phones, mechanical keys, 4K displays' },
  { name: 'Apparel', count: '4 items', desc: 'Silk Anarkalis, fine Merino wool & fleece' },
  { name: 'Home & Living', count: '5 items', desc: 'Walnut desk pieces, brass lamps & coffee sets' },
  { name: 'Bags & Accessories', count: '3 items', desc: 'Artisan full-grain leather & waxed canvas' },
  { name: 'Stationery & Books', count: '3 items', desc: 'Titanium gold nib pens & grid notebooks' },
];

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('for-you');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await api.getProducts({ limit: 50 });
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
      const recs = document.getElementById('recommendations-section');
      recs?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Flipkart-style Category Icon Navigation Row */}
      <FlipkartCategoryNav
        selectedCategoryId={selectedCategory}
        onSelectCategory={handleCategorySelect}
      />

      {/* 2. Festive Banner Carousel (Matching "Big Shopping Utsav / Sale is LIVE / Anarkalis Min 70% Off / HMD Vibe 5G") */}
      <FestiveHeroCarousel onNavigate={onNavigate} />

      {/* 3. Trust & Bank Offers Strip (HDFC 10% instant off, 19,000+ pincodes delivery) */}
      <TrustOffersStrip />

      {/* 4. Deal of the Day / Lightning Deals with live countdown and progress bars */}
      {!isLoading && allProducts.length > 0 && (
        <FlashDealsCountdown
          products={allProducts}
          onSelectProduct={(id) => onNavigate('product-detail', id)}
          onViewAllDeals={() => onNavigate('catalog')}
        />
      )}

      {/* 5. Spotlight Wide Banner (Directly matching LG Nano 4K UHD AI banner in screenshot) */}
      <SpotlightWideBanner
        onSelectProduct={(id) => onNavigate('product-detail', id)}
        onExploreCatalog={(cat) => onNavigate('catalog', cat)}
      />

      {/* 6. Recommended Products Section (Personalized picks, match badges, filter tabs) */}
      {!isLoading && allProducts.length > 0 && (
        <RecommendationsSection
          products={allProducts}
          onSelectProduct={(id) => onNavigate('product-detail', id)}
          onExploreMore={() => onNavigate('catalog')}
        />
      )}

      {/* 7. Frequently Bought Together / Value Recommendation Bundles */}
      {!isLoading && allProducts.length > 0 && (
        <CuratedBundlesSection
          products={allProducts}
          onSelectProduct={(id) => onNavigate('product-detail', id)}
        />
      )}

      {/* 8. Browse by Category Grid */}
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
          {collectionLabels.map((cat, idx) => (
            <button
              key={cat.name}
              onClick={() => onNavigate('catalog', cat.name)}
              className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-1 hover:border-slate-400 hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[140px]"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  0{idx + 1}
                </span>
                <span className="mt-3 block text-xs font-bold text-slate-900 group-hover:text-amber-700 transition-colors leading-snug">
                  {cat.name}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium">{cat.count}</span>
                <ArrowRight className="mt-1 h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-amber-600" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 9. Brand & Service Assurance */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <div className="grid gap-5 rounded-3xl bg-slate-900 p-7 text-white sm:grid-cols-3 sm:p-10 shadow-lg border border-slate-800">
          <div className="flex gap-3.5">
            <Sparkles className="h-6 w-6 shrink-0 text-amber-300" />
            <div>
              <h3 className="text-sm font-bold text-white">Genuine Brand Assured</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                100% authentic merchandise backed by official brand warranties and certified serial numbers.
              </p>
            </div>
          </div>
          <div className="flex gap-3.5">
            <Truck className="h-6 w-6 shrink-0 text-amber-300" />
            <div>
              <h3 className="text-sm font-bold text-white">Express Pincode Delivery</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                Fast courier dispatch across all major Indian cities with real-time tracking and delivery updates.
              </p>
            </div>
          </div>
          <div className="flex gap-3.5">
            <PackageCheck className="h-6 w-6 shrink-0 text-amber-300" />
            <div>
              <h3 className="text-sm font-bold text-white">Instant Invoices & Records</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                Download GST-compliant tax invoices and track order progress directly inside your account profile.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
