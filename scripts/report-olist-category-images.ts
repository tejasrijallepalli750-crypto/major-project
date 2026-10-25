import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCommerciallyUsableLicense, OlistImageSourceProduct } from './olist-image-enrichment';
import { parseOlistCsv } from './olist-product-importer';
import { OLIST_CATEGORY_IMAGE_MAP } from '../src/data/olistCategoryImageMap';
import {
  formatCategoryLabel,
  getOlistCategoryImage,
  OlistCategoryDefinitionWithPhoto,
} from '../src/utils/productPresentation';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'dataset', 'olist_raw');
const OUTPUT_ROOT = path.join(ROOT, 'data', 'olist-image-enrichment', 'category-coverage');
const PUBLIC_ROOT = path.join(ROOT, 'public');

interface CategoryCoverageRow {
  sourceCategory: string;
  categoryKey: string;
  displayCategory: string;
  productCount: number;
  imageType: 'approved-photo' | 'illustration' | 'missing';
  imagePath: string;
  illustrationFamily: string;
  sourceCategoryPhotoApproved: boolean;
  issue?: string;
}

export interface OlistCategoryCoverage {
  generatedAt: string;
  sourceProductCount: number;
  sourceCategoryCount: number;
  translationRowCount: number;
  uncategorizedProductCount: number;
  categoriesWithApprovedPhotos: number;
  categoriesUsingIllustrations: number;
  categoriesMissingImages: number;
  productsWithApprovedCategoryPhotos: number;
  productsUsingCategoryIllustrations: number;
  productsMissingCategoryImages: number;
  categories: CategoryCoverageRow[];
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] || character);

