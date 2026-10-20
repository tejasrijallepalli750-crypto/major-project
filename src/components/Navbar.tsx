import React, { useState } from 'react';
import { Menu, ShoppingBag, Shield, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string, param?: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { user, isAdmin, logout } = useAuth();
  const { cartCount, setIsCartDrawerOpen } = useCart();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigate = (view: string) => {
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
    onNavigate(view);
  };

  const linkClass = (view: string) =>
    `whitespace-nowrap transition-colors cursor-pointer ${
      currentView === view ? 'text-slate-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('home')}
          className="flex shrink-0 items-center gap-2 text-left text-xl font-bold tracking-tight text-slate-900 transition-opacity hover:opacity-85"
          aria-label="AURA home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white">A</span>
          <span className="font-['Outfit'] tracking-[0.18em]">AURA</span>
        </button>

        <nav className="hidden items-center gap-7 text-sm md:flex">
          <button onClick={() => navigate('home')} className={linkClass('home')}>Home</button>
          <button onClick={() => navigate('catalog')} className={linkClass('catalog')}>Shop</button>
          {user && <button onClick={() => navigate('orders')} className={linkClass('orders')}>My orders</button>}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsCartDrawerOpen(true)}
            className="relative rounded-lg p-2 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Open shopping bag"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate('admin')}
              className="hidden items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 sm:inline-flex"
            >
              <Shield className="h-3.5 w-3.5" />
              Admin
            </button>
          )}

          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg p-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                aria-label="Open account menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-bold uppercase text-slate-700">
                  {user.name.charAt(0)}
                </span>
                <span className="hidden max-w-24 truncate text-xs font-semibold text-slate-800 lg:inline">{user.name}</span>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
                  <div className="border-b border-slate-100 px-4 py-2">
                    <p className="truncate text-xs font-semibold text-slate-900">{user.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{user.email}</p>
                  </div>
                  <button onClick={() => navigate('profile')} className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">My profile</button>
                  <button onClick={() => navigate('orders')} className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">Orders &amp; invoices</button>
                  {isAdmin && <button onClick={() => navigate('admin')} className="w-full px-4 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Store administration</button>}
                  <div className="my-1 border-t border-slate-100" />
                  <button onClick={() => { logout(); navigate('home'); }} className="w-full px-4 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50">Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <button onClick={() => navigate('login')} className="hidden px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:text-slate-900 sm:inline">Sign in</button>
              <button onClick={() => navigate('register')} className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800">Create account</button>
            </div>
          )}

          <button
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden"
            aria-label="Toggle navigation"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <nav className="space-y-1 border-t border-slate-200 bg-white px-4 py-3 text-sm md:hidden">
          <button onClick={() => navigate('home')} className="block w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50">Home</button>
          <button onClick={() => navigate('catalog')} className="block w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50">Shop</button>
          {user && <button onClick={() => navigate('orders')} className="block w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50">My orders</button>}
          {isAdmin && <button onClick={() => navigate('admin')} className="block w-full rounded-lg px-3 py-2 text-left font-semibold text-emerald-700 hover:bg-emerald-50">Store administration</button>}
          {!user && <button onClick={() => navigate('login')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50"><UserIcon className="h-4 w-4" />Sign in</button>}
        </nav>
      )}
    </header>
  );
};
