import React from 'react';
import {
  aboSampleProducts,
  resolveAboSampleImageSrc,
} from '../data/aboSampleCatalog';

export const AboSampleCatalogPage: React.FC = () => (
  <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
    <header className="space-y-3 border-b border-slate-200 pb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Explore more</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Additional products</h1>
      <p className="max-w-3xl text-sm leading-6 text-slate-600">
        These products are available to browse but cannot be purchased from this page.
      </p>
    </header>

    <section aria-label="Additional products" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {aboSampleProducts.map((product) => (
        <article key={`${product.domain}:${product.itemId}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex aspect-[4/3] items-center justify-center bg-slate-50 p-4">
            <img
              src={resolveAboSampleImageSrc(product.imagePath, import.meta.env.BASE_URL)}
              alt={product.title}
              className="h-full w-full object-contain"
              loading="lazy"
              width={product.width}
              height={product.height}
            />
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {product.categoryLabel}
              </span>
            </div>
            <h2 className="text-base font-semibold leading-snug text-slate-900">{product.title}</h2>
            <p className="text-xs text-slate-600">{product.brand}</p>
          </div>
        </article>
      ))}
    </section>
  </div>
);
