import React, { useEffect, useState } from 'react';

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
  className = '',
  imageClassName = 'h-full w-full object-cover',
  loading = 'lazy',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          onError={() => setFailed(true)}
          className={imageClassName}
          loading={loading}
        />
      ) : (
        <div className="h-full w-full bg-white" role="img" aria-label={`${name} image unavailable`}>
        </div>
      )}
    </div>
  );
};
