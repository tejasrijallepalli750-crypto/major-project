import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminDashboard } from './pages/AdminDashboard';
import { Order } from './types';

export default function App() {
  const [currentView, setCurrentView] = useState<string>('home');
  const [selectedProductId, setSelectedProductId] = useState<string>('prod-001');
  const [catalogCategory, setCatalogCategory] = useState('All');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const handleNavigate = (view: string, param?: string) => {
    if (view === 'product-detail' && param) {
      setSelectedProductId(param);
    }
    if (view === 'catalog') {
      setCatalogCategory(param || 'All');
    }
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderSuccess = (order: Order) => {
    setConfirmedOrder(order);
    setCurrentView('order-confirmation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AuthProvider>
      <CartProvider>
        <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
          {/* Universal Top Bar */}
          <Navbar currentView={currentView} onNavigate={handleNavigate} />

          {/* Slide-over Cart Drawer */}
          <CartDrawer
            onCheckout={() => handleNavigate('checkout')}
            onExplore={() => handleNavigate('catalog')}
          />

          {/* Main View Router */}
          <main className="flex-1">
            {currentView === 'home' && <HomePage onNavigate={handleNavigate} />}

            {currentView === 'catalog' && (
              <CatalogPage
                initialCategory={catalogCategory}
                onSelectProduct={(id) => handleNavigate('product-detail', id)}
              />
            )}

            {currentView === 'product-detail' && (
              <ProductDetailPage
                productId={selectedProductId}
                onBack={() => handleNavigate('catalog')}
                onCheckout={() => handleNavigate('checkout')}
                onSelectProduct={(id) => handleNavigate('product-detail', id)}
              />
            )}

            {currentView === 'cart' && <CartPage onNavigate={handleNavigate} />}

            {currentView === 'checkout' && (
              <CheckoutPage
                onNavigate={handleNavigate}
                onOrderSuccess={handleOrderSuccess}
              />
            )}

            {currentView === 'order-confirmation' && confirmedOrder && (
              <OrderConfirmationPage order={confirmedOrder} onNavigate={handleNavigate} />
            )}

            {currentView === 'orders' && <OrderHistoryPage onNavigate={handleNavigate} />}

            {currentView === 'login' && <LoginPage onNavigate={handleNavigate} />}

            {currentView === 'register' && <RegisterPage onNavigate={handleNavigate} />}

            {currentView === 'profile' && <ProfilePage />}

            {currentView === 'admin' && <AdminDashboard />}

          </main>

          {/* Quiet Universal Footer */}
          <Footer onNavigate={handleNavigate} />
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
