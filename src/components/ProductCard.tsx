import React, { useState } from 'react';
import { ShoppingBag, Star, Check } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';

interface ProductCardProps {
  product: Product;
  onSelect: (productId: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect }) => {
  const { addToCart } = useCart();
  const [imageLoaded, setImageLoaded] = useState(true);
  const [justAdded, setJustAdded] = useState(false);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.stock > 0) {
      addToCart(product, 1);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1400);
    }
  };

  return (
    <div
      onClick={() => onSelect(product.id)}
      className="group bg-white rounded-xl border border-slate-200/90 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col"
    >
      {/* Product Image Slot (65-70% height) with Fallback Container */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden flex items-center justify-center">
        {imageLoaded ? (
          <img
            src={product.image}
            alt={product.name}
            referrerPolicy="no-referrer"
            onError={() => setImageLoaded(false)}
            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center p-4 text-center">
            <ShoppingBag className="w-8 h-8 text-slate-400 mb-2" />
            <span className="text-xs font-semibold text-slate-600 truncate max-w-[160px]">{product.name}</span>
          </div>
        )}

        {/* Stock status indicator (unboxed subtle text) */}
        {product.stock <= 5 && product.stock > 0 && (
          <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm text-amber-700 text-[11px] font-semibold px-2 py-0.5 rounded shadow-xs">
            Only {product.stock} left
          </div>
        )}
        {product.stock === 0 && (
          <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm text-rose-700 text-[11px] font-semibold px-2 py-0.5 rounded shadow-xs">
            Out of Stock
          </div>
        )}
      </div>

      {/* Card Content & Metadata */}
      <div className="p-4 flex flex-col flex-grow justify-between gap-3">
        <div>
          {/* Unboxed Metadata with Typographic Separator */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-medium">
            <span>{product.category}</span>
            <span aria-hidden="true">·</span>
            <span>{product.brand}</span>
          </div>

          {/* Product Title */}
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-1 leading-snug">
            {product.name}
          </h3>

          {/* Short Description */}
          <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Price & Action Row */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
              ₹{product.price.toLocaleString('en-IN')}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{product.rating.toFixed(1)}</span>
              <span>({product.numReviews})</span>
            </div>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              product.stock === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : justAdded
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
            }`}
          >
            {justAdded ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Added</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
