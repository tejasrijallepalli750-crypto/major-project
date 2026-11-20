export interface StockAllocationOperation {
  filter: {
    id: string;
    status: 'active';
    inventoryStatus: 'verified';
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
    filter: { id: productId, status: 'active', inventoryStatus: 'verified', stock: { $gte: quantity } },
    update: { $inc: { stock: -quantity } },
  };
};

export interface DemoStockAllocationOperation {
  filter: {
    id: string;
    status: 'active';
    demoEligible: true;
    demoStock: { $gte: number };
  };
  update: {
    $inc: { demoStock: number };
  };
}

export const makeDemoStockAllocationOperation = (
  productId: string,
  quantity: number,
): DemoStockAllocationOperation => {
  if (!productId || !Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError('Demo stock allocation requires a product ID and a positive whole quantity.');
  }
  return {
    filter: { id: productId, status: 'active', demoEligible: true, demoStock: { $gte: quantity } },
    update: { $inc: { demoStock: -quantity } },
  };
};
