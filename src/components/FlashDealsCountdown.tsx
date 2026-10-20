import React, { useState, useEffect } from 'react';
import { Zap, Clock, Star, ShoppingBag, Check, ChevronRight } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';

interface FlashDealsCountdownProps {
  products: Product[];
  onSelectProduct: (productId: string) => void;
  onViewAllDeals: () => void;
}

export const FlashDealsCountdown: React.FC<FlashDealsCountdownProps> = ({
  products,
  onSelectProduct,
  onViewAllDeals,
}) => {
  const { addToCart } = useCart();
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  const [timer, setTimer] = useState({
    hours: 3,
    minutes: 48,
    seconds: 22,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 6, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickAdd = (e: React.MouseEvent, prod: Product) => {
    e.stopPropagation();
    if (prod.stock > 0) {
      addToCart(prod, 1);
      setAddedIds((prev) => ({ ...prev, [prod.id]: true }));
      setTimeout(() => setAddedIds((prev) => ({ ...prev, [prod.id]: false })), 1500);
    }
  };

  const pad = (n: number) => n.toString().padStart(2, '0');

  // Select 4 exciting products for flash deals
  const dealProducts = products.slice(0, 4);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-purple-500/10 rounded-3xl p-5 sm:p-8 border border-amber-200/80 shadow-xs">
        {/* Top Header Row with Live Countdown */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-amber-200/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-md animate-pulse">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Deal of the Day
                </h3>
                <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider">
                  Lightning Deals
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Handpicked festive deals with guaranteed lowest prices of the season
              </p>
            </div>
          </div>

          {/* Countdown Clock */}
          <div className="flex items-center gap-3 bg-white/90 backdrop-blur-xs px-4 py-2 rounded-2xl border border-amber-300 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Clock className="w-4 h-4 text-rose-600" />
              <span>Ends in:</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-sm font-black text-rose-600">
              <span className="px-2 py-1 bg-slate-900 text-white rounded-lg">{pad(timer.hours)}</span>
              <span>:</span>
              <span className="px-2 py-1 bg-slate-900 text-white rounded-lg">{pad(timer.minutes)}</span>
              <span>:</span>
              <span className="px-2 py-1 bg-slate-900 text-white rounded-lg">{pad(timer.seconds)}</span>
            </div>
          </div>
        </div>

        {/* Deals Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {dealProducts.map((prod, idx) => {
            const isAdded = addedIds[prod.id];
            const claimedPct = 65 + (idx * 9);
            const discountPercent = 35 + (idx * 5);
            const originalPrice = Math.round(prod.price * (1 + discountPercent / 100));

            return (
              <div
                key={prod.id}
                onClick={() => onSelectProduct(prod.id)}
                className="bg-white rounded-2xl border border-slate-200/80 p-4 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  {/* Image slot */}
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-3">
                    <img
                      src={prod.image}
                      alt={prod.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black uppercase shadow-xs">
                      {discountPercent}% OFF
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 line-clamp-1 group-hover:text-amber-600 transition-colors">
                    {prod.name}
                  </h4>

                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-base font-extrabold text-slate-900 font-mono">
                      ₹{prod.price.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs line-through text-slate-400 font-mono">
                      ₹{originalPrice.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Claimed progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1">
                      <span>{claimedPct}% Claimed</span>
                      <span className="text-rose-600 font-bold">Only {Math.max(2, 6 - idx)} left</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                        style={{ width: `${claimedPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Action */}
                <div className="pt-3 mt-3 border-t border-slate-100">
                  <button
                    onClick={(e) => handleQuickAdd(e, prod)}
                    className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isAdded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Added to Cart</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Claim Deal</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* View All Deals Strip */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onViewAllDeals}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 hover:text-amber-700 cursor-pointer"
          >
            <span>View all flash offers</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
