import React, { useState } from 'react';
import { PackagePlus, Plus, Check } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { ProductImage } from './ProductImage';

interface CuratedBundlesSectionProps {
  products: Product[];
  onSelectProduct: (productId: string) => void;
}

export const CuratedBundlesSection: React.FC<CuratedBundlesSectionProps> = ({
  products,
  onSelectProduct,
}) => {
  const { addToCart } = useCart();
  const [bundleAdded, setBundleAdded] = useState(false);

  const item1 = products[0];
  const item2 = products[1];

  if (!item1 || !item2) return null;

  const combinedPrice = item1.price + item2.price;

  const handleAddBundle = () => {
    addToCart(item1, 1);
    addToCart(item2, 1);
    setBundleAdded(true);
    setTimeout(() => setBundleAdded(false), 2000);
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Pair these products
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pick any two products from our current collection and add them to your bag together.
            </p>
          </div>
        </div>

        {/* Bundle layout */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 p-4 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            {/* Item 1 */}
            <div
              onClick={() => onSelectProduct(item1.id)}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200/80 hover:border-slate-400 transition-all cursor-pointer w-full sm:w-72"
            >
              <ProductImage
                src={item1.image}
                name={item1.name}
                category={item1.category}
                sku={item1.sku}
                className="h-16 w-16 shrink-0 rounded-lg"
                imageClassName="h-full w-full object-cover"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{item1.name}</p>
                {item1.brand && <p className="text-xs text-slate-500 mt-0.5">{item1.brand}</p>}
                <p className="text-xs font-black text-slate-900 font-mono mt-1">
                  ₹{item1.price.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Plus Icon */}
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
              <Plus className="w-4 h-4" />
            </div>

            {/* Item 2 */}
            <div
              onClick={() => onSelectProduct(item2.id)}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200/80 hover:border-slate-400 transition-all cursor-pointer w-full sm:w-72"
            >
              <ProductImage
                src={item2.image}
                name={item2.name}
                category={item2.category}
                sku={item2.sku}
                className="h-16 w-16 shrink-0 rounded-lg"
                imageClassName="h-full w-full object-cover"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{item2.name}</p>
                {item2.brand && <p className="text-xs text-slate-500 mt-0.5">{item2.brand}</p>}
                <p className="text-xs font-black text-slate-900 font-mono mt-1">
                  ₹{item2.price.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>

          {/* Equal / Bundle Total Summary */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto shrink-0 justify-end">
            <div className="text-center sm:text-right">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Combined price
              </span>
              <div className="flex items-baseline justify-center sm:justify-end gap-2 mt-0.5">
                <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                  ₹{combinedPrice.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <button
              onClick={handleAddBundle}
              className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                bundleAdded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {bundleAdded ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Bundle Added to Bag</span>
                </>
              ) : (
                <>
                  <PackagePlus className="w-4 h-4" />
                  <span>Add Both to Cart</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
