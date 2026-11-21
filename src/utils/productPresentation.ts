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

export const isInventoryVerified = (status: string | undefined): boolean =>
  status === 'verified';

export interface PurchaseInventory {
  stock: number;
  status?: 'active' | 'inactive';
  inventoryStatus?: string;
  demoModeEnabled?: boolean;
  demoPurchasingAvailable?: boolean;
  demoEligible?: boolean;
  demoStock?: number;
  canPurchase?: boolean;
  purchaseUnavailableReason?: string | null;
}

export interface PurchaseEligibility {
  availableStock: number;
  unavailableReason?: string;
}

export const isDemoPurchase = (product: PurchaseInventory): boolean =>
  product.demoModeEnabled === true && product.demoEligible === true;

export const getPurchaseEligibility = (product: PurchaseInventory): PurchaseEligibility => {
  if (product.status === 'inactive') {
    return { availableStock: 0, unavailableReason: 'This product is currently inactive.' };
  }
  if (isDemoPurchase(product)) {
    if (product.demoPurchasingAvailable !== true) {
      return {
        availableStock: 0,
        unavailableReason: 'Demonstration checkout is unavailable because server-side demo mode or Razorpay TEST setup is disabled.',
      };
    }
    const stock = product.demoStock;
    if (typeof stock !== 'number' || !Number.isSafeInteger(stock) || stock < 1) {
      return {
        availableStock: 0,
        unavailableReason: 'No demonstration stock is available. An administrator must assign demo stock before purchase.',
      };
    }
    return { availableStock: stock };
  }
  if (!isInventoryVerified(product.inventoryStatus)) {
    return {
      availableStock: 0,
      unavailableReason: product.demoModeEnabled === undefined
        ? 'The server did not provide purchase eligibility. Refresh the page; if this continues, restart the application server.'
        : product.demoModeEnabled
          ? 'This product is not selected for demonstration purchases. An administrator must enable it and assign demo stock.'
          : 'Physical inventory is not verified, and demonstration purchasing is disabled by the server.',
    };
  }
  if (!Number.isSafeInteger(product.stock) || product.stock < 1) {
    return { availableStock: 0, unavailableReason: 'This product is out of stock.' };
  }
  return { availableStock: product.stock };
};

export const getAvailablePurchaseStock = (product: PurchaseInventory): number =>
  product.canPurchase === true ? getPurchaseEligibility(product).availableStock : 0;

export const getPurchaseUnavailableReason = (product: PurchaseInventory): string | undefined => {
  if (product.canPurchase === false) {
    return product.purchaseUnavailableReason
      || getPurchaseEligibility(product).unavailableReason
      || 'This product is unavailable under the server inventory rules.';
  }
  if (product.canPurchase !== true && product.status !== undefined) {
    return 'The server did not provide purchase eligibility. Refresh the page; if this continues, restart the application server.';
  }
  return getPurchaseEligibility(product).unavailableReason;
};

export const hasSimulatedOlistInventory = (
  mode: string | undefined,
  status?: string,
): boolean => mode === OLIST_SIMULATED_INVENTORY_MODE && !isInventoryVerified(status);

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

export const getCustomerProductName = (product: { name: string; sku?: string }): string =>
  isOlistCatalogueProductSku(product.sku || '')
    ? product.name.replace(/^Olist\s+/i, '')
    : product.name;

export const getCustomerProductBrand = (brand: string | undefined): string =>
  brand?.trim().toLowerCase() === 'olist historical catalogue' ? '' : brand || '';

export const getCustomerProductDescription = (description: string | undefined): string =>
  (description || '')
    .replace(/^A catalogue display entry for an Olist product in [^.]+\.\s*/i, '')
    .replace(/The representative category image is not an original Olist product photo\.\s*/i, '')
    .replace(/\b(?:Imported from Olist|Imported from \/dataset folder|Not verified or sourced from Olist|Not sourced from Olist)\b\.?/gi, '')
    .trim();

export const getCustomerProductFeatures = (features: string[] | undefined): string[] =>
  (features || []).filter((feature) =>
    !/^(?:Olist historical catalogue|Representative category image; not an original Olist product photo|Generated display title based on translated category .+)$/i
      .test(feature.trim())
    && feature !== 'Imported from /dataset folder');

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

export const isApprovedOlistCategoryPhoto = (
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
  if (fallbackDefinition && isApprovedOlistCategoryPhoto(fallbackDefinition.approvedPhoto)) {
    return {
      path: fallbackDefinition.approvedPhoto.path,
      sourceType: 'approved-photo',
      illustrationPath,
      attribution: fallbackDefinition.approvedPhoto.attribution,
    };
  }
  return { path: illustrationPath, sourceType: 'illustration', illustrationPath };
};

export const getOlistCategoryPhotoPath = (sourceCategory: string): string | undefined => {
  const image = getOlistCategoryImage(sourceCategory);
  return image.sourceType === 'approved-photo' ? image.path : undefined;
};

export const isOlistCategoryPhotoPath = (image: string): boolean =>
  OLIST_CATEGORY_IMAGE_MAP.some((definition) => {
    const withPhoto = definition as OlistCategoryDefinitionWithPhoto;
    return isApprovedOlistCategoryPhoto(withPhoto.approvedPhoto)
      && withPhoto.approvedPhoto.path === image;
  });

export const isOlistCatalogueProductSku = (sku: string): boolean =>
  sku.toUpperCase().startsWith('OLIST-');

export const isEstimatedOlistPrice = (sku: string): boolean =>
  isOlistCatalogueProductSku(sku);

export const getProductImageSource = (sku: string, category: string | undefined, image: string): string =>
  isOlistCatalogueProductSku(sku) ? getOlistCategoryImage(category).path : image;

export const usesSharedOlistCatalogImage = (sku: string, image: string): boolean =>
  isOlistCatalogueProductSku(sku)
  && (OLIST_CATEGORY_IMAGE_MAP.some((definition) =>
    getIllustrationPath(definition.illustrationFamily) === image)
    || isOlistCategoryPhotoPath(image));
