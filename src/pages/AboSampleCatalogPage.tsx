import React from 'react';
import {
  ABO_DATASET_ATTRIBUTION,
  ABO_DATASET_LICENSE_URL,
  ABO_DATASET_SOURCE_URL,
  aboSampleProducts,
  resolveAboSampleImageSrc,
} from '../data/aboSampleCatalog';

export const AboSampleCatalogPage: React.FC = () => (
  <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
    <header className="space-y-3 border-b border-slate-200 pb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Separate, read-only dataset sample</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Amazon Berkeley Objects sample catalogue</h1>
      <p className="max-w-3xl text-sm leading-6 text-slate-600">
        Ten listings with each image linked through that listing&apos;s official ABO main-image ID.
        This demonstration is separate from the Brazilian Olist dataset and cannot be added to a
        cart, checked out, or included in orders.
      </p>
    </header>

    <section aria-label="ABO sample products" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {aboSampleProducts.map((product) => (
        <article key={`${product.domain}:${product.itemId}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex aspect-[4/3] items-center justify-center bg-slate-50 p-4">
            <img
              src={resolveAboSampleImageSrc(product.imagePath, import.meta.env.BASE_URL)}
              alt={`${product.title} — image for ABO listing ${product.itemId}`}
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
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Sample only</span>
            </div>
            <h2 className="text-base font-semibold leading-snug text-slate-900">{product.title}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-600">
              <dt>Brand</dt><dd>{product.brand}</dd>
              <dt>Marketplace</dt><dd>{product.domain}</dd>
              <dt>ABO listing</dt><dd><code>{product.itemId}</code></dd>
              <dt>Main image ID</dt><dd><code>{product.mainImageId}</code></dd>
            </dl>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a className="font-medium text-blue-700 underline" href={product.sourceListingUrl} target="_blank" rel="noreferrer">
                Source listing
              </a>
              <a className="font-medium text-blue-700 underline" href={product.sourceImageUrl} target="_blank" rel="noreferrer">
                Source image
              </a>
              <a className="font-medium text-blue-700 underline" href={product.licenseUrl} target="_blank" rel="noreferrer">
                {product.license}
              </a>
            </div>
            <p className="border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
              {product.attribution} {product.imageProcessing} {product.changesMade}
            </p>
          </div>
        </article>
      ))}
    </section>

    <aside className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
      <h2 className="font-semibold text-slate-900">Dataset attribution and separation</h2>
      <p>{ABO_DATASET_ATTRIBUTION}</p>
      <p>
        Licensed under <a className="font-medium text-blue-700 underline" href={ABO_DATASET_LICENSE_URL} target="_blank" rel="noreferrer">Creative Commons Attribution 4.0 International</a>.
        See the <a className="font-medium text-blue-700 underline" href={ABO_DATASET_SOURCE_URL} target="_blank" rel="noreferrer">official ABO dataset</a>.
        Images are 500-pixel CDN derivatives; each record retains its listing ID, main-image ID, source URL, SHA-256, byte size, and processing note.
      </p>
      <p className="font-medium">ABO sample items are not Olist products, are not sellable, and are not affiliated with or endorsed by Amazon.</p>
    </aside>
  </div>
);
