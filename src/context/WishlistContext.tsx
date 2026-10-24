import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

interface WishlistContextValue {
  productIds: string[];
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);

const readWishlistOwner = (): string | null => {
  try {
    return localStorage.getItem('aura_wishlist_owner');
  } catch (error) {
    console.warn('[Wishlist] Failed to read the saved wishlist owner', error);
    return null;
  }
};

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [productIds, setProductIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('aura_wishlist');
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch (error) {
      console.warn('[Wishlist] Failed to read saved wishlist', error);
      return [];
    }
  });
  const [savedWishlistUserId, setSavedWishlistUserId] = useState<string | null>(readWishlistOwner);
  const productIdsRef = React.useRef(productIds);
  productIdsRef.current = productIds;

  useEffect(() => {
    try {
      localStorage.setItem('aura_wishlist', JSON.stringify(productIds));
    } catch (error) {
      console.warn('[Wishlist] Failed to save wishlist', error);
    }
  }, [productIds]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      if (savedWishlistUserId || readWishlistOwner()) {
        setProductIds([]);
        productIdsRef.current = [];
        setSavedWishlistUserId(null);
        try {
          localStorage.removeItem('aura_wishlist');
          localStorage.removeItem('aura_wishlist_owner');
        } catch (error) {
          console.warn('[Wishlist] Failed to clear the previous account wishlist cache', error);
        }
      }
      return;
    }
    let active = true;
    const loadSavedWishlist = async () => {
      const ownerId = readWishlistOwner() || savedWishlistUserId;
      const guestWishlist = ownerId ? [] : productIdsRef.current;
      if (ownerId && ownerId !== user.id) {
        setProductIds([]);
        productIdsRef.current = [];
        try {
          localStorage.removeItem('aura_wishlist');
          localStorage.removeItem('aura_wishlist_owner');
        } catch (error) {
          console.warn('[Wishlist] Failed to clear a wishlist from another account', error);
        }
      }
      try {
        const saved = await api.getWishlist();
        if (!active) return;
        if (saved.data.length) {
          setProductIds(saved.data);
        } else if (guestWishlist.length) {
          const migrated = await api.saveWishlist(guestWishlist);
          if (active) setProductIds(migrated.data);
        } else {
          setProductIds([]);
        }
        if (active) {
          setSavedWishlistUserId(user.id);
          try {
            localStorage.setItem('aura_wishlist_owner', user.id);
          } catch (error) {
            console.warn('[Wishlist] Failed to persist the wishlist owner', error);
          }
        }
      } catch (error) {
        console.error('[Wishlist] Could not load the signed-in customer wishlist from the server:', error);
      }
    };
    void loadSavedWishlist();
    return () => { active = false; };
  }, [isAuthLoading, user?.id]);

  useEffect(() => {
    if (isAuthLoading || !user || savedWishlistUserId !== user.id) return;
    const timer = window.setTimeout(() => {
      void api.saveWishlist(productIds).catch((error: unknown) => {
        console.error('[Wishlist] Failed to save the signed-in customer wishlist:', error);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isAuthLoading, productIds, savedWishlistUserId, user]);

  const toggleWishlist = useCallback((productId: string) => {
    setProductIds((previous) => previous.includes(productId)
      ? previous.filter((id) => id !== productId)
      : [...previous, productId]);
  }, []);

  const removeFromWishlist = useCallback((productId: string) => {
    setProductIds((previous) => previous.filter((id) => id !== productId));
  }, []);

  const value = useMemo<WishlistContextValue>(() => ({
    productIds,
    isWishlisted: (productId) => productIds.includes(productId),
    toggleWishlist,
    removeFromWishlist,
  }), [productIds, removeFromWishlist, toggleWishlist]);
  return (
    <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
  );
};

export const useWishlist = (): WishlistContextValue => {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used within a WishlistProvider');
  return context;
};
