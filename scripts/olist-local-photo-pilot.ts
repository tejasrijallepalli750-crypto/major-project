import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { OlistImageSourceProduct } from './olist-image-enrichment';

export interface LocalPhotoReviewCard {
  imagePath: string;
  filename: string;
  caption: string;
  description: string;
}

export interface LocalPhotoInventoryEntry extends LocalPhotoReviewCard {
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  format: string;
  validRaster: boolean;
  validationError?: string;
}

export interface LocalPhotoAssignment {
  filename: string;
  translatedCategory: string;
  confidence: number;
  rationale: string;
}

export interface LocalPhotoPilotEntry extends LocalPhotoAssignment {
  sku: string;
  productId: string;
  displayTitle: string;
  category: string;
  sourceImagePath: string;
  caption: string;
  imageFilename: string;
  sha256: string;
  width: number;
  height: number;
  matchType: 'representative-category-match';
  source: 'Existing local Pexels-named photograph';
  license: 'Not recorded in repository; verify terms before production use.';
  validationStatus: 'raster-validated-needs-human-review';
}

export interface LocalPhotoPilotPlan {
  entries: LocalPhotoPilotEntry[];
  missingCategories: string[];
  rejectedPhotos: Array<{ filename: string; reason: string }>;
}

const MIN_IMAGE_DIMENSION = 512;
const MAX_REPORT_IMAGE_DIMENSION = 360;

const photo = (
  filename: string,
  translatedCategory: string,
  confidence: number,
  rationale: string,
): LocalPhotoAssignment => ({ filename, translatedCategory, confidence, rationale });

