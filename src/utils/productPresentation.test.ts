import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { OLIST_CATEGORY_IMAGE_MAP } from '../data/olistCategoryImageMap';
import {
  formatCategoryLabel,
  getAvailablePurchaseStock,
  getPurchaseUnavailableReason,
  getCustomerProductBrand,
  getCustomerProductDescription,
  getCustomerProductFeatures,
  getCustomerProductName,
  getOlistCategoryImage,
  getOlistCategoryPhotoPath,
  getProductImageSource,
} from './productPresentation';

test('purchase availability uses only the explicitly selected inventory source', () => {
  assert.equal(getAvailablePurchaseStock({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: false,
    demoEligible: true,
    demoPurchasingAvailable: true,
    demoStock: 5,
  }), 0);
  assert.equal(getAvailablePurchaseStock({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: true,
    demoEligible: false,
    demoPurchasingAvailable: true,
    demoStock: 5,
  }), 0);
  assert.equal(getAvailablePurchaseStock({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: true,
    demoEligible: true,
    demoPurchasingAvailable: true,
    demoStock: 3,
    canPurchase: true,
  }), 3);
  assert.equal(getAvailablePurchaseStock({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: true,
    demoEligible: true,
    demoPurchasingAvailable: false,
    demoStock: 3,
    canPurchase: true,
  }), 0);
  assert.equal(getAvailablePurchaseStock({
    stock: 2,
    inventoryStatus: 'verified',
    canPurchase: true,
  }), 2);
  assert.equal(getAvailablePurchaseStock({
    stock: 2,
    inventoryStatus: 'verified',
    status: 'active',
  }), 0);
  assert.match(getPurchaseUnavailableReason({
    stock: 2,
    inventoryStatus: 'verified',
    status: 'active',
  }) || '', /server did not provide purchase eligibility/i);
});

test('purchase controls explain why unavailable inventory cannot be purchased', () => {
  assert.match(getPurchaseUnavailableReason({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: true,
    demoEligible: false,
  }) || '', /not selected for demonstration purchases/i);
  assert.match(getPurchaseUnavailableReason({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: true,
    demoEligible: true,
    demoPurchasingAvailable: false,
    demoStock: 5,
  }) || '', /Razorpay TEST setup/i);
  assert.match(getPurchaseUnavailableReason({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: true,
    demoEligible: true,
    demoPurchasingAvailable: true,
    demoStock: 0,
  }) || '', /no demonstration stock/i);
  assert.match(getPurchaseUnavailableReason({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: false,
  }) || '', /not verified.*disabled by the server/i);
  assert.match(getPurchaseUnavailableReason({
    stock: 20,
    inventoryStatus: 'unverified',
  }) || '', /server did not provide purchase eligibility/i);
  assert.equal(getPurchaseUnavailableReason({
    stock: 20,
    inventoryStatus: 'unverified',
    demoModeEnabled: true,
    demoEligible: true,
    demoPurchasingAvailable: true,
    demoStock: 2,
  }), undefined);
  assert.equal(getAvailablePurchaseStock({
    stock: 10,
    inventoryStatus: 'verified',
    canPurchase: false,
    purchaseUnavailableReason: 'Server says unavailable.',
  }), 0);
  assert.equal(getPurchaseUnavailableReason({
    stock: 10,
    inventoryStatus: 'verified',
    canPurchase: false,
    purchaseUnavailableReason: 'Server says unavailable.',
  }), 'Server says unavailable.');
});

