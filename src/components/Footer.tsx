import React from 'react';
import { CreditCard, PackageCheck, ShieldCheck } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => (
  <footer className="mt-20 border-t border-slate-800 bg-slate-900 text-xs text-slate-400">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs font-black text-slate-900">A</span>
            <span>AURA</span>
          </div>
          <p className="max-w-xs leading-relaxed">Thoughtful essentials for work, home and everyday life. Discover pieces selected for practical design and lasting quality.</p>
        </div>

        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white">Shop</h4>
          <ul className="space-y-2">
            <li><button onClick={() => onNavigate('catalog')} className="transition-colors hover:text-white">All products</button></li>
            <li><button onClick={() => onNavigate('cart')} className="transition-colors hover:text-white">Shopping bag</button></li>
            <li><button onClick={() => onNavigate('orders')} className="transition-colors hover:text-white">Orders &amp; invoices</button></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white">Shopping with AURA</h4>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 shrink-0 text-emerald-400" />Secure checkout</div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />Protected account access</div>
            <div className="flex items-center gap-2"><PackageCheck className="h-4 w-4 shrink-0 text-emerald-400" />Downloadable order invoices</div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 sm:flex-row">
        <p>© {new Date().getFullYear()} AURA. All rights reserved.</p>
        <p>Prices shown in INR, inclusive of applicable taxes.</p>
      </div>
    </div>
  </footer>
);