export const LOCAL_PHOTO_ASSIGNMENTS: readonly LocalPhotoAssignment[] = [
  photo('pexels-16378446.jpg', 'health_beauty', 0.91, 'Skincare pump bottles are visible in the photo and named in its caption.'),
  photo('pexels-28736957.jpg', 'health_beauty', 0.88, 'Mascara is visible and named in the caption.'),
  photo('pexels-21283464.jpg', 'health_beauty', 0.86, 'A skincare cream jar is visible and named in the caption.'),
  photo('pexels-29805437.jpg', 'perfumery', 0.9, 'A perfume bottle is visible and named in the caption.'),
  photo('pexels-14736080.jpg', 'perfumery', 0.89, 'Perfume bottles are visible and named in the caption.'),
  photo('pexels-13870516.jpg', 'computers_accessories', 0.92, 'A computer mouse is visible and named in the caption.'),
  photo('pexels-37459055.jpg', 'computers_accessories', 0.85, 'A desk mat and computer accessories are visible.'),
  photo('pexels-31388429.jpg', 'computers_accessories', 0.84, 'A keyboard and desk mat are visible and named in the caption.'),
  photo('pexels-26889798.jpg', 'computers_accessories', 0.83, 'A desk mat with computer accessories is visible and named in the caption.'),
  photo('pexels-2919003.jpg', 'audio', 0.91, 'Over-ear headphones are visible and named in the caption.'),
  photo('pexels-24602113.jpg', 'audio', 0.91, 'Studio headphones are visible and named in the caption.'),
  photo('pexels-577769.jpg', 'audio', 0.9, 'Over-ear headphones are visible and named in the caption.'),
  photo('pexels-30173139.jpg', 'telephony', 0.8, 'A smartphone is visible; the caption describes it as a phone on a stand.'),
  photo('pexels-18386860.jpg', 'telephony', 0.9, 'Smartphones are visible and named in the caption.'),
  photo('pexels-34291901.jpg', 'telephony', 0.78, 'Wireless earbuds are visible with a laptop; representative of phone accessories.'),
  photo('pexels-18880006.jpg', 'cine_photo', 0.9, 'A camera setup is visible and named in the caption.'),
  photo('pexels-31616831.jpg', 'cine_photo', 0.89, 'A camera rig is visible and named in the caption.'),
  photo('pexels-3892914.jpg', 'cine_photo', 0.91, 'A camera body is clearly visible in the photo and caption.'),
  photo('pexels-38990554.jpg', 'watches_gifts', 0.89, 'A wristwatch is visible and named in the caption.'),
  photo('pexels-10436602.jpg', 'watches_gifts', 0.88, 'A wristwatch is visible and named in the caption.'),
  photo('pexels-15107945.jpg', 'watches_gifts', 0.9, 'A wristwatch is visible and named in the caption.'),
  photo('pexels-36156260.jpg', 'sports_leisure', 0.91, 'Tennis rackets and balls are visible and named in the caption.'),
  photo('pexels-37988076.jpg', 'sports_leisure', 0.9, 'Tennis rackets and balls are visible and named in the caption.'),
  photo('pexels-5739115.jpg', 'sports_leisure', 0.86, 'A tennis racket and ball are visible on a court.'),
  photo('pexels-19214709.jpg', 'garden_tools', 0.9, 'Garden shears are visible and named in the caption.'),
  photo('pexels-4622067.jpg', 'garden_tools', 0.9, 'A metal watering can is visible and named in the caption.'),
  photo('pexels-6231828.jpg', 'garden_tools', 0.86, 'Small garden shovels and a hand cultivator are visible and named in the caption.'),
  photo('pexels-7755314.jpg', 'garden_tools', 0.91, 'A garden trowel is clearly visible and named in the caption.'),
  photo('pexels-9507250.jpg', 'garden_tools', 0.9, 'Several garden tools are visible and named in the caption.'),
  photo('pexels-35630832.jpg', 'garden_tools', 0.91, 'A metal watering can is clearly visible and named in the caption.'),
  photo('pexels-9893931.jpg', 'bed_bath_table', 0.85, 'Bed sheets and pillows are visible and named in the caption.'),
  photo('pexels-212269.jpg', 'bed_bath_table', 0.86, 'Bed sheets and pillows are visible and named in the caption.'),
  photo('pexels-17428224.jpg', 'bed_bath_table', 0.91, 'Rolled bath towels are visible and named in the caption.'),
  photo('pexels-3872899.jpg', 'bed_bath_table', 0.9, 'Bath towels are visible and named in the caption.'),
  photo('pexels-8063882.jpg', 'furniture_decor', 0.86, 'Decorative ceramic vases are visible and named in the caption.'),
  photo('pexels-15028227.jpg', 'furniture_decor', 0.9, 'A ceramic vase is clearly visible and named in the caption.'),
  photo('pexels-5411382.jpg', 'furniture_decor', 0.86, 'Wooden chairs and a table are visible and named in the caption.'),
  photo('pexels-5978655.jpg', 'furniture_decor', 0.87, 'A leather couch is visible and named in the caption.'),
  photo('pexels-8879615.jpg', 'home_appliances', 0.88, 'An electric kettle is visible and named in the caption.'),
  photo('pexels-10965752.jpg', 'home_appliances', 0.91, 'A glass electric kettle is visible and named in the caption.'),
  photo('pexels-12167648.jpg', 'home_appliances', 0.91, 'A vacuum cleaner is visible and named in the caption.'),
  photo('pexels-12167650.jpg', 'home_appliances', 0.91, 'A cordless vacuum cleaner is visible and named in the caption.'),
  photo('pexels-27204268.jpg', 'fashion_bags_accessories', 0.85, 'A handbag is visible and named in the caption.'),
  photo('pexels-13870707.jpg', 'fashion_bags_accessories', 0.91, 'A backpack is visible and named in the caption.'),
  photo('pexels-7085799.jpg', 'fashion_bags_accessories', 0.9, 'Leather wallets are visible and named in the caption.'),
  photo('pexels-2890200.jpg', 'housewares', 0.9, 'A ceramic coffee mug is clearly visible and named in the caption.'),
  photo('pexels-1809127.jpg', 'housewares', 0.91, 'A ceramic coffee mug is clearly visible and named in the caption.'),
  photo('pexels-684152.jpg', 'fashion_shoes', 0.9, 'A sneaker is visible and named in the caption.'),
  photo('pexels-13525711.jpg', 'fashion_shoes', 0.89, 'An athletic shoe is visible and named in the caption.'),
  photo('pexels-15475641.jpg', 'fashion_shoes', 0.85, 'A range of athletic shoes is visible and named in the caption.'),
];

const decodeHtml = (value: string): string => value
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