test('the centralized Olist image map covers all 73 source categories and uncategorized products', () => {
  const sourceCategories = OLIST_CATEGORY_IMAGE_MAP.map((definition) => definition.sourceCategory);
  assert.equal(sourceCategories.filter(Boolean).length, 73);
  assert.equal(sourceCategories.filter((sourceCategory) => !sourceCategory).length, 1);
  assert.equal(new Set(sourceCategories).size, 74);
  assert.equal(OLIST_CATEGORY_IMAGE_MAP.filter((definition) => definition.approvedPhoto).length, 24);
  for (const definition of OLIST_CATEGORY_IMAGE_MAP) {
    const image = getOlistCategoryImage(definition.categoryKey);
    assert.equal(
      image.sourceType,
      definition.approvedPhoto ? 'approved-photo' : 'illustration',
      definition.sourceCategory,
    );
    assert.equal(
      image.path,
      definition.approvedPhoto?.path || `/images/catalog-category-art/${definition.illustrationFamily}.svg`,
    );
    assert.equal(
      getOlistCategoryImage(formatCategoryLabel(definition.categoryKey)).path,
      image.path,
      `${definition.categoryKey} display label should resolve to its mapped category image`,
    );
    const assetPath = path.resolve(process.cwd(), 'public', `.${image.path}`);
    assert.equal(fs.existsSync(assetPath), true, `${definition.categoryKey} should map to an existing illustration`);
    if (definition.approvedPhoto) {
      assert.equal(definition.approvedPhoto.provenanceStatus, 'VERIFIED_IMAGE_CONTENT_MATCH');
      assert.equal(definition.approvedPhoto.reviewStatus, 'approved');
      assert.match(definition.approvedPhoto.sha256, /^[a-f\d]{64}$/);
      assert.match(definition.approvedPhoto.sourceImageSha256, /^[a-f\d]{64}$/);
      assert.equal(definition.approvedPhoto.license, 'Pexels License');
      assert.equal(definition.approvedPhoto.licenseUrl, 'https://www.pexels.com/license/');
      assert.equal(definition.approvedPhoto.pHashDistance <= 6, true);
      assert.equal(definition.approvedPhoto.dHashDistance <= 10, true);
    }
  }
  assert.equal(getOlistCategoryImage(undefined).path, '/images/catalog-category-art/general.svg');
});

test('Olist category aliases resolve from source identifiers, translated slugs, and display labels', () => {
  const expected = '/images/products/pexels-16378446.jpg';
  assert.equal(getOlistCategoryImage('beleza_saude').path, expected);
  assert.equal(getOlistCategoryImage('health_beauty').path, expected);
  assert.equal(getOlistCategoryImage('Health & Beauty').path, expected);
  assert.equal(getOlistCategoryImage('pc_gamer').path, '/images/catalog-category-art/technology.svg');
  assert.equal(getOlistCategoryImage('pcs').path, '/images/products/pexels-8534378.jpg');
  assert.equal(getOlistCategoryImage('computers').path, '/images/products/pexels-8534378.jpg');
  assert.equal(getOlistCategoryImage('auto').path, '/images/catalog-category-art/automotive.svg');
});

test('Olist products resolve through their existing category mapping and other images stay unchanged', () => {
  assert.equal(
    getProductImageSource('OLIST-0123456789abcdef0123456789abcdef', 'health_beauty', '/images/products/unrelated.jpg'),
    '/images/products/pexels-16378446.jpg',
  );
  assert.equal(
    getProductImageSource('AURA-001', 'health_beauty', '/images/products/aura-product.jpg'),
    '/images/products/aura-product.jpg',
  );
});

test('only verified Pexels images are mapped and unapproved candidates retain illustration fallbacks', () => {
  assert.equal(getOlistCategoryPhotoPath('health_beauty'), '/images/products/pexels-16378446.jpg');
  assert.equal(getOlistCategoryPhotoPath('computers'), '/images/products/pexels-8534378.jpg');
  assert.equal(getOlistCategoryPhotoPath('office_furniture'), undefined);
  assert.equal(getOlistCategoryImage('office_furniture').path, '/images/catalog-category-art/home.svg');
  assert.equal(getOlistCategoryPhotoPath('food_drink'), undefined);
  assert.equal(getOlistCategoryImage('food_drink').path, '/images/catalog-category-art/food.svg');
  assert.equal(getOlistCategoryImage(undefined).path, '/images/catalog-category-art/general.svg');
});

test('customer product text retains product details while removing source and image labels', () => {
  const product = {
    name: 'Olist Home Essentials product 44BE5793',
    sku: 'OLIST-44BE5793',
  };
  assert.equal(getCustomerProductName(product), 'Home Essentials product 44BE5793');
  assert.equal(getCustomerProductBrand('Olist Historical Catalogue'), '');
  assert.equal(
    getCustomerProductDescription('A catalogue display entry for an Olist product in Home Essentials. The representative category image is not an original Olist product photo. Its INR price is an estimate converted from historical BRL prices.'),
    'Its INR price is an estimate converted from historical BRL prices.',
  );
  assert.deepEqual(
    getCustomerProductFeatures([
      'Olist historical catalogue',
      'Representative category image; not an original Olist product photo',
      'Generated display title based on translated category (home)',
      'Historical BRL average converted to an INR estimate at 18.81 INR per BRL',
    ]),
    ['Historical BRL average converted to an INR estimate at 18.81 INR per BRL'],
  );
});
