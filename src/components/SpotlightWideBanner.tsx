import React from 'react';
import { ArrowRight, PackageCheck } from 'lucide-react';
import { Product } from '../types';
import { formatCategoryLabel } from '../utils/productPresentation';
import { ProductImage } from './ProductImage';

interface SpotlightWideBannerProps {
  product: Product;
  onSelectProduct: (productId: string) => void;
}

export const SpotlightWideBanner: React.FC<SpotlightWideBannerProps> = ({
  product,
  onSelectProduct,
}) => (
  <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
    <div className="grid overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 via-rose-50 to-orange-100 shadow-xl md:grid-cols-2">
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
          {formatCategoryLabel(product.category)}{product.brand ? ` · ${product.brand}` : ''}
        </p>
        <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
          {product.name}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-700">
          {product.description}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <span className="text-2xl font-black text-amber-900">
            ₹{product.price.toLocaleString('en-IN')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <PackageCheck className="h-4 w-4 text-emerald-700" />
            {product.stock > 0 ? 'In stock' : 'Currently out of stock'}
          </span>
        </div>
        <button
          onClick={() => onSelectProduct(product.id)}
          className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 shadow-sm transition-colors hover:bg-amber-300"
        >
          View product <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <button
        onClick={() => onSelectProduct(product.id)}
        aria-label={`View ${product.name}`}
        className="group relative min-h-64 cursor-pointer overflow-hidden bg-white/60 md:min-h-full"
      >
        <ProductImage
          src={product.image}
          name={product.name}
          category={product.category}
          sku={product.sku}
          className="absolute inset-0 h-full w-full"
          imageClassName="h-full w-full object-contain p-8 transition-transform duration-300 group-hover:scale-105"
          showIllustrationLabel
        />
      </button>
    </div>
  </section>
);