export const parsePhotoReviewHtml = (html: string): LocalPhotoReviewCard[] => {
  const cards: LocalPhotoReviewCard[] = [];
  const pattern = /<div class="card"><img[^>]*src="([^"]+)"[^>]*><div><span class="id">(\d+)<\/span>\s*([^<]*)<br>([^<]*)<\/div><\/div>/g;
  for (const match of html.matchAll(pattern)) {
    const imagePath = decodeHtml(match[1]);
    const filename = path.posix.basename(imagePath);
    if (!/^pexels-\d+\.jpg$/i.test(filename) || !imagePath.endsWith(filename)) {
      throw new Error(`Photo review has an unsupported local image path: ${imagePath}`);
    }
    cards.push({
      imagePath,
      filename,
      caption: decodeHtml(match[3].replace(/^\?\s*/, '').trim()),
      description: decodeHtml(match[4].trim()),
    });
  }
  if (!cards.length) throw new Error('No local photo cards were found in public/photo-review.html.');
  if (new Set(cards.map((card) => card.filename)).size !== cards.length) {
    throw new Error('Photo review contains duplicate filenames.');
  }
  return cards;
};

export const inventoryLocalPhotos = async (
  cards: readonly LocalPhotoReviewCard[],
  publicRoot: string,
): Promise<LocalPhotoInventoryEntry[]> => Promise.all(cards.map(async (card) => {
  const imagePath = path.resolve(publicRoot, card.imagePath.replace(/^\/+/, ''));
  if (!imagePath.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) {
    throw new Error(`Photo path escapes public assets: ${card.imagePath}`);
  }
  const bytes = fs.readFileSync(imagePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  try {
    const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
    const validRaster = metadata.format === 'jpeg'
      && Boolean(metadata.width && metadata.width >= MIN_IMAGE_DIMENSION)
      && Boolean(metadata.height && metadata.height >= MIN_IMAGE_DIMENSION);
    return {
      ...card,
      sha256,
      byteLength: bytes.byteLength,
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      validRaster,
      ...(!validRaster ? { validationError: 'Expected a JPEG raster photo at least 512×512 pixels.' } : {}),
    };
  } catch {
    return {
      ...card,
      sha256,
      byteLength: bytes.byteLength,
      width: 0,
      height: 0,
      format: 'invalid',
      validRaster: false,
      validationError: 'Image bytes could not be decoded as a raster photo.',
    };
  }
}));

export const buildLocalPhotoPilot = (
  inventory: readonly LocalPhotoInventoryEntry[],
  products: readonly OlistImageSourceProduct[],
  translations: ReadonlyMap<string, string>,
  assignments: readonly LocalPhotoAssignment[],
  displayCategory: (category: string) => string,
  displayTitle: (category: string, productId: string) => string,
): LocalPhotoPilotPlan => {
  const photosByName = new Map(inventory.map((item) => [item.filename, item]));
  const productsByCategory = new Map<string, OlistImageSourceProduct[]>();
  for (const product of [...products].sort((left, right) => left.product_id.localeCompare(right.product_id))) {
    const englishCategory = translations.get(product.product_category_name.trim());
    if (!englishCategory) continue;
    const group = productsByCategory.get(englishCategory) || [];
    group.push(product);
    productsByCategory.set(englishCategory, group);
  }
  const categoryOffsets = new Map<string, number>();
  const entries: LocalPhotoPilotEntry[] = [];
  const rejectedPhotos: Array<{ filename: string; reason: string }> = [];
  for (const assignment of assignments) {
    const image = photosByName.get(assignment.filename);
    if (!image || !image.validRaster) {
      rejectedPhotos.push({
        filename: assignment.filename,
        reason: image?.validationError || 'Photo is absent from the review inventory.',
      });
      continue;
    }
    const candidates = productsByCategory.get(assignment.translatedCategory) || [];
    const offset = categoryOffsets.get(assignment.translatedCategory) || 0;
    const product = candidates[offset];
    if (!product) {
      rejectedPhotos.push({
        filename: assignment.filename,
        reason: `No source product exists in translated category ${assignment.translatedCategory}.`,
      });
      continue;
    }
    categoryOffsets.set(assignment.translatedCategory, offset + 1);
    const productId = product.product_id.toLowerCase();
    const sku = `OLIST-${productId.toUpperCase()}`;
    const category = displayCategory(assignment.translatedCategory);
    entries.push({
      ...assignment,
      sku,
      productId,
      displayTitle: displayTitle(category, productId),
      category,
      sourceImagePath: image.imagePath,
      caption: `${image.caption}. ${image.description}`.replace(/\.\s*\./g, '.').trim(),
      imageFilename: image.filename,
      sha256: image.sha256,
      width: image.width,
      height: image.height,
      matchType: 'representative-category-match',
      source: 'Existing local Pexels-named photograph',
      license: 'Not recorded in repository; verify terms before production use.',
      validationStatus: 'raster-validated-needs-human-review',
    });
  }
  const representedCategories = new Set(entries.map((entry) => entry.translatedCategory));
  const missingCategories = [...new Set(assignments.map((assignment) => assignment.translatedCategory))]
    .filter((category) => !representedCategories.has(category))
    .sort((left, right) => left.localeCompare(right));
  return { entries, missingCategories, rejectedPhotos };
};

export const validateLocalPhotoPilot = (entries: readonly LocalPhotoPilotEntry[]): void => {
  const skus = new Set<string>();
  const filenames = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of entries) {
    if (!/^OLIST-[a-f\d]{32}$/i.test(entry.sku) || entry.sku !== `OLIST-${entry.productId.toUpperCase()}`) {
      throw new Error(`Invalid Olist product SKU in local photo pilot: ${entry.sku}`);
    }
    if (!/^\/images\/products\/pexels-\d+\.jpg$/i.test(entry.sourceImagePath)) {
      throw new Error(`Unsafe local source photo path for ${entry.sku}.`);
    }
    if (!/^[a-f\d]{64}$/i.test(entry.sha256) || !Number.isFinite(entry.confidence)
      || entry.confidence < 0 || entry.confidence > 1) {
      throw new Error(`Invalid hash or match confidence for ${entry.sku}.`);
    }
    if (skus.has(entry.sku) || filenames.has(entry.imageFilename) || hashes.has(entry.sha256)) {
      throw new Error(`Duplicate product or source photo assignment detected for ${entry.sku}.`);
    }
    skus.add(entry.sku);
    filenames.add(entry.imageFilename);
    hashes.add(entry.sha256);
  }
};

