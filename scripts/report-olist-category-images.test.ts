import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { OLIST_CATEGORY_IMAGE_MAP } from '../src/data/olistCategoryImageMap';
import {
  buildOlistCategoryCoverage,
  renderOlistCategoryCoverageHtml,
  writeOlistCategoryCoverage,
} from './report-olist-category-images';
import { OlistImageSourceProduct } from './olist-image-enrichment';

const sourceProduct = (productId: string, category: string): OlistImageSourceProduct => ({
  product_id: productId,
  product_category_name: category,
  product_name_lenght: '',
  product_description_lenght: '',
  product_photos_qty: '',
  product_weight_g: '',
  product_length_cm: '',
  product_height_cm: '',
  product_width_cm: '',
});

test('coverage checks every mapped source category and counts uncategorized records', () => {
  const products = OLIST_CATEGORY_IMAGE_MAP.map((definition, index) =>
    sourceProduct(`product-${index}`, definition.sourceCategory));
  const translations = OLIST_CATEGORY_IMAGE_MAP
    .filter((definition) => definition.sourceCategory && !['pc_gamer', 'portateis_cozinha_e_preparadores_de_alimentos'].includes(definition.sourceCategory))
    .map((definition) => ({
      product_category_name: definition.sourceCategory,
      product_category_name_english: definition.categoryKey,
    }));
  const coverage = buildOlistCategoryCoverage(products, translations);
  assert.equal(coverage.sourceProductCount, 74);
  assert.equal(coverage.sourceCategoryCount, 73);
  assert.equal(coverage.uncategorizedProductCount, 1);
  assert.equal(coverage.categoriesWithApprovedPhotos, 0);
  assert.equal(coverage.categoriesUsingIllustrations, 74);
  assert.equal(coverage.categoriesMissingImages, 0);
  assert.equal(coverage.productsUsingCategoryIllustrations, 74);
  assert.equal(coverage.productsMissingCategoryImages, 0);
  assert.throws(() => buildOlistCategoryCoverage(
    [sourceProduct('unmapped', 'unmapped-category')],
    [],
  ), /does not match Olist source categories/);
});

test('coverage report records category counts, image fallback status, and writes JSON and HTML', () => {
  const definition = OLIST_CATEGORY_IMAGE_MAP.find((item) => item.sourceCategory === 'pcs');
  assert.ok(definition);
  const coverage = buildOlistCategoryCoverage(
    [sourceProduct('computer-1', definition.sourceCategory)],
    [{ product_category_name: definition.sourceCategory, product_category_name_english: definition.categoryKey }],
    [definition, OLIST_CATEGORY_IMAGE_MAP.find((item) => item.sourceCategory === '')!],
  );
  const html = renderOlistCategoryCoverageHtml(coverage);
  assert.match(html, /categories using an existing category illustration/i);
  assert.match(html, /not original Olist product photographs/i);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'olist-category-coverage-'));
  try {
    writeOlistCategoryCoverage(coverage, directory);
    const parsed = JSON.parse(fs.readFileSync(path.join(directory, 'coverage.json'), 'utf8')) as typeof coverage;
    assert.equal(parsed.categories.length, 1);
    assert.equal(fs.existsSync(path.join(directory, 'coverage.html')), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
