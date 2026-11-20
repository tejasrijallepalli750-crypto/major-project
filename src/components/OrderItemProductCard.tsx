import React from 'react';
import { OrderItem } from '../types';
import { getCustomerProductName, isEstimatedOlistPrice } from '../utils/productPresentation';
import { ProductImage } from './ProductImage';

interface OrderItemProductCardProps {
  item: OrderItem;
  onNavigate: (view: string, param?: string) => void;
}

export const navigateToOrderedProduct = (
  productId: string,
  onNavigate: OrderItemProductCardProps['onNavigate'],
): boolean => {
  if (!productId.trim()) return false;
  onNavigate('product-detail', productId);
  return true;
};

export const OrderItemProductCard = ({
  item,
  onNavigate,
}: OrderItemProductCardProps): React.ReactElement => {
  const productName = getCustomerProductName(item);
  const productId = typeof item.product === 'string' ? item.product : '';
  const productContent = (
    <>
      <ProductImage
        src={item.image}
        name={item.name}
        category={item.category}
        sku={item.sku}
        className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white"
        imageClassName="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="block text-xs font-semibold text-slate-900 truncate">{productName}</span>
        <span className="block text-[11px] text-slate-500 font-mono">
          {item.quantity} × ₹{item.price.toLocaleString('en-IN')}
        </span>
        {isEstimatedOlistPrice(item.sku) && (
          <span className="block text-[10px] text-slate-500">Reference price estimate</span>
        )}
        {!productId.trim() && (
          <span className="block text-[10px] text-amber-700" role="status">
            Product details are unavailable.
          </span>
        )}
      </span>
    </>
  );

  if (!productId.trim()) {
    return (
      <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl">
        {productContent}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigateToOrderedProduct(productId, onNavigate)}
      aria-label={`View product details for ${productName}`}
      className="group flex w-full items-center gap-3 rounded-xl p-2 bg-slate-50 text-left transition-colors hover:bg-slate-100 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 cursor-pointer"
    >
      {productContent}
    </button>
  );
};
