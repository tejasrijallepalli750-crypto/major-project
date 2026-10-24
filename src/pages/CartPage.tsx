import React from 'react';
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag, ShieldCheck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { ProductImage } from '../components/ProductImage';
import { BackButton } from '../components/BackButton';

interface CartPageProps {
  onNavigate: (view: string) => void;
}

export const CartPage: React.FC<CartPageProps> = ({ onNavigate }) => {
  const {
    cart,
    updateQuantity,
    removeFromCart,
    clearCart,
    itemsPrice,
    shippingPrice,
    taxPrice,
    totalPrice,
  } = useCart();

  if (cart.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Your Shopping Cart is Empty</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Explore our curated catalog of precision audio, mechanical keyboards, titanium wearables, and leather goods.
        </p>
        <button
          onClick={() => onNavigate('catalog')}
          className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          Explore Catalog
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <BackButton onClick={() => onNavigate('catalog')} label="Continue Shopping" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-1">
            Order Review
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Shopping Cart ({cart.reduce((s, i) => s + i.quantity, 0)} items)
          </h1>
        </div>
        <button
          onClick={() => clearCart()}
          className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer self-start sm:self-auto"
        >
          Clear Shopping Cart
        </button>
      </div>

      {/* Grid: Left Items + Right Order Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Items */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-6 divide-y divide-slate-100">
          {cart.map((item) => (
            <div key={item.productId} className="py-6 first:pt-0 last:pb-0 flex flex-col sm:flex-row gap-4 sm:items-center">
              <ProductImage
                src={item.image}
                name={item.name}
                category={item.category}
                sku={item.sku}
                className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 bg-slate-100 sm:h-24 sm:w-24"
                imageClassName="h-full w-full object-cover"
              />

              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{item.name}</h3>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono tabular-nums">Unit: ₹{item.price.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex items-center justify-between pt-3">
                  <div className="flex items-center border border-slate-300 rounded-lg bg-slate-50">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 cursor-pointer font-bold"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-3 text-xs font-semibold font-mono tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 cursor-pointer font-bold disabled:opacity-30"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                    ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          ))}

          <div className="pt-6 flex items-center justify-between">
          </div>
        </div>

        {/* Right Column: Order Summary */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-6 sticky top-24 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Summary Calculation
          </h2>

          <div className="space-y-3 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Items Subtotal</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ₹{itemsPrice.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Goods &amp; Services Tax (18% GST)</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ₹{taxPrice.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Standard Insured Shipping</span>
              <span className="font-mono tabular-nums">
                {shippingPrice === 0 ? (
                  <span className="text-emerald-700 font-semibold">FREE (Above ₹2,000)</span>
                ) : (
                  <span className="font-semibold text-slate-900">₹{shippingPrice}</span>
                )}
              </span>
            </div>

            <div className="border-t border-slate-200 pt-3 flex justify-between text-base font-bold text-slate-900">
              <span>Order Total</span>
              <span className="font-mono tabular-nums">₹{totalPrice.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('checkout')}
            className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="pt-2 text-[11px] text-slate-400 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Secure checkout</span>
            </div>
            <p>Prices and stock availability will be re-verified on the server before payment initiation.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