const readCsv = <TRow extends Record<string, string>>(filename: string): TRow[] => {
  const filePath = path.resolve(SOURCE_ROOT, filename);
  if (!filePath.startsWith(`${SOURCE_ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
    throw new Error(`Required Olist source file is missing: ${filename}`);
  }
  return parseOlistCsv<TRow>(fs.readFileSync(filePath, 'utf8'));
};

const validApprovedPhoto = (
  definition: OlistCategoryDefinitionWithPhoto,
  publicRoot: string,
): boolean => {
  const photo = definition.approvedPhoto;
  if (!photo || photo.reviewStatus !== 'approved'
    || !photo.path.startsWith('/images/olist-category-photos/')
    || !photo.creator.trim()
    || !/^https:\/\//i.test(photo.sourceUrl)
    || !photo.license.trim()
    || !/^https:\/\//i.test(photo.licenseUrl)
    || !photo.attribution.trim()
    || !/^[a-f\d]{64}$/i.test(photo.sha256)
    || !isCommerciallyUsableLicense(photo.license, photo.licenseUrl)) {
    return false;
  }
  const imagePath = path.resolve(publicRoot, `.${photo.path}`);
  if (!imagePath.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(imagePath)) return false;
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex');
  return sha256 === photo.sha256;
};

export const buildOlistCategoryCoverage = (
  products: readonly OlistImageSourceProduct[],
  translationRows: readonly { product_category_name: string; product_category_name_english: string }[],
  map: readonly (OlistCategoryDefinitionWithPhoto)[] = OLIST_CATEGORY_IMAGE_MAP,
  publicRoot = PUBLIC_ROOT,
): OlistCategoryCoverage => {
  const translations = new Map(translationRows.map((row) => [
    row.product_category_name.trim(),
    row.product_category_name_english.trim(),
  ]));
  const mapBySource = new Map(map.map((definition) => [definition.sourceCategory, definition]));
  const counts = new Map<string, number>();
  for (const product of products) {
    const sourceCategory = product.product_category_name.trim();
    const key = sourceCategory || '';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const sourceCategories = [...counts.keys()].sort((left, right) => left.localeCompare(right));
  const missingDefinitions = sourceCategories.filter((category) => !mapBySource.has(category));
  const missingSourceDefinitions = map.filter((definition) => definition.sourceCategory
    && !counts.has(definition.sourceCategory));
  if (missingDefinitions.length || missingSourceDefinitions.length) {
    throw new Error(`Category image map does not match Olist source categories. Unmapped: ${missingDefinitions.join(', ') || 'none'}; unused: ${missingSourceDefinitions.map((entry) => entry.sourceCategory).join(', ') || 'none'}.`);
  }

  const categories = sourceCategories.map((sourceCategory): CategoryCoverageRow => {
    const definition = mapBySource.get(sourceCategory);
    if (!definition) throw new Error(`Category mapping unexpectedly missing for "${sourceCategory || '(uncategorized)'}".`);
    const categoryKey = sourceCategory
      ? translations.get(sourceCategory) || definition.categoryKey
      : definition.categoryKey;
    if (sourceCategory && categoryKey !== definition.categoryKey) {
      throw new Error(`Category translation differs from the central image map for "${sourceCategory}".`);
    }
    const image = getOlistCategoryImage(categoryKey);
    const photoIsApproved = image.sourceType === 'approved-photo'
      && validApprovedPhoto(definition, publicRoot);
    const imagePath = photoIsApproved ? image.path : image.illustrationPath;
    const absolutePath = path.resolve(publicRoot, `.${imagePath}`);
    const localPathIsSafe = imagePath.startsWith('/images/')
      && !imagePath.startsWith('//')
      && absolutePath.startsWith(`${path.resolve(publicRoot)}${path.sep}`);
    const imageExists = localPathIsSafe && fs.existsSync(absolutePath);
    const imageType = imageExists ? photoIsApproved ? 'approved-photo' : 'illustration' : 'missing';
    const issue = image.sourceType === 'approved-photo' && !photoIsApproved
      ? 'Configured photo failed approval, license, path, or hash validation; illustration fallback is used.'
      : imageExists ? undefined : 'No valid local image is available.';
    return {
      sourceCategory: sourceCategory || '(uncategorized)',
      categoryKey,
      displayCategory: sourceCategory ? formatCategoryLabel(categoryKey) : 'Uncategorized',
      productCount: counts.get(sourceCategory) || 0,
      imageType,
      imagePath,
      illustrationFamily: definition.illustrationFamily,
      sourceCategoryPhotoApproved: photoIsApproved,
      ...(issue ? { issue } : {}),
    };
  });

  const categoriesWithApprovedPhotos = categories.filter((category) => category.imageType === 'approved-photo').length;
  const categoriesUsingIllustrations = categories.filter((category) => category.imageType === 'illustration').length;
  const categoriesMissingImages = categories.filter((category) => category.imageType === 'missing').length;
  const productsWithApprovedCategoryPhotos = categories
    .filter((category) => category.imageType === 'approved-photo')
    .reduce((sum, category) => sum + category.productCount, 0);
  const productsUsingCategoryIllustrations = categories
    .filter((category) => category.imageType === 'illustration')
    .reduce((sum, category) => sum + category.productCount, 0);
  const productsMissingCategoryImages = categories
    .filter((category) => category.imageType === 'missing')
    .reduce((sum, category) => sum + category.productCount, 0);
  return {
    generatedAt: new Date().toISOString(),
    sourceProductCount: products.length,
    sourceCategoryCount: categories.filter((category) => category.sourceCategory !== '(uncategorized)').length,
    translationRowCount: translationRows.length,
    uncategorizedProductCount: categories.find((category) => category.sourceCategory === '(uncategorized)')?.productCount || 0,
    categoriesWithApprovedPhotos,
    categoriesUsingIllustrations,
    categoriesMissingImages,
    productsWithApprovedCategoryPhotos,
    productsUsingCategoryIllustrations,
    productsMissingCategoryImages,
    categories,
  };
};

export const renderOlistCategoryCoverageHtml = (coverage: OlistCategoryCoverage): string => {
  const rows = coverage.categories.map((category) => `<tr>
    <td>${escapeHtml(category.sourceCategory)}</td>
    <td>${escapeHtml(category.displayCategory)}</td>
    <td>${category.productCount}</td>
    <td>${escapeHtml(category.imageType)}</td>
    <td>${escapeHtml(category.imagePath)}</td>
    <td>${escapeHtml(category.illustrationFamily)}</td>
    <td>${category.sourceCategoryPhotoApproved ? 'Yes' : 'No'}</td>
    <td>${escapeHtml(category.issue || '')}</td>
  </tr>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Olist category image coverage</title>
    <style>body{font:14px system-ui,sans-serif;color:#182a3a;margin:24px}p{line-height:1.5}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5df;padding:8px;text-align:left;vertical-align:top}th{background:#edf2f7;position:sticky;top:0}code{overflow-wrap:anywhere}</style>
    <h1>Olist category image coverage</h1>
    <p>Source-only report; no MongoDB or catalogue records were accessed or modified. Olist source product rows: ${coverage.sourceProductCount}. Categories: ${coverage.sourceCategoryCount}, plus ${coverage.uncategorizedProductCount} uncategorized records.</p>
    <ul><li>Categories with approved, licensed representative photos: ${coverage.categoriesWithApprovedPhotos}</li>
    <li>Categories using an existing category illustration: ${coverage.categoriesUsingIllustrations}</li>
    <li>Categories missing a valid local image: ${coverage.categoriesMissingImages}</li>
    <li>Products currently mapped to approved category photos: ${coverage.productsWithApprovedCategoryPhotos}</li>
    <li>Products currently mapped to category illustrations: ${coverage.productsUsingCategoryIllustrations}</li>
    <li>Products without a local category image: ${coverage.productsMissingCategoryImages}</li></ul>
    <p>Olist product records do not contain product names or product image URLs. Category photos, when later approved, are representative only and are not original Olist product photographs. Candidate and previously rejected pilot images are not treated as approved photos.</p>
    <table><thead><tr><th>Original category</th><th>Translated/display category</th><th>Products</th><th>Image source</th><th>Mapped local path</th><th>Illustration family</th><th>Photo approved</th><th>Issue</th></tr></thead><tbody>${rows}</tbody></table>
  </html>`;
};

export const writeOlistCategoryCoverage = (
  coverage: OlistCategoryCoverage,
  outputRoot = OUTPUT_ROOT,
): void => {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`);
  fs.writeFileSync(path.join(outputRoot, 'coverage.html'), renderOlistCategoryCoverageHtml(coverage));
};

export const generateOlistCategoryCoverage = (): OlistCategoryCoverage => {
  const products = readCsv<OlistImageSourceProduct>('olist_products_dataset.csv');
  const translations = readCsv<{ product_category_name: string; product_category_name_english: string }>(
    'product_category_name_translation.csv',
  );
  return buildOlistCategoryCoverage(products, translations);
};

const main = (): void => {
  if (process.argv.length > 2) throw new Error('This offline report command does not accept arguments or perform network requests.');
  const coverage = generateOlistCategoryCoverage();
  writeOlistCategoryCoverage(coverage);
  console.log(`Olist source product records: ${coverage.sourceProductCount}.`);
  console.log(`Mapped categories: ${coverage.sourceCategoryCount} plus uncategorized.`);
  console.log(`Categories with approved photos: ${coverage.categoriesWithApprovedPhotos}.`);
  console.log(`Categories using illustrations: ${coverage.categoriesUsingIllustrations}.`);
  console.log(`Categories missing images: ${coverage.categoriesMissingImages}.`);
  console.log(`Products with category images: ${coverage.productsWithApprovedCategoryPhotos + coverage.productsUsingCategoryIllustrations}/${coverage.sourceProductCount}.`);
  console.log(`Coverage report: ${path.join(OUTPUT_ROOT, 'coverage.html')}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Olist category coverage failed: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    process.exitCode = 1;
  }
}
