import React, { useState, useEffect } from 'react';
import { Heart, Star, ShoppingBag, ShieldCheck, Truck, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { formatCategoryLabel } from '../utils/productPresentation';
import { ProductImage } from '../components/ProductImage';
import { BackButton } from '../components/BackButton';

interface ProductDetailPageProps {
  productId: string;
  onBack: () => void;
  onCheckout: () => void;
  onSelectProduct?: (productId: string) => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  productId,
  onBack,
  onCheckout,
  onSelectProduct,
}) => {
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const [product, setProduct] = useState<Product | null>(null);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      setIsLoading(true);
      try {
        const res = await api.getProductById(productId);
        setProduct(res.data);

        // Fetch recommendations from same category or overall catalog
        const recsRes = await api.getProducts({
          category: res.data?.category,
          limit: 5,
        });
        const filtered = (recsRes.data || []).filter((p: Product) => p.id !== productId).slice(0, 4);
        setRecommendedProducts(filtered);
      } catch (err) {
        console.error('Failed to load product details', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProduct();
  }, [productId]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mb-3 text-slate-600" />
        <p className="text-xs">Loading product details from server...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Product Not Found</h2>
        <p className="text-xs text-slate-500">This product may have been removed or is no longer available.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
        >
          Return to Catalog
        </button>
      </div>
    );
  }

  const handleAddToCart = () => {
    if (product.stock > 0) {
      addToCart(product, quantity);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1800);
    }
  };

  const handleBuyNow = () => {
    if (product.stock > 0) {
      addToCart(product, quantity);
      onCheckout();
    }
  };

  const visibleFeatures = (product.features || []).filter((feature) => feature !== 'Imported from /dataset folder');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <BackButton onClick={onBack} label="Back to Catalog" />

      {/* Main PDP Grid: Left Gallery + Right Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left Column: Product Gallery */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 overflow-hidden">
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center">
            <ProductImage
              src={product.image}
              name={product.name}
              category={product.category}
              sku={product.sku}
              className="h-full w-full"
              imageClassName="h-full w-full object-cover"
              showIllustrationLabel
            />
          </div>

          {/* Technical Specifications Callouts */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Product Details &amp; Features
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-semibold text-slate-800">{formatCategoryLabel(product.category)}</span>
              </div>
              {product.brand && <div className="p-3 bg-slate-50 rounded-lg flex justify-between">
                <span className="text-slate-500">Brand / Manufacturer:</span>
                <span className="font-semibold text-slate-800">{product.brand}</span>
              </div>}
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between">
                <span className="text-slate-500">Inventory Status:</span>
                <span className={`font-semibold ${product.stock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {product.stock > 0 ? `${product.stock} units available` : 'Out of stock'}
                </span>
              </div>
            </div>

            {visibleFeatures.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-slate-500 font-medium block mb-2">Key Highlights:</span>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-700">
                  {visibleFeatures.map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-900 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Contiguous Purchase Module */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 lg:p-8 space-y-6 shadow-xs sticky top-24">
          <div>
            {/* Unboxed Metadata */}
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">
              {product.brand && <span>{product.brand}</span>}
              {product.brand && <span aria-hidden="true">·</span>}
              <span>{formatCategoryLabel(product.category)}</span>
            </div>

            {/* Product Title */}
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {product.name}
            </h1>

            {/* Rating */}
            {product.numReviews > 0 ? <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1 text-xs text-slate-700">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-bold">{product.rating.toFixed(1)}</span>
                <span className="text-slate-400 font-normal">({product.numReviews} customer reviews)</span>
              </div>
            </div> : <p className="mt-2 text-xs text-slate-500">No customer reviews yet</p>}
          </div>

          {/* Pricing in INR */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
                ₹{product.price.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Prose Description */}
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {product.description}
          </p>

          {/* Quantity Selector & Stock State */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Select Quantity</span>
              <span className="text-xs text-slate-500">
                {product.stock > 0 ? `${product.stock} units in stock` : 'Out of stock'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center border border-slate-300 rounded-lg bg-slate-50">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-slate-600 hover:text-slate-900 cursor-pointer font-bold"
                >
                  -
                </button>
                <span className="px-4 text-xs font-bold font-mono tabular-nums">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  disabled={quantity >= product.stock}
                  className="px-3 py-2 text-slate-600 hover:text-slate-900 cursor-pointer font-bold disabled:opacity-30"
                >
                  +
                </button>
              </div>

              <div className="text-xs text-slate-500 font-mono">
                Subtotal: <span className="font-bold text-slate-900">₹{(product.price * quantity).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              aria-pressed={isWishlisted(product.id)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Heart className={`h-4 w-4 ${isWishlisted(product.id) ? 'fill-rose-500 text-rose-500' : ''}`} />
              {isWishlisted(product.id) ? 'Saved to wishlist' : 'Add to wishlist'}
            </button>
            <button
              onClick={handleAddToCart}
              disabled={product.stock === 0}
              className={`w-full py-3 px-4 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer ${
                product.stock === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : justAdded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {justAdded ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Added to Cart</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  <span>Add to Shopping Cart</span>
                </>
              )}
            </button>

            <button
              onClick={handleBuyNow}
              disabled={product.stock === 0}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-40"
            >
              Buy now
            </button>
          </div>

          {/* Delivery & Trust Highlights */}
          <div className="pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-700" />
              <span>Complimentary shipping on orders above ₹2,000</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-700" />
              <span>Secure payment confirmation</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Products & Customers Also Viewed Section */}
      {recommendedProducts.length > 0 && (
        <div className="pt-10 border-t border-slate-200 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Recommended for you</p>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Customers Also Viewed</h3>
            </div>
            <button
              onClick={onBack}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
            >
              Explore all in {formatCategoryLabel(product.category)}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recommendedProducts.map((rec) => (
              <div
                key={rec.id}
                onClick={() => onSelectProduct?.(rec.id)}
                className="group bg-white rounded-2xl border border-slate-200/90 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 mb-3">
                    <ProductImage
                      src={rec.image}
                      name={rec.name}
                      category={rec.category}
                      sku={rec.sku}
                      className="h-full w-full"
                      imageClassName="h-full w-full object-cover group-hover:scale-105 transition-transform"
                      showIllustrationLabel
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold">
                      Recommended
                    </div>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase">{formatCategoryLabel(rec.category)}</p>
                  <h4 className="text-xs font-bold text-slate-900 line-clamp-1 group-hover:text-amber-600 transition-colors mt-0.5">
                    {rec.name}
                  </h4>
                  {rec.numReviews > 0 && <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{rec.rating.toFixed(1)}</span>
                    <span>({rec.numReviews})</span>
                  </div>}
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-900 font-mono">
                    ₹{rec.price.toLocaleString('en-IN')}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart(rec, 1);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <ShoppingBag className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
