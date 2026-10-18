import React, { useState } from 'react';
import { ShoppingBag, User as UserIcon, Shield, Menu, X, CheckCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { ServiceStatusModal } from './ServiceStatusModal';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string, param?: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { user, isAdmin, logout } = useAuth();
  const { cartCount, setIsCartDrawerOpen } = useCart();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAcademicBanner, setShowAcademicBanner] = useState(true);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        {/* Academic Project Notification Banner */}
        {showAcademicBanner && (
          <div className="bg-slate-900 text-slate-200 text-xs py-1.5 px-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 truncate">
                <span className="font-semibold text-white">Major Academic Project:</span>
                <span className="text-slate-300 truncate">
                  Full-Stack E-Commerce &amp; Razorpay Payment Gateway (Test Mode) · B.Tech CSE Evaluation
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setIsStatusModalOpen(true)}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Shield className="w-3 h-3" />
                  <span>Service Readiness &amp; Setup Status</span>
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={() => onNavigate('docs')}
                  className="text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Docs &amp; Viva Guide</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setShowAcademicBanner(false)}
                  className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                  title="Dismiss banner"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark (single text element) */}
        <button
          onClick={() => onNavigate('home')}
          className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:opacity-85 transition-opacity text-left cursor-pointer flex items-center gap-2"
        >
          <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-sm">
            A
          </span>
          <span className="font-['Outfit'] tracking-wider">AURA</span>
        </button>

        {/* Zone 2: 4-5 clean single-line text nav links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <button
            onClick={() => onNavigate('home')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              currentView === 'home' ? 'text-slate-900 font-semibold border-b-2 border-slate-900 py-4' : 'hover:text-slate-900'
            }`}
          >
            Storefront
          </button>
          <button
            onClick={() => onNavigate('catalog')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              currentView === 'catalog' ? 'text-slate-900 font-semibold border-b-2 border-slate-900 py-4' : 'hover:text-slate-900'
            }`}
          >
            Catalog
          </button>
          <button
            onClick={() => onNavigate('kaggle')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              currentView === 'kaggle' ? 'text-slate-900 font-semibold border-b-2 border-slate-900 py-4' : 'hover:text-slate-900'
            }`}
          >
            Kaggle Dataset
          </button>
          <button
            onClick={() => onNavigate('docs')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              currentView === 'docs' ? 'text-slate-900 font-semibold border-b-2 border-slate-900 py-4' : 'hover:text-slate-900'
            }`}
          >
            Project Manual &amp; Tests
          </button>
          {user && (
            <button
              onClick={() => onNavigate('orders')}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                currentView === 'orders' ? 'text-slate-900 font-semibold border-b-2 border-slate-900 py-4' : 'hover:text-slate-900'
              }`}
            >
              My Orders
            </button>
          )}
        </nav>

        {/* Zone 3: Actions (Cart Drawer trigger + User Authentication dropdown) */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Cart Icon with count */}
          <button
            onClick={() => setIsCartDrawerOpen(true)}
            className="relative p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Shopping Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-slate-900 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center tabular-nums">
                {cartCount}
              </span>
            )}
          </button>

          {/* Admin Dashboard shortcut */}
          {isAdmin && (
            <button
              onClick={() => onNavigate('admin')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin Portal</span>
            </button>
          )}

          {/* User Account Menu */}
          <div className="relative">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 p-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase">
                    {user.name.charAt(0)}
                  </div>
                  <span className="hidden lg:inline text-xs font-semibold text-slate-800 max-w-[100px] truncate">
                    {user.name}
                  </span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-900 truncate">{user.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Role: {user.role}</p>
                    </div>

                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('profile');
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      My Profile
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('orders');
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Order History &amp; Invoices
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onNavigate('admin');
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-emerald-700 hover:bg-emerald-50 font-semibold cursor-pointer"
                      >
                        Admin Dashboard
                      </button>
                    )}
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                        onNavigate('home');
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 font-medium cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate('login')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => onNavigate('register')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Register
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger menu */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            aria-label="Toggle Mobile Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-2">
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              onNavigate('home');
            }}
            className="block w-full text-left py-2 text-sm text-slate-700 font-medium"
          >
            Storefront
          </button>
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              onNavigate('catalog');
            }}
            className="block w-full text-left py-2 text-sm text-slate-700 font-medium"
          >
            Catalog
          </button>
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              onNavigate('kaggle');
            }}
            className="block w-full text-left py-2 text-sm text-slate-700 font-medium"
          >
            Kaggle Dataset
          </button>
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              onNavigate('docs');
            }}
            className="block w-full text-left py-2 text-sm text-slate-700 font-medium"
          >
            Project Manual &amp; Tests
          </button>
          {user && (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigate('orders');
              }}
              className="block w-full text-left py-2 text-sm text-slate-700 font-medium"
            >
              My Orders
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigate('admin');
              }}
              className="block w-full text-left py-2 text-sm font-semibold text-emerald-700"
            >
              Admin Dashboard
            </button>
          )}
        </div>
      )}
    </header>

    {/* Service Connection Status Modal */}
    <ServiceStatusModal
      isOpen={isStatusModalOpen}
      onClose={() => setIsStatusModalOpen(false)}
    />
  </>
  );
};
