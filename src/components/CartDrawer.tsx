import React from 'react';
import { X, Trash2, Plus, Minus, ArrowRight, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { ProductImage } from './ProductImage';
import { hasSimulatedOlistInventory } from '../utils/productPresentation';

interface CartDrawerProps {
  onCheckout: () => void;
  onExplore: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onCheckout, onExplore }) => {
  const {
    cart,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    updateQuantity,
    removeFromCart,
    itemsPrice,
    shippingPrice,
    taxPrice,
    totalPrice,
  } = useCart();

  if (!isCartDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={() => setIsCartDrawerOpen(false)}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-slate-800" />
              <h2 className="text-base font-bold text-slate-900">Shopping Cart</h2>
              <span className="text-xs text-slate-500 font-mono tabular-nums">({cart.length} items)</span>
            </div>
            <button
              onClick={() => setIsCartDrawerOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <ShoppingBag className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-700">Your shopping cart is empty</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                  Explore our curated product collection and add items to your cart.
                </p>
                <button
                  onClick={() => {
                    setIsCartDrawerOpen(false);
                    onExplore();
                  }}
                  className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Explore Catalog
                </button>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.productId} className="py-4 first:pt-0 last:pb-0 flex gap-4">
                  {/* Thumbnail */}
                  <ProductImage
                    src={item.image}
                    name={item.name}
                    category={item.category}
                    sku={item.sku}
                    className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-100"
                    imageClassName="h-full w-full object-cover"
                  />

                  {/* Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-slate-900 line-clamp-1">{item.name}</h4>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer p-0.5"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {hasSimulatedOlistInventory(item.inventoryMode) && (
                        <p className="mt-1 text-[10px] font-medium text-amber-700">
                          Simulated inventory; not from Olist
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      {/* Quantity Stepper */}
                      <div className="flex items-center border border-slate-200 rounded-md">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-semibold font-mono tabular-nums">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                          className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="text-xs font-bold font-mono tabular-nums text-slate-900">
                        ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Summary */}
          {cart.length > 0 && (
            <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50/50 space-y-3">
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">₹{itemsPrice.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated GST (18%)</span>
                  <span className="font-mono tabular-nums">₹{taxPrice.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Standard Shipping</span>
                  <span className="font-mono tabular-nums">
                    {shippingPrice === 0 ? <span className="text-emerald-600 font-medium">FREE</span> : `₹${shippingPrice}`}
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
                  <span>Total Due</span>
                  <span className="font-mono tabular-nums">₹{totalPrice.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  onCheckout();
                }}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
