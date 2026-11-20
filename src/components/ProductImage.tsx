import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import {
  getCategoryArtPath,
  getCustomerProductName,
  getOlistCategoryImage,
  getProductImageSource,
  isOlistCatalogueProductSku,
} from '../utils/productPresentation';

interface ProductImageProps {
  src: string;
  name: string;
  category?: string;
  sku?: string;
  className?: string;
  imageClassName?: string;
  loading?: 'eager' | 'lazy';
  showIllustrationLabel?: boolean;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  name,
  category,
  sku,
  className = '',
  imageClassName = 'h-full w-full object-cover',
  loading = 'lazy',
}) => {
  const [failedSource, setFailedSource] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);
  const isOlistProduct = isOlistCatalogueProductSku(sku || '');
  const categoryImage = isOlistProduct ? getOlistCategoryImage(category) : undefined;
  const customerName = getCustomerProductName({ name, sku });
  const primarySrc = getProductImageSource(sku || '', category, src);
  const fallbackSrc = categoryImage?.illustrationPath || (category ? getCategoryArtPath(category) : '');
  const imageSrc = failedSource
    ? fallbackSrc && fallbackSrc !== primarySrc ? fallbackSrc : ''
    : primarySrc;

  useEffect(() => {
    setFailedSource(false);
    setFailedFallback(false);
  }, [primarySrc, fallbackSrc]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {imageSrc && !failedFallback ? (
        <img
          src={imageSrc}
          alt={customerName}
          onError={() => {
            if (!failedSource) setFailedSource(true);
            else setFailedFallback(true);
          }}
          className={imageClassName}
          loading={loading}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 text-slate-500"
          role="img"
          aria-label={`${customerName} image unavailable`}
        >
          <ImageOff className="h-8 w-8" aria-hidden="true" />
          <span className="text-[10px] font-medium">Image unavailable</span>
        </div>
      )}
    </div>
  );
};
