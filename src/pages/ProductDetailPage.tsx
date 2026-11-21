import React, { useState, useEffect } from 'react';
import { Heart, Star, ShoppingBag, ShieldCheck, Truck, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { Review } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import {
  formatCategoryLabel,
  getCustomerProductBrand,
  getCustomerProductDescription,
  getCustomerProductFeatures,
  getCustomerProductName,
  getAvailablePurchaseStock,
  getPurchaseUnavailableReason,
  isDemoPurchase,
  isEstimatedOlistPrice,
  isInventoryVerified,
} from '../utils/productPresentation';
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
  const { user } = useAuth();
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const [product, setProduct] = useState<Product | null>(null);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [reviewEligibilityChecked, setReviewEligibilityChecked] = useState(false);
  const [isEligibleToReview, setIsEligibleToReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
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

  useEffect(() => {
    let active = true;
    setIsLoadingReviews(true);
    api.getProductReviews(productId)
      .then((response) => {
        if (active) setReviews(response.data);
      })
      .catch((error) => {
        if (active) setReviewError(error instanceof Error ? error.message : 'Failed to load product reviews.');
      })
      .finally(() => {
        if (active) setIsLoadingReviews(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  useEffect(() => {
    let active = true;
    setReviewEligibilityChecked(false);
    setIsEligibleToReview(false);
    if (!user) {
      setReviewEligibilityChecked(true);
      return () => {
        active = false;
      };
    }

    api.getMyOrders()
      .then((response) => {
        if (!active) return;
        setIsEligibleToReview(response.data.some((order) =>
          (order.isPaid || order.isDelivered || order.status === 'Delivered')
          && order.orderItems.some((item) => item.product === productId)));
      })
      .catch((error) => {
        if (active) {
          setReviewError(error instanceof Error ? error.message : 'Unable to verify review eligibility.');
        }
      })
      .finally(() => {
        if (active) setReviewEligibilityChecked(true);
      });
    return () => {
      active = false;
    };
  }, [productId, user?.id]);

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

  const inventoryVerified = isInventoryVerified(product.inventoryStatus);
  const demoProduct = isDemoPurchase(product);
  const availableStock = getAvailablePurchaseStock(product);
  const canPurchase = availableStock > 0;
  const purchaseUnavailableReason = getPurchaseUnavailableReason(product);
  const productName = getCustomerProductName(product);
  const productBrand = getCustomerProductBrand(product.brand);
  const productDescription = getCustomerProductDescription(product.description);

  const handleAddToCart = () => {
    if (canPurchase) {
      addToCart(product, quantity);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1800);
    }
  };

  const handleBuyNow = () => {
    if (canPurchase) {
      addToCart(product, quantity);
      onCheckout();
    }
  };

  const handleSubmitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setReviewError(null);
    setReviewSuccess(null);
    setIsSubmittingReview(true);
    try {
      const response = await api.createProductReview(productId, {
        rating: reviewRating,
        comment: reviewComment,
      });
      setReviews((current) => [response.data, ...current]);
      setProduct((current) => current ? { ...current, ...response.productRating } : current);
      setReviewComment('');
      setReviewSuccess('Your review has been submitted.');
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Failed to submit your review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const hasReviewed = Boolean(user && reviews.some((review) => review.userId === user.id));

  const visibleFeatures = getCustomerProductFeatures(product.features);

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
              {productBrand && <div className="p-3 bg-slate-50 rounded-lg flex justify-between">
                <span className="text-slate-500">Brand / Manufacturer:</span>
                <span className="font-semibold text-slate-800">{productBrand}</span>
              </div>}
              {(inventoryVerified || demoProduct) && (
                <div className="p-3 bg-slate-50 rounded-lg flex justify-between">
                  <span className="text-slate-500">Availability:</span>
                  <span className={`font-semibold ${canPurchase ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {demoProduct
                      ? canPurchase ? `${availableStock} demo units available` : 'Demo stock unavailable'
                      : canPurchase ? `${availableStock} units available` : 'Out of stock'}
                  </span>
                </div>
              )}
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
              {productBrand && <span>{productBrand}</span>}
              {productBrand && <span aria-hidden="true">·</span>}
              <span>{formatCategoryLabel(product.category)}</span>
            </div>

            {/* Product Title */}
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {productName}
            </h1>

            {/* Rating */}
            {product.numReviews > 0 && <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1 text-xs text-slate-700">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-bold">{product.rating.toFixed(1)}</span>
                <span className="text-slate-400 font-normal">({product.numReviews} customer reviews)</span>
              </div>
            </div>}
          </div>

          {/* Pricing in INR */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
                ₹{product.price.toLocaleString('en-IN')}
              </span>
            </div>
            {isEstimatedOlistPrice(product.sku) && (
              <p className="mt-1 text-xs text-amber-700">
                Reference price estimate.
              </p>
            )}
          </div>
          {demoProduct && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] leading-relaxed text-violet-800">
              DEMO / TEST checkout only. No real payment is collected, physical stock is unchanged, and no shipment is promised.
            </div>
          )}

          {/* Prose Description */}
          {productDescription && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {productDescription}
            </p>
          )}

          {/* Quantity Selector & Stock State */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Select Quantity</span>
              <span className="text-xs text-slate-500">
                {demoProduct
                  ? canPurchase ? `${availableStock} demo units available` : 'Demo stock unavailable'
                  : canPurchase ? `${availableStock} units in stock` : inventoryVerified ? 'Out of stock' : null}
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
                  onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                  disabled={!canPurchase || quantity >= availableStock}
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
              disabled={!canPurchase}
              title={!canPurchase ? purchaseUnavailableReason : undefined}
              aria-label={canPurchase ? `Add ${productName} to cart` : `${productName}: ${purchaseUnavailableReason}`}
              className={`w-full py-3 px-4 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer ${
                !canPurchase
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
              disabled={!canPurchase}
              title={!canPurchase ? purchaseUnavailableReason : undefined}
              aria-label={canPurchase ? `Buy ${productName} now` : `Buy now unavailable: ${purchaseUnavailableReason}`}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-40"
            >
              {demoProduct ? 'Start TEST demo checkout' : 'Buy now'}
            </button>
            {!canPurchase && purchaseUnavailableReason && (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{purchaseUnavailableReason}</span>
              </p>
            )}
          </div>

          {/* Delivery & Trust Highlights */}
          <div className="pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-700" />
              <span>{demoProduct ? 'No physical goods will be shipped' : 'Complimentary shipping on orders above ₹2,000'}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-700" />
              <span>{demoProduct ? 'Razorpay TEST mode only' : 'Secure payment confirmation'}</span>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6" aria-labelledby="product-reviews-heading">
        <div>
          <h2 id="product-reviews-heading" className="text-xl font-bold text-slate-900">Customer Reviews</h2>
          {product.numReviews > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {product.rating.toFixed(1)} out of 5 · {product.numReviews} review{product.numReviews === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {reviewError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {reviewError}
          </p>
        )}
        {reviewSuccess && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            {reviewSuccess}
          </p>
        )}

        {user && reviewEligibilityChecked && isEligibleToReview && !hasReviewed && (
          <form onSubmit={handleSubmitReview} className="space-y-4 rounded-xl bg-slate-50 p-4">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-slate-700">Your rating</legend>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
                    aria-pressed={reviewRating === rating}
                    onClick={() => setReviewRating(rating)}
                    className="rounded p-1 text-amber-500 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
                  >
                    <Star className={`h-5 w-5 ${rating <= reviewRating ? 'fill-amber-400' : ''}`} />
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block text-xs font-semibold text-slate-700">
              Your review
              <textarea
                required
                minLength={1}
                maxLength={2000}
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                rows={4}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-xs font-normal"
                placeholder="Share your experience with this product"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmittingReview || !reviewComment.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmittingReview ? 'Submitting...' : 'Submit review'}
            </button>
          </form>
        )}
        {user && reviewEligibilityChecked && isEligibleToReview && hasReviewed && (
          <p className="text-xs text-slate-600">You have already reviewed this product.</p>
        )}
        {user && reviewEligibilityChecked && !isEligibleToReview && (
          <p className="text-xs text-slate-600">A paid or delivered order containing this product is required to leave a review.</p>
        )}
        {!user && <p className="text-xs text-slate-600">Sign in and purchase this product to leave a review.</p>}

        {isLoadingReviews ? (
          <p className="text-xs text-slate-500">Loading reviews...</p>
        ) : reviews.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {reviews.map((review) => (
              <li key={review.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold text-slate-800">{review.userName}</p>
                  <time className="text-[11px] text-slate-500" dateTime={review.createdAt}>
                    {new Date(review.createdAt).toLocaleDateString()}
                  </time>
                </div>
                <div className="mt-1 flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={`h-3.5 w-3.5 ${star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                  ))}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{review.comment}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
                      {getCustomerProductName(rec)}
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
                  {isEstimatedOlistPrice(rec.sku) && (
                    <span className="text-[10px] text-slate-500">Reference estimate</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart(rec, 1);
                    }}
                    disabled={getAvailablePurchaseStock(rec) < 1}
                    title={getAvailablePurchaseStock(rec) < 1
                      ? "This item can't be added to your cart right now."
                      : undefined}
                    aria-label={getAvailablePurchaseStock(rec) < 1
                      ? `${getCustomerProductName(rec)} cannot be added to cart right now`
                      : `Add ${getCustomerProductName(rec)} to cart`}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
