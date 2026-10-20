import React, { useEffect, useState } from 'react';
import { ArrowRight, PackageCheck, Sparkles, Truck } from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { ProductCard } from '../components/ProductCard';

interface HomePageProps {
  onNavigate: (view: string, param?: string) => void;
}

const collectionLabels = ['Audio & Wearables', 'Electronics', 'Bags & Accessories', 'Home & Living'];

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFeatured = async () => {
      try {
        const res = await api.getProducts({ limit: 6, sort: 'rating' });
        setFeaturedProducts(res.data);
      } catch (error) {
        console.error('Unable to load featured products', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFeatured();
  }, []);

  return (
    <div className="space-y-16 pb-4 sm:space-y-20">
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8">
        <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white lg:grid-cols-2">
          <div className="flex flex-col justify-center p-7 sm:p-12 lg:p-14">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">AURA / Everyday considered</p>
            <h1 className="max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
              Useful things, beautifully chosen.
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base">
              Discover refined tools for work, sound, travel and home. Every AURA collection is designed to make the everyday feel a little more intentional.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate('catalog')}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
              >
                Shop the collection <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => document.getElementById('featured-products')?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-xl border border-slate-300 px-5 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Explore favourites
              </button>
            </div>
          </div>
          <div className="relative min-h-72 bg-slate-100 lg:min-h-full">
            <img
              src="/images/hero_ecommerce_banner_1792292817918.jpg"
              alt="A thoughtfully arranged modern workspace"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute bottom-5 left-5 rounded-xl bg-white/95 px-4 py-3 text-xs shadow-sm backdrop-blur">
              <p className="font-semibold text-slate-900">Designed for the daily ritual</p>
              <p className="mt-0.5 text-slate-500">Practical pieces with a point of view.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Browse by category</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Collections for how you live</h2>
          </div>
          <button onClick={() => onNavigate('catalog')} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900">
            View all products <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {collectionLabels.map((label, index) => (
            <button
              key={label}
              onClick={() => onNavigate('catalog', label)}
              className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">0{index + 1}</span>
              <span className="mt-8 block text-sm font-semibold text-slate-900 group-hover:text-slate-700">{label}</span>
              <ArrowRight className="mt-3 h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-700" />
            </button>
          ))}
        </div>
      </section>

      <section id="featured-products" className="mx-auto max-w-7xl scroll-mt-24 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Selected for you</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">AURA favourites</h2>
          </div>
          <button onClick={() => onNavigate('catalog')} className="text-xs font-semibold text-slate-700 hover:text-slate-900">Shop all</button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 pt-7 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 pt-7 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => <ProductCard key={product.id} product={product} onSelect={(id) => onNavigate('product-detail', id)} />)}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-5 rounded-3xl bg-slate-900 p-7 text-white sm:grid-cols-3 sm:p-10">
          <div className="flex gap-3"><Sparkles className="h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="text-sm font-semibold">Made to be used</h3><p className="mt-1 text-xs leading-relaxed text-slate-300">Well-made daily essentials with clear product details.</p></div></div>
          <div className="flex gap-3"><Truck className="h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="text-sm font-semibold">Straightforward delivery</h3><p className="mt-1 text-xs leading-relaxed text-slate-300">Review your address and order total before checkout.</p></div></div>
          <div className="flex gap-3"><PackageCheck className="h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="text-sm font-semibold">Order records that travel with you</h3><p className="mt-1 text-xs leading-relaxed text-slate-300">Access your purchase history and download invoices from your account.</p></div></div>
        </div>
      </section>
    </div>
  );
};
