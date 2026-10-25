import React, { useEffect, useState } from 'react';
import {
  getCategoryArtPath,
  getOlistCategoryImage,
  getProductImageSource,
  isOlistCatalogueProductSku,
  isOlistEnrichedImagePath,
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
          alt={name}
          onError={() => {
            if (!failedSource) setFailedSource(true);
            else setFailedFallback(true);
          }}
          className={imageClassName}
          loading={loading}
        />
      ) : (
        <div className="h-full w-full bg-white" role="img" aria-label={`${name} image unavailable`}>
        </div>
      )}
      {isOlistProduct && (
        <span className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm">
          {categoryImage?.sourceType === 'approved-photo'
            ? 'Representative category photo, not original product photo'
            : isOlistEnrichedImagePath(primarySrc)
              ? 'Generated representative visual'
              : 'Category illustration, not original product photo'}
        </span>
      )}
    </div>
  );
};
