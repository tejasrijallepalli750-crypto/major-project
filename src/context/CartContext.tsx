import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Product, CartItem } from '../types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { calculateOrderTotals } from '../utils/orderPricing';

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

const readCartOwner = (): string | null => {
  try {
    return localStorage.getItem('aura_cart_owner');
  } catch (error) {
    console.warn('[Cart] Failed to read the saved cart owner', error);
    return null;
  }
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('aura_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [savedCartUserId, setSavedCartUserId] = useState<string | null>(readCartOwner);
  const cartRef = useRef(cart);
  cartRef.current = cart;

  useEffect(() => {
    try {
      localStorage.setItem('aura_cart', JSON.stringify(cart));
    } catch (err) {
      console.warn('[Cart] Failed to persist cart to localStorage', err);
    }
  }, [cart]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      if (savedCartUserId || readCartOwner()) {
        setCart([]);
        cartRef.current = [];
        setSavedCartUserId(null);
        try {
          localStorage.removeItem('aura_cart');
          localStorage.removeItem('aura_cart_owner');
        } catch (error) {
          console.warn('[Cart] Failed to clear the previous account cart cache', error);
        }
      }
      return;
    }
    let isActive = true;
    const loadRemoteCart = async () => {
      const ownerId = readCartOwner() || savedCartUserId;
      const guestCart = ownerId ? [] : cartRef.current;
      if (ownerId && ownerId !== user.id) {
        setCart([]);
        cartRef.current = [];
        try {
          localStorage.removeItem('aura_cart');
          localStorage.removeItem('aura_cart_owner');
        } catch (error) {
          console.warn('[Cart] Failed to clear a cart from another account', error);
        }
      }
      try {
        const saved = await api.getCart();
        if (!isActive) return;
        if (saved.data.length) {
          setCart(saved.data);
        } else if (guestCart.length) {
          const migrated = await api.saveCart(guestCart.map(({ productId, quantity }) => ({ productId, quantity })));
          if (isActive) setCart(migrated.data);
        } else {
          setCart([]);
        }
        if (isActive) {
          setSavedCartUserId(user.id);
          try {
            localStorage.setItem('aura_cart_owner', user.id);
          } catch (error) {
            console.warn('[Cart] Failed to persist the cart owner', error);
          }
        }
      } catch (error) {
        console.error('[Cart] Could not load the signed-in customer cart from the server:', error);
      }
    };
    void loadRemoteCart();
    return () => { isActive = false; };
  }, [isAuthLoading, user?.id]);

  useEffect(() => {
    if (isAuthLoading || !user || savedCartUserId !== user.id) return;
    const timer = window.setTimeout(() => {
      void api.saveCart(cart.map(({ productId, quantity }) => ({ productId, quantity }))).catch((error: unknown) => {
        console.error('[Cart] Failed to save the signed-in customer cart:', error);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cart, isAuthLoading, savedCartUserId, user]);

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        const newQty = Math.min(product.stock, existing.quantity + quantity);
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                name: product.name,
                price: product.price,
                image: product.image,
                category: product.category,
                quantity: newQty,
                stock: product.stock,
                sku: product.sku,
              }
            : item
        );
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            category: product.category,
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
  const { shippingPrice, taxPrice, totalPrice } = calculateOrderTotals(itemsPrice);

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
