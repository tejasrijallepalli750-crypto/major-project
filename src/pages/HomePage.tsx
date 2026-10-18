import React, { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck, Zap, RotateCcw, PackageCheck } from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { ProductCard } from '../components/ProductCard';

interface HomePageProps {
  onNavigate: (view: string, param?: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFeatured = async () => {
      try {
        const res = await api.getProducts({ limit: 6 });
        setFeaturedProducts(res.data);
      } catch (err) {
        console.error('Failed to load featured products', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadFeatured();
  }, []);

  return (
    <div className="space-y-20 pb-16">
      {/* 1. Hero Section: Split-column editorial showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-10 lg:p-12 overflow-hidden shadow-xs">
          {/* Left Column: Editorial Headline & CTAs */}
          <div className="lg:col-span-6 space-y-6">
            <div className="text-xs uppercase font-semibold tracking-wider text-slate-500">
              Autumn · Winter 2026 Collection
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.12]">
              Architectural purity and tactile engineering.
            </h1>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg">
              Precision audio monitors, CNC-machined titanium wearables, and handcrafted vegetable-tanned leather goods. Built with full MERN architecture and verified by Razorpay test gateway.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={() => onNavigate('catalog')}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Explore Catalog</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onNavigate('kaggle')}
                className="px-5 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>View Kaggle Dataset</span>
              </button>
            </div>

            {/* Quiet trust metadata */}
            <div className="pt-4 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
              <span>Razorpay Test Mode</span>
              <span aria-hidden="true">·</span>
              <span>18% GST Compliant</span>
              <span aria-hidden="true">·</span>
              <span>Instant PDF Invoices</span>
            </div>
          </div>

          {/* Right Column: High-Fidelity Studio Lifestyle Image */}
          <div className="lg:col-span-6 relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[4/3] rounded-xl overflow-hidden bg-slate-100">
            <img
              src="/src/assets/images/hero_ecommerce_banner_1792292817918.jpg"
              alt="AURA Lifestyle workspace"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </section>

      {/* 2. Value Pillars Strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-5 bg-white border border-slate-200/80 rounded-xl flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Cryptographic Payment</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                HMAC-SHA256 signature verification via official Razorpay test mode.
              </p>
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200/80 rounded-xl flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Server Price Defense</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                Zero client trust: catalog prices &amp; inventory validated on Express backend.
              </p>
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200/80 rounded-xl flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Verified PDF Invoices</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                Instant downloadable GST tax invoices with client and gateway audit logs.
              </p>
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200/80 rounded-xl flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Olist Dataset Hub</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                Pre-integrated Brazilian Kaggle e-commerce historical dataset explorer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Featured Collection Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-1">
              Curated Selection
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Featured Demonstration Products
            </h2>
          </div>
          <button
            onClick={() => onNavigate('catalog')}
            className="text-xs font-semibold text-slate-900 hover:text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <span>View All Products</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="bg-white rounded-xl border border-slate-200 p-4 h-80 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={(id) => onNavigate('product-detail', id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4. Story & Engineering Craftsmanship Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 text-white rounded-2xl p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Academic Project Architecture
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Designed for B.Tech Computer Science Engineering Viva Evaluation.
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Every subsystem meets the 10-point guideline syllabus: Mongoose database schema models, Express REST APIs, JWT role-based customer and admin authorization, atomic stock decrementing, Razorpay HMAC-SHA256 test payment verification, and downloadable GST PDF invoices.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate('docs')}
                className="px-5 py-2.5 bg-white text-slate-900 hover:bg-slate-100 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Read Project Manual &amp; Viva Q&amp;A
              </button>
              <button
                onClick={() => onNavigate('admin')}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
              >
                Access Admin Portal
              </button>
            </div>
          </div>

          <div className="space-y-3 font-mono text-xs bg-slate-950/70 p-6 rounded-xl border border-slate-800 text-slate-300">
            <div className="text-emerald-400 font-semibold mb-2 text-xs">
              // Core Architectural Invariants:
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400">Frontend Stack:</span>
              <span className="text-white">React 19 + TypeScript + Tailwind</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400">Backend Server:</span>
              <span className="text-white">Node.js + Express REST APIs</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400">Persistence Engine:</span>
              <span className="text-white">Persistent JSON / Mongoose Schema</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400">Payment Gateway:</span>
              <span className="text-white">Razorpay Test Mode (HMAC-SHA256)</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Dataset Source:</span>
              <span className="text-white">Kaggle Brazilian E-Commerce (Olist)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
