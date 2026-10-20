import React from 'react';
import { ShieldCheck, Truck, RotateCcw, CreditCard, Award } from 'lucide-react';

export const TrustOffersStrip: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        {/* Item 1: Bank Offer */}
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">10% Instant Bank Off</p>
            <p className="text-[11px] text-slate-500 truncate">HDFC, SBI & Axis Cards</p>
          </div>
        </div>

        {/* Item 2: Free Express Shipping */}
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
            <Truck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">Free Express Delivery</p>
            <p className="text-[11px] text-slate-500 truncate">Across 19,000+ PIN Codes</p>
          </div>
        </div>

        {/* Item 3: 7-Day Replacement */}
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">7-Day Easy Replacement</p>
            <p className="text-[11px] text-slate-500 truncate">Hassle-free return policy</p>
          </div>
        </div>

        {/* Item 4: 100% Genuine */}
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 border border-purple-100">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">100% Genuine Products</p>
            <p className="text-[11px] text-slate-500 truncate">Brand warranty verified</p>
          </div>
        </div>
      </div>
    </div>
  );
};
