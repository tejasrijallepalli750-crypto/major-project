import {
  CategoryIllustrationFamily,
  OLIST_CATEGORY_IMAGE_MAP,
  OlistCategoryImageDefinition,
} from '../data/olistCategoryImageMap';
import type { ApprovedOlistCategoryPhoto } from '../data/approvedOlistCategoryPhotos';

const categoryLabels: Record<string, string> = {
  auto: 'Automotive',
  bed_bath_table: 'Bedding & Bath',
  computers_accessories: 'Computers & Accessories',
  consoles_games: 'Gaming',
  cool_stuff: 'Everyday Finds',
  general: 'Everyday Finds',
  fashion_bags_accessories: 'Bags & Accessories',
  furniture_decor: 'Home Decor',
  garden_tools: 'Garden & Tools',
  health_beauty: 'Health & Beauty',
  home_confort: 'Home Comfort',
  housewares: 'Home Essentials',
  perfumery: 'Beauty & Fragrance',
  sports_leisure: 'Sports & Outdoors',
  stationery: 'Books & Stationery',
  telephony: 'Phones & Accessories',
  toys: 'Toys & Games',
  watches_gifts: 'Watches & Gifts',
};

const availableCategoryArtFamilies = new Set([
  'accessories',
  'automotive',
  'beauty',
  'food',
  'garden',
  'general',
  'home',
  'sports',
  'stationery',
  'technology',
  'toys',
]);

export const OLIST_CATALOG_FEATURE = 'Olist historical catalogue';
export const OLIST_SIMULATED_INVENTORY_MODE = 'simulated-demo' as const;

export interface OlistCategoryImage {
  path: string;
  sourceType: 'approved-photo' | 'illustration';
  illustrationPath: string;
  attribution?: string;
}

export type OlistCategoryDefinitionWithPhoto = OlistCategoryImageDefinition & {
  approvedPhoto?: ApprovedOlistCategoryPhoto;
};

export const isOlistEnrichedImagePath = (image: string): boolean =>
  /^\/images\/olist-enriched\/OLIST-[a-f\d]{32}\.webp$/i.test(image);

export const hasSimulatedOlistInventory = (mode: string | undefined): boolean =>
  mode === OLIST_SIMULATED_INVENTORY_MODE;

export const isManagedOlistCatalogProduct = (
  sku: string,
  features: string[] | undefined,
  hasSafeLocalImage: boolean,
): boolean =>
  isOlistCatalogueProductSku(sku)
  && features?.includes(OLIST_CATALOG_FEATURE) === true
  && hasSafeLocalImage;

export const formatCategoryLabel = (category: string): string => {
  const normalized = category.trim().toLowerCase();
  if (!normalized) return 'General';
  if (categoryLabels[normalized]) return categoryLabels[normalized];

  return category
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
};

const normalizeCategoryAlias = (category: string): string => category.trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const categoryDefinitionByAlias = new Map<string, OlistCategoryDefinitionWithPhoto>();
for (const definition of OLIST_CATEGORY_IMAGE_MAP as readonly OlistCategoryDefinitionWithPhoto[]) {
  const aliases = [
    definition.sourceCategory,
    definition.categoryKey,
    formatCategoryLabel(definition.categoryKey),
  ];
  for (const alias of aliases) {
    if (alias) categoryDefinitionByAlias.set(normalizeCategoryAlias(alias), definition);
  }
}

export const getCategoryArtFamily = (category: string): string => {
  const value = category.toLowerCase().replace(/[_&-]+/g, ' ');
  if (/beauty|health|perfum|care/.test(value)) return 'beauty';
  if (/sport|leisure|outdoor/.test(value)) return 'sports';
  if (/garden|tool|agro|construction/.test(value)) return 'garden';
  if (/bed|bath|comfort|houseware|home|furniture|decor/.test(value)) return 'home';
  if (/computer|electronics|audio|telephony|phone|consol|game/.test(value)) return 'technology';
  if (/watch|gift|jewel|fashion|bag|luggage|accessor/.test(value)) return 'accessories';
  if (/stationery|book|office|education/.test(value)) return 'stationery';
  if (/toy|baby|child/.test(value)) return 'toys';
  if (/auto|car|motor/.test(value)) return 'automotive';
  if (/food|drink|market/.test(value)) return 'food';
  if (/pet/.test(value)) return 'pets';
  if (/music|instrument/.test(value)) return 'music';
  return 'general';
};

