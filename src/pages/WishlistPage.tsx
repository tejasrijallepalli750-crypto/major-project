import React, { useEffect, useState } from 'react';
import { AlertCircle, Heart, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { useWishlist } from '../context/WishlistContext';
import { ProductCard } from '../components/ProductCard';
import { BackButton } from '../components/BackButton';

interface WishlistPageProps {
  onNavigate: (view: string, param?: string) => void;
}

export const WishlistPage: React.FC<WishlistPageProps> = ({ onNavigate }) => {
  const { productIds, removeFromWishlist } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const results = await Promise.allSettled(productIds.map((id) => api.getProductById(id)));
        if (!active) return;
        const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value.data] : []);
        setProducts(loaded);
        if (results.some((result) => result.status === 'rejected')) {
          setErrorMessage('Some saved items are no longer available and have been removed.');
          const availableIds = new Set(loaded.map((product) => product.id));
          productIds.filter((id) => !availableIds.has(id)).forEach(removeFromWishlist);
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load your saved items.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadProducts();
    return () => { active = false; };
  }, [productIds, removeFromWishlist]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
      <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
        <Heart className="h-6 w-6 text-rose-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your wishlist</h1>
          <p className="mt-1 text-sm text-slate-500">Keep the pieces you love in one place.</p>
        </div>
      </div>

      {errorMessage && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16 text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin" aria-label="Loading wishlist" />
        </div>
      ) : products.length ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <div key={product.id} className="relative">
              <button
                type="button"
                onClick={() => removeFromWishlist(product.id)}
                aria-label={`Remove ${product.name} from wishlist`}
                className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 text-rose-600 shadow-sm hover:bg-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <ProductCard product={product} onSelect={(id) => onNavigate('product-detail', id)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-900">Your wishlist is empty</h2>
          <p className="text-sm text-slate-500">Save products you love and come back to them anytime.</p>
          <button
            type="button"
            onClick={() => onNavigate('catalog')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Explore the collection
          </button>
        </div>
      )}
    </div>
  );
};
