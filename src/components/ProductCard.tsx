import React, { useState } from 'react';
import { Heart, ShoppingBag, Star, Check } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { formatCategoryLabel } from '../utils/productPresentation';
import { ProductImage } from './ProductImage';

interface ProductCardProps {
  product: Product;
  onSelect: (productId: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect }) => {
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
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
        <ProductImage
          src={product.image}
          name={product.name}
          category={product.category}
          sku={product.sku}
          className="h-full w-full"
          imageClassName="h-full w-full object-cover group-hover:scale-103 transition-transform duration-300"
          showIllustrationLabel
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleWishlist(product.id);
          }}
          aria-label={isWishlisted(product.id) ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={isWishlisted(product.id)}
          className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-slate-600 shadow-sm transition-colors hover:text-rose-600"
        >
          <Heart className={`h-4 w-4 ${isWishlisted(product.id) ? 'fill-rose-500 text-rose-500' : ''}`} />
        </button>

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
            <span>{formatCategoryLabel(product.category)}</span>
            {product.brand && (
              <>
                <span aria-hidden="true">·</span>
                <span>{product.brand}</span>
              </>
            )}
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
              {product.numReviews > 0 ? (
                <>
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>{product.rating.toFixed(1)}</span>
                  <span>({product.numReviews})</span>
                </>
              ) : <span>No reviews yet</span>}
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
