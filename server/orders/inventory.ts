export interface StockAllocationOperation {
  filter: {
    id: string;
    status: 'active';
    stock: { $gte: number };
  };
  update: {
    $inc: { stock: number };
  };
}

export const makeStockAllocationOperation = (productId: string, quantity: number): StockAllocationOperation => {
  if (!productId || !Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError('Stock allocation requires a product ID and a positive whole quantity.');
  }
  return {
    filter: { id: productId, status: 'active', stock: { $gte: quantity } },
    update: { $inc: { stock: -quantity } },
  };
};