export const createLocalPhotoContactSheet = async (
  entries: readonly LocalPhotoPilotEntry[],
  publicRoot: string,
  outputPath: string,
): Promise<void> => {
  const columns = 5;
  const tileWidth = 260;
  const tileHeight = 300;
  const rows = Math.ceil(entries.length / columns);
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const [index, entry] of entries.entries()) {
    const sourcePath = path.resolve(publicRoot, entry.sourceImagePath.replace(/^\/+/, ''));
    const image = await sharp(sourcePath)
      .resize(tileWidth - 16, tileHeight - 64, { fit: 'contain', background: '#ffffff' })
      .jpeg({ quality: 88 })
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${tileWidth - 8}" height="54"><rect width="100%" height="100%" fill="#fff"/><text x="5" y="18" font-family="Arial" font-size="13" font-weight="bold">${escapeXml(entry.sku)}</text><text x="5" y="39" font-family="Arial" font-size="12">${escapeXml(entry.category)}</text></svg>`,
    );
    const tile = await sharp({
      create: { width: tileWidth - 8, height: tileHeight - 8, channels: 3, background: '#ffffff' },
    }).composite([
      { input: image, left: 4, top: 4 },
      { input: label, left: 4, top: tileHeight - 60 },
    ]).jpeg({ quality: 88 }).toBuffer();
    layers.push({
      input: tile,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    });
  }
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 3,
      background: '#e9eef3',
    },
  }).composite(layers).jpeg({ quality: 90 }).toFile(outputPath);
};

export const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] || character);

export const LOCAL_PHOTO_MINIMUM_DIMENSION = MIN_IMAGE_DIMENSION;
export const LOCAL_PHOTO_MAX_REPORT_IMAGE_DIMENSION = MAX_REPORT_IMAGE_DIMENSION;
