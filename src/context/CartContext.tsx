import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product, CartItem } from '../types';
import { api } from '../services/api';

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  itemsPrice: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
  validateCartWithServer: () => Promise<{ success: boolean; errors?: string[] }>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('aura_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('aura_cart', JSON.stringify(cart));
    } catch (err) {
      console.warn('[Cart] Failed to persist cart to localStorage', err);
    }
  }, [cart]);

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        const newQty = Math.min(product.stock, existing.quantity + quantity);
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: newQty, stock: product.stock } : item
        );
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: Math.min(product.stock, quantity),
            stock: product.stock,
            sku: product.sku,
          },
        ];
      }
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const clamped = Math.min(item.stock, quantity);
          return { ...item, quantity: clamped };
        }
        return item;
      })
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  // Synchronized cart totals
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const itemsPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingPrice = itemsPrice >= 2000 || itemsPrice === 0 ? 0 : 150;
  const taxPrice = Number((itemsPrice * 0.18).toFixed(2));
  const totalPrice = Number((itemsPrice + shippingPrice + taxPrice).toFixed(2));

  // Server-side validation against authoritative database
  const validateCartWithServer = async (): Promise<{ success: boolean; errors?: string[] }> => {
    if (cart.length === 0) return { success: false, errors: ['Cart is empty'] };
    try {
      const payload = cart.map((i) => ({ productId: i.productId, quantity: i.quantity }));
      const res = await api.validateCart(payload);
      // Synchronize client prices with authoritative server catalog
      setCart(res.data.items);
      return { success: true };
    } catch (err: any) {
      return { success: false, errors: [err.message] };
    }
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        itemsPrice,
        shippingPrice,
        taxPrice,
        totalPrice,
        isCartDrawerOpen,
        setIsCartDrawerOpen,
        validateCartWithServer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
