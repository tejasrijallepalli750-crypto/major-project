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
    demoStock: {
      $gte: number;
      $lte: number;
      $mod: [number, number];
      $type: 'number';
    };
  };
  update: {
    $inc: { demoStock: number };
  };
}

export const makeDemoStockAllocationOperation = (
  productId: string,
  quantity: number,
): DemoStockAllocationOperation => {
  if (!productId || !Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError('Demo stock allocation requires a product ID and a positive safe integer quantity.');
  }
  return {
    filter: {
      id: productId,
      status: 'active',
      demoEligible: true,
      demoStock: {
        $gte: quantity,
        $lte: Number.MAX_SAFE_INTEGER,
        $mod: [1, 0],
        $type: 'number',
      },
    },
    update: { $inc: { demoStock: -quantity } },
  };
};

export const getValidDemoStock = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
