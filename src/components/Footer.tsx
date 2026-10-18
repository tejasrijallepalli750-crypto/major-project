import React from 'react';
import { ShieldCheck, CreditCard, Database, Terminal } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <span className="w-6 h-6 rounded bg-white text-slate-900 flex items-center justify-center font-black text-xs">
                A
              </span>
              <span>AURA Retail</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-xs">
              A complete production-grade E-Commerce Website with Razorpay Payment Gateway, Olist Kaggle dataset integration, and MERN architecture.
            </p>
            <div className="text-[11px] text-slate-500">
              Developed as a B.Tech Computer Science Engineering Major Academic Project.
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold text-xs tracking-wider uppercase mb-3">Storefront</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('catalog')} className="hover:text-white transition-colors cursor-pointer">
                  All Products
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('kaggle')} className="hover:text-white transition-colors cursor-pointer">
                  Kaggle Brazilian Dataset
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('orders')} className="hover:text-white transition-colors cursor-pointer">
                  Order Tracking &amp; Invoices
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('cart')} className="hover:text-white transition-colors cursor-pointer">
                  Shopping Cart
                </button>
              </li>
            </ul>
          </div>

          {/* Academic & Engineering */}
          <div>
            <h4 className="text-white font-semibold text-xs tracking-wider uppercase mb-3">Academic Deliverables</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('docs')} className="hover:text-white transition-colors cursor-pointer">
                  Project Documentation &amp; Manual
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('docs')} className="hover:text-white transition-colors cursor-pointer">
                  Automated Security Test Suite
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('admin')} className="hover:text-white transition-colors cursor-pointer">
                  Administrator Portal
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('docs')} className="hover:text-white transition-colors cursor-pointer">
                  Viva Voce Q&amp;A Guide
                </button>
              </li>
            </ul>
          </div>

          {/* Payment & Security Architecture */}
          <div>
            <h4 className="text-white font-semibold text-xs tracking-wider uppercase mb-3">Payment &amp; Security</h4>
            <div className="space-y-2 text-slate-400">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Razorpay Test Gateway (v1 Checkout)</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>HMAC-SHA256 Signature Verification</span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Mongoose &amp; Persistent Document Storage</span>
              </div>
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Express REST APIs &amp; JWT/Bcrypt Auth</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
          <p>© {new Date().getFullYear()} AURA Retail Technologies · B.Tech Major Academic Project</p>
          <div className="flex items-center gap-6">
            <span>Razorpay TEST MODE</span>
            <span>·</span>
            <span>Olist Brazilian E-Commerce Dataset</span>
            <span>·</span>
            <span>INR (₹) Standard</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