export const getCategoryArtPath = (category: string): string => {
  const family = getCategoryArtFamily(category);
  const safeFamily = availableCategoryArtFamilies.has(family) ? family : 'general';
  return `/images/catalog-category-art/${safeFamily}.svg`;
};

const getIllustrationPath = (family: CategoryIllustrationFamily): string =>
  `/images/catalog-category-art/${family}.svg`;

const isApprovedPhotoComplete = (
  photo: ApprovedOlistCategoryPhoto | undefined,
): photo is ApprovedOlistCategoryPhoto => {
  const pathIsLocalReviewedPhoto = photo?.path.startsWith('/images/olist-category-photos/')
    || /^\/images\/products\/pexels-\d+\.jpg$/.test(photo?.path || '');
  if (!photo || photo.reviewStatus !== 'approved'
    || !pathIsLocalReviewedPhoto
    || !photo.creator.trim()
    || !/^https:\/\//i.test(photo.sourceUrl)
    || !photo.license.trim()
    || !/^https:\/\//i.test(photo.licenseUrl)
    || !photo.attribution.trim()
    || !/^[a-f\d]{64}$/i.test(photo.sha256)
    || !/^[a-f\d]{64}$/i.test(photo.sourceImageSha256)
    || photo.provenanceStatus !== 'VERIFIED_IMAGE_CONTENT_MATCH'
    || photo.pHashDistance > 6
    || photo.dHashDistance > 10
    || /\b(?:nc|nd)\b|non.?commercial|no.?derivatives/i.test(photo.license)) {
    return false;
  }
  let licensePath: string;
  try {
    const licenseUrl = new URL(photo.licenseUrl);
    if (photo.license === 'Pexels License') {
      return licenseUrl.hostname === 'www.pexels.com' && licenseUrl.pathname === '/license/';
    }
    if (licenseUrl.hostname !== 'creativecommons.org') return false;
    licensePath = licenseUrl.pathname.toLowerCase();
  } catch {
    return false;
  }
  const license = photo.license.toLowerCase();
  if (/cc0|public domain zero/.test(license)) return /\/publicdomain\/zero(?:\/|$)/.test(licensePath);
  if (/pdm|public domain mark/.test(license)) return /\/publicdomain\/mark(?:\/|$)/.test(licensePath);
  if (/by-sa|attribution.share alike/.test(license)) return /\/licenses\/by-sa(?:\/|$)/.test(licensePath);
  if (/^(?:cc\s*)?by(?:\s|$)|attribution/.test(license)) return /\/licenses\/by(?:\/|$)/.test(licensePath);
  return false;
};

export const getOlistCategoryImage = (category: string | undefined): OlistCategoryImage => {
  const definition = category
    ? categoryDefinitionByAlias.get(normalizeCategoryAlias(category))
    : undefined;
  const fallbackDefinition = definition || categoryDefinitionByAlias.get('uncategorized');
  const illustrationPath = getIllustrationPath(fallbackDefinition?.illustrationFamily || 'general');
  if (fallbackDefinition && isApprovedPhotoComplete(fallbackDefinition.approvedPhoto)) {
    return {
      path: fallbackDefinition.approvedPhoto.path,
      sourceType: 'approved-photo',
      illustrationPath,
      attribution: fallbackDefinition.approvedPhoto.attribution,
    };
  }
  return { path: illustrationPath, sourceType: 'illustration', illustrationPath };
};

export const getProductImageSource = (sku: string, category: string | undefined, image: string): string =>
  isOlistCatalogueProductSku(sku) ? getOlistCategoryImage(category).path : image;

export const getOlistCategoryPhotoPath = (sourceCategory: string): string | undefined => {
  const image = getOlistCategoryImage(sourceCategory);
  return image.sourceType === 'approved-photo' ? image.path : undefined;
};

export const isOlistCategoryPhotoPath = (image: string): boolean =>
  OLIST_CATEGORY_IMAGE_MAP.some((definition) => {
    const withPhoto = definition as OlistCategoryDefinitionWithPhoto;
    return isApprovedPhotoComplete(withPhoto.approvedPhoto)
      && withPhoto.approvedPhoto.path === image;
  });

export const isOlistCatalogueProductSku = (sku: string): boolean =>
  sku.toUpperCase().startsWith('OLIST-');

export const usesSharedOlistCatalogImage = (sku: string, image: string): boolean =>
  isOlistCatalogueProductSku(sku)
  && (OLIST_CATEGORY_IMAGE_MAP.some((definition) =>
    getIllustrationPath(definition.illustrationFamily) === image)
    || isOlistCategoryPhotoPath(image));
