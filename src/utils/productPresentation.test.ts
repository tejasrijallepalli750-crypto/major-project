import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { OLIST_CATEGORY_IMAGE_MAP } from '../data/olistCategoryImageMap';
import {
  formatCategoryLabel,
  getOlistCategoryImage,
  getOlistCategoryPhotoPath,
  getProductImageSource,
} from './productPresentation';

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

test('Olist display ignores an assigned per-product image and uses only its category mapping', () => {
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

test('Olist product image resolution uses approved category photos and preserves non-Olist images', () => {
  assert.equal(
    getProductImageSource('OLIST-0123456789abcdef0123456789abcdef', 'computers', '/images/products/unrelated.jpg'),
    '/images/products/pexels-8534378.jpg',
  );
  assert.equal(
    getProductImageSource('AURA-001', 'computers', '/images/products/aura-product.jpg'),
    '/images/products/aura-product.jpg',
  );
});
