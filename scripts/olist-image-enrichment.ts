import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Metadata } from 'sharp';

const OLIST_SKU_PATTERN = /^OLIST-([a-f\d]{32})$/i;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MIN_IMAGE_DIMENSION = 512;
const ACCEPTED_LICENSES = new Set(['cc0', 'pdm', 'by', 'by-sa']);
const NONCOMMERCIAL_OR_NO_DERIVATIVES = /\b(?:nc|non.?commercial|nd|no.?derivatives)\b/i;

export interface OlistImageSourceProduct extends Record<string, string> {
  product_id: string;
  product_category_name: string;
  product_name_lenght: string;
  product_description_lenght: string;
  product_photos_qty: string;
  product_weight_g: string;
  product_length_cm: string;
  product_height_cm: string;
  product_width_cm: string;
}

export type OlistPhotoMatchType = 'verified-exact-match' | 'representative-category-match';
export type OpenLicense = 'cc0' | 'pdm' | 'by' | 'by-sa';

export interface OpenPhotoCandidate {
  id: string;
  provider: 'Openverse' | 'Wikimedia Commons' | 'Existing local photo';
  title: string;
  description: string;
  creator: string;
  creatorUrl: string;
  sourceUrl: string;
  imageUrl: string;
  license: string;
  licenseCode: OpenLicense;
  licenseVersion: string;
  licenseUrl: string;
  attribution: string;
  width: number;
  height: number;
  tags: string[];
}

export interface OlistPhotoManifestEntry {
  sku: string;
  productId: string;
  displayTitle: string;
  category: string;
  imagePath: string;
  sourceProvider: OpenPhotoCandidate['provider'];
  sourceTitle: string;
  creator: string;
  creatorUrl: string;
  sourceUrl: string;
  originalImageUrl: string;
  license: string;
  licenseVersion: string;
  licenseUrl: string;
  attribution: string;
  matchType: OlistPhotoMatchType;
  matchConfidence: number;
  matchReason: string;
  relevanceEvidence: string[];
  relevanceStatus: 'candidate-accepted' | 'needs-re-review' | 'rejected-pending-validation';
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  validationStatus: 'needs-human-review';
  downloadedAt: string;
}

export interface OpenverseSearchResult {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  creator?: unknown;
  creator_url?: unknown;
  foreign_landing_url?: unknown;
  url?: unknown;
  license?: unknown;
  license_version?: unknown;
  license_url?: unknown;
  attribution?: unknown;
  width?: unknown;
  height?: unknown;
  tags?: unknown;
  filetype?: unknown;
  mature?: unknown;
}

export interface WikimediaPage {
  title?: unknown;
  imageinfo?: Array<{
    url?: unknown;
    descriptionurl?: unknown;
    mime?: unknown;
    width?: unknown;
    height?: unknown;
    extmetadata?: Record<string, { value?: unknown }>;
  }>;
}

export interface OpenverseSearchCache {
  version: 2;
  createdAt: string;
  query: string;
  provider: OpenverseSearchProvider;
  results: OpenPhotoCandidate[];
}

export interface OlistImagePipelineOptions {
  pilotSearch: boolean;
  retries: number;
}

export type OpenverseSearchProvider = 'Openverse' | 'Wikimedia Commons';

export const OLIST_IMAGE_PILOT_SIZE = 50;
export const OLIST_IMAGE_MAX_BATCH_SIZE = 50;
export const OLIST_IMAGE_MANIFEST_PATH = path.join('data', 'olist-image-enrichment', 'pilot-free-photos', 'manifest.json');
export const OLIST_FREE_PHOTO_ROOT = path.join('data', 'olist-image-enrichment', 'pilot-free-photos');
export const OPENVERSE_IMAGES_ENDPOINT = 'https://api.openverse.org/v1/images/';
export const WIKIMEDIA_API_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
export const SEARCH_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const USER_AGENT = 'AURA-Olist-Free-Photo-Pilot/1.0 (local B.Tech project; respectful API client)';

export interface OlistCategorySearchSpec {
  query: string;
  productTerms: readonly string[];
  searchQueries?: readonly string[];
}

const CATEGORY_SEARCH_SPECS: Record<string, OlistCategorySearchSpec> = {
  air_conditioning: {
    query: 'air conditioner unit product photo, split-system air conditioner, portable air conditioner',
    productTerms: ['air conditioner', 'air conditioning unit', 'air-conditioning unit', 'split system', 'hvac unit'],
  },
  bed_bath_table: {
    query: 'product photo bedding towels bathroom accessories, bed linen, bath towel, bathroom fixture',
    productTerms: ['bedding', 'bed linen', 'bedsheet', 'duvet', 'towel', 'bath towel', 'bathroom accessory', 'bathroom fixture'],
  },
  computers_accessories: {
    query: 'product photo laptop desktop computer peripherals, computer keyboard, computer mouse, monitor',
    productTerms: ['laptop', 'notebook computer', 'desktop computer', 'computer keyboard', 'computer mouse', 'computer monitor', 'computer peripheral', 'computer accessory'],
    searchQueries: [
      'computer product photograph',
      'laptop notebook computer product photograph',
      'computer monitor product photograph',
      'computer keyboard product photograph',
      'computer accessories product photograph',
    ],
  },
  computers: {
    query: 'product photo laptop desktop computer peripherals, computer keyboard, computer mouse, monitor',
    productTerms: ['laptop', 'notebook computer', 'desktop computer', 'computer keyboard', 'computer mouse', 'computer monitor', 'computer peripheral', 'computer accessory'],
    searchQueries: [
      'computer product photograph',
      'laptop notebook computer product photograph',
      'computer monitor product photograph',
      'computer keyboard product photograph',
      'computer accessories product photograph',
    ],
  },
  garden_tools: {
    query: 'product photo garden hand tools gardening equipment, pruning shears, garden shovel, watering can',
    productTerms: ['garden tool', 'gardening tool', 'pruning shears', 'garden shovel', 'watering can', 'garden hose', 'lawn mower'],
  },
  tools_garden: {
    query: 'product photo garden hand tools gardening equipment, pruning shears, garden shovel, watering can',
    productTerms: ['garden tool', 'gardening tool', 'pruning shears', 'garden shovel', 'watering can', 'garden hose', 'lawn mower'],
  },
  health_beauty: {
    query: 'product photo skincare cosmetics beauty product, makeup item, skincare bottle, beauty device',
    productTerms: ['skincare product', 'skincare cream', 'cosmetic product', 'makeup', 'beauty product', 'beauty device', 'skin cream', 'face cream'],
  },
  perfumery: {
    query: 'product photo perfume fragrance bottle, perfume atomizer, cologne bottle',
    productTerms: ['perfume bottle', 'fragrance bottle', 'cologne bottle', 'perfume atomizer'],
  },
  audio: {
    query: 'product photo headphones speakers audio equipment, headphones, loudspeaker, microphone',
    productTerms: ['headphones', 'earphones', 'loudspeaker', 'audio speaker', 'microphone', 'audio equipment', 'stereo system', 'audio amplifier'],
  },
  telephony: {
    query: 'product photo mobile phone smartphone telephone, cell phone handset',
    productTerms: ['mobile phone', 'smartphone', 'cell phone', 'telephone handset', 'telephone'],
  },
  cine_photo: {
    query: 'product photo camera photography equipment, digital camera, camera lens',
    productTerms: ['camera', 'camera lens', 'camera body', 'photographic camera', 'film camera'],
  },
  watches_gifts: {
    query: 'product photo wristwatch watch gift item, wrist watch, watch case',
    productTerms: ['wristwatch', 'wrist watch', 'watch product', 'watch case'],
  },
  sports_leisure: {
    query: 'product photo sports equipment sporting goods, fitness equipment, ball, bicycle accessory',
    productTerms: ['sports equipment', 'sporting goods', 'fitness equipment', 'exercise equipment', 'tennis racket', 'football ball', 'basketball'],
  },
  furniture_decor: {
    query: 'product photo furniture home decor, chair, table, sofa, cabinet, lamp',
    productTerms: ['furniture', 'chair', 'sofa', 'table', 'cabinet', 'desk', 'lamp', 'home decor'],
  },
  home_appliances: {
    query: 'product photo home appliance kitchen appliance, vacuum cleaner, kettle, blender',
    productTerms: ['home appliance', 'kitchen appliance', 'vacuum cleaner', 'electric kettle', 'blender', 'refrigerator', 'washing machine'],
  },
  housewares: {
    query: 'product photo household kitchenware cookware, kitchen utensil, serving dish',
    productTerms: ['kitchenware', 'cookware', 'kitchen utensil', 'household item', 'serving dish', 'cooking pot'],
  },
  fashion_bags_accessories: {
    query: 'product photo handbag backpack fashion accessories, purse, wallet, belt',
    productTerms: ['handbag', 'backpack', 'purse', 'wallet', 'fashion accessory', 'shoulder bag', 'suitcase'],
  },
  fashion_shoes: {
    query: 'product photo shoes footwear sneaker boot, shoe pair',
    productTerms: ['shoes', 'footwear', 'sneaker', 'boot', 'sandal', 'dress shoe'],
  },
  toys: {
    query: 'product photo toy product, toy vehicle, doll, building blocks, board game',
    productTerms: ['toy', 'doll', 'toy vehicle', 'building blocks', 'board game', 'stuffed animal'],
  },
  baby: {
    query: 'product photo baby product stroller baby bottle nursery equipment',
    productTerms: ['baby product', 'baby bottle', 'stroller', 'car seat', 'baby monitor', 'crib', 'nursing product'],
  },
  pet_shop: {
    query: 'product photo pet supplies dog toy cat carrier aquarium equipment',
    productTerms: ['pet supply', 'dog toy', 'cat toy', 'pet carrier', 'pet bed', 'aquarium equipment', 'dog collar'],
  },
  food: {
    query: 'food product package product photo, packaged food, grocery product',
    productTerms: ['food product', 'packaged food', 'food package', 'grocery product', 'food jar', 'food tin'],
  },
  drinks: {
    query: 'beverage product bottle can product photo, bottled drink, beverage packaging',
    productTerms: ['beverage bottle', 'drink bottle', 'beverage can', 'bottled drink', 'beverage product'],
  },
  stationery: {
    query: 'product photo stationery office supplies notebook pen stapler',
    productTerms: ['stationery', 'notebook', 'ballpoint pen', 'fountain pen', 'stapler', 'office supply'],
  },
  books_general_interest: {
    query: 'product photo book novel paperback book cover',
    productTerms: ['book', 'paperback', 'hardcover', 'novel', 'book cover'],
  },
  books_technical: {
    query: 'product photo technical book textbook manual',
    productTerms: ['technical book', 'textbook', 'technical manual', 'engineering book', 'computer science book'],
  },
  auto: {
    query: 'product photo automotive car accessory auto part',
    productTerms: ['car accessory', 'automotive part', 'auto part', 'car component', 'vehicle accessory'],
  },
  automotive: {
    query: 'product photo automotive car accessory auto part',
    productTerms: ['car accessory', 'automotive part', 'auto part', 'car component', 'vehicle accessory'],
  },
  musical_instruments: {
    query: 'product photo musical instrument guitar keyboard drum',
    productTerms: ['musical instrument', 'guitar', 'piano keyboard', 'drum kit', 'violin', 'trumpet'],
  },
  construction_tools_construction: {
    query: 'product photo construction hand tools drill hammer wrench',
    productTerms: ['hand tool', 'power tool', 'electric drill', 'hammer tool', 'wrench', 'screwdriver', 'construction tool'],
  },
  office_furniture: {
    query: 'product photo office furniture desk office chair filing cabinet',
    productTerms: ['office furniture', 'office chair', 'office desk', 'filing cabinet'],
  },
  cool_stuff: {
    query: 'photograph of a named consumer product on a plain background',
    productTerms: ['consumer product', 'household product', 'home accessory', 'kitchen product'],
  },
  dvds_blu_ray: {
    query: 'DVD disc Blu-ray movie case product photograph',
    productTerms: ['DVD', 'DVD disc', 'Blu-ray disc', 'movie disc', 'DVD case'],
  },
  industry_commerce_and_business: {
    query: 'industrial equipment commercial business supplies product photograph',
    productTerms: ['industrial equipment', 'commercial equipment', 'business supplies', 'office equipment'],
  },
  pc_gamer: {
    query: 'gaming PC desktop computer tower product photograph',
    productTerms: ['gaming PC', 'gaming computer', 'gaming desktop', 'computer tower'],
  },
  portateis_cozinha_e_preparadores_de_alimentos: {
    query: 'food processor blender kitchen appliance product photograph',
    productTerms: ['food processor', 'kitchen appliance', 'blender', 'stand mixer', 'electric mixer'],
  },
  electronics: {
    query: 'product photo electronic device consumer electronics accessory',
    productTerms: ['electronic device', 'electronics product', 'electronic accessory', 'consumer electronics'],
  },
  everyday_finds: {
    query: 'product photo household consumer product on clean background',
    productTerms: ['household product', 'consumer product', 'kitchen product', 'home accessory'],
  },
  furniture_bedroom: {
    query: 'product photo bedroom furniture bed frame bedside table wardrobe',
    productTerms: ['bed frame', 'bedside table', 'bedroom furniture', 'wardrobe', 'dresser'],
  },
  furniture_living_room: {
    query: 'product photo living room furniture sofa armchair coffee table',
    productTerms: ['living room furniture', 'sofa', 'armchair', 'coffee table', 'tv stand'],
  },
  garden_tools_and_tools: {
    query: 'product photo garden hand tools gardening equipment, pruning shears, garden shovel',
    productTerms: ['garden tool', 'gardening tool', 'pruning shears', 'garden shovel', 'watering can', 'garden hose', 'lawn mower'],
  },
  home_construction: {
    query: 'product photo home improvement construction material hand tool',
    productTerms: ['home improvement product', 'construction material', 'construction tool', 'building hardware'],
  },
  home_decor: {
    query: 'product photo home decor lamp vase wall decoration',
    productTerms: ['home decor', 'decorative vase', 'table lamp', 'wall decoration', 'home accessory'],
  },
  food_drink: {
    query: 'product photo packaged food beverage bottle grocery product',
    productTerms: ['packaged food', 'food product', 'beverage bottle', 'drink bottle', 'grocery product'],
  },
  agro_industry_and_commerce: {
    query: 'product photo agricultural equipment farm tool irrigation equipment',
    productTerms: ['agricultural equipment', 'farm tool', 'irrigation equipment', 'farming equipment'],
  },
  art: {
    query: 'product photo art print painting framed artwork',
    productTerms: ['art print', 'painting', 'framed artwork', 'artwork product'],
  },
  arts_and_craftmanship: {
    query: 'product photo handmade craft artisan object craft supplies',
    productTerms: ['handmade craft', 'craft supplies', 'artisan product', 'handcrafted object'],
  },
  books_imported: {
    query: 'product photo imported book paperback hardcover',
    productTerms: ['book', 'paperback', 'hardcover', 'book cover'],
  },
  cds_dvds_musicals: {
    query: 'product photo music CD DVD album case',
    productTerms: ['music cd', 'cd album', 'dvd case', 'music album'],
  },
  christmas_supplies: {
    query: 'product photo Christmas decoration ornament holiday supplies',
    productTerms: ['Christmas decoration', 'Christmas ornament', 'holiday decoration', 'Christmas light'],
  },
  consoles_games: {
    query: 'product photo video game console controller game disc',
    productTerms: ['video game console', 'game controller', 'video game', 'gaming console'],
  },
  construction_tools_lights: {
    query: 'product photo construction lighting work light task light',
    productTerms: ['work light', 'construction light', 'task light', 'work lamp'],
  },
  construction_tools_safety: {
    query: 'product photo construction safety equipment protective gear',
    productTerms: ['safety equipment', 'protective gear', 'safety helmet', 'work gloves', 'safety goggles'],
  },
  costruction_tools_garden: {
    query: 'product photo garden hand tools gardening equipment',
    productTerms: ['garden tool', 'gardening tool', 'pruning shears', 'garden shovel', 'watering can'],
  },
  costruction_tools_tools: {
    query: 'product photo hand tools power tools drill hammer wrench',
    productTerms: ['hand tool', 'power tool', 'electric drill', 'hammer tool', 'wrench', 'screwdriver'],
  },
  diapers_and_hygiene: {
    query: 'product photo diapers baby hygiene product package',
    productTerms: ['diaper package', 'baby diaper', 'hygiene product', 'baby wipes'],
  },
  fashio_female_clothing: {
    query: 'product photo women clothing garment dress blouse',
    productTerms: ['women clothing', 'women garment', 'dress', 'blouse', 'skirt'],
  },
  fashion_childrens_clothes: {
    query: 'product photo children clothing garment kids outfit',
    productTerms: ['children clothing', 'kids clothing', 'child garment', 'children outfit'],
  },
  fashion_male_clothing: {
    query: 'product photo men clothing garment shirt jacket',
    productTerms: ['men clothing', 'mens clothing', 'men garment', 'shirt', 'jacket'],
  },
  fashion_sport: {
    query: 'product photo sportswear athletic clothing garment',
    productTerms: ['sportswear', 'athletic clothing', 'sports clothing', 'training garment'],
  },
  fashion_underwear_beach: {
    query: 'product photo underwear swimwear garment swimsuit',
    productTerms: ['underwear', 'swimwear', 'swimsuit', 'bikini', 'beachwear garment'],
  },
  fixed_telephony: {
    query: 'product photo landline telephone fixed phone handset',
    productTerms: ['landline telephone', 'fixed telephone', 'telephone handset', 'corded phone'],
  },
  flowers: {
    query: 'product photo flower bouquet potted plant floral arrangement',
    productTerms: ['flower bouquet', 'floral arrangement', 'potted flower', 'cut flowers'],
  },
  furniture_mattress_and_upholstery: {
    query: 'product photo mattress upholstered furniture cushion',
    productTerms: ['mattress', 'upholstered furniture', 'upholstered chair', 'sofa cushion'],
  },
  home_appliances_2: {
    query: 'product photo small home appliance kitchen appliance',
    productTerms: ['home appliance', 'small appliance', 'kitchen appliance', 'electric kettle', 'blender'],
  },
  home_comfort_2: {
    query: 'product photo home comfort appliance fan heater humidifier',
    productTerms: ['home comfort appliance', 'electric fan', 'space heater', 'humidifier', 'air purifier'],
  },
  home_confort: {
    query: 'product photo home comfort appliance fan heater humidifier',
    productTerms: ['home comfort appliance', 'electric fan', 'space heater', 'humidifier', 'air purifier'],
  },
  kitchen_dining_laundry_garden_furniture: {
    query: 'product photo kitchen dining laundry household furniture',
    productTerms: ['dining table', 'dining chair', 'laundry appliance', 'kitchen furniture', 'garden furniture'],
  },
  la_cuisine: {
    query: 'product photo cookware kitchen utensil cooking pot',
    productTerms: ['cookware', 'kitchen utensil', 'cooking pot', 'kitchenware'],
  },
  luggage_accessories: {
    query: 'product photo suitcase luggage travel bag travel accessory',
    productTerms: ['suitcase', 'luggage', 'travel bag', 'luggage accessory'],
  },
  market_place: {
    query: 'product photo consumer retail product isolated on neutral background',
    productTerms: ['consumer product', 'retail product', 'household product', 'electronic product'],
  },
  music: {
    query: 'product photo music CD vinyl record audio album',
    productTerms: ['music cd', 'vinyl record', 'audio album', 'music album'],
  },
  party_supplies: {
    query: 'product photo party supplies decoration balloons tableware',
    productTerms: ['party supplies', 'party decoration', 'party balloon', 'party tableware'],
  },
  security_and_services: {
    query: 'product photo security device alarm camera lock',
    productTerms: ['security device', 'alarm system', 'security camera', 'door lock'],
  },
  signaling_and_security: {
    query: 'product photo security signaling device alarm light',
    productTerms: ['security device', 'alarm system', 'signal light', 'smoke detector'],
  },
  small_appliances: {
    query: 'product photo small household appliance toaster blender kettle',
    productTerms: ['small appliance', 'toaster', 'blender', 'electric kettle', 'coffee maker'],
  },
  small_appliances_home_oven_and_coffee: {
    query: 'product photo countertop oven coffee maker small appliance',
    productTerms: ['countertop oven', 'coffee maker', 'espresso machine', 'small appliance'],
  },
  tablets_printing_image: {
    query: 'product photo tablet computer printer imaging device',
    productTerms: ['tablet computer', 'computer tablet', 'printer', 'photo printer', 'imaging device'],
  },
};

const normalizeCategoryKey = (category: string): string =>
  category.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s&-]+/g, '_').replace(/_+/g, '_');

export const getOlistCategorySearchSpec = (category: string): OlistCategorySearchSpec | undefined =>
  CATEGORY_SEARCH_SPECS[normalizeCategoryKey(category)];

export const buildOlistDisplayName = (category: string, productId: string): string =>
  `Olist ${category} product ${productId.slice(0, 8).toUpperCase()}`;

export const categorySearchQuery = (category: string): string =>
  getOlistCategorySearchSpec(category)?.query || '';

export const categoryPhotoSearchQueries = (category: string): string[] => {
  const spec = getOlistCategorySearchSpec(category);
  if (!spec) return [];
  if (spec.searchQueries) return [...spec.searchQueries];
  return spec.productTerms.slice(0, 2).map((term) => `${term} product photograph`);
};

export const selectOlistImagePilot = <T extends OlistImageSourceProduct>(
  products: readonly T[],
  translations: ReadonlyMap<string, string>,
  limit = OLIST_IMAGE_PILOT_SIZE,
): T[] => {
  if (!Number.isInteger(limit) || limit < 1 || limit > OLIST_IMAGE_MAX_BATCH_SIZE) {
    throw new RangeError(`Free-photo pilot limit must be from 1 to ${OLIST_IMAGE_MAX_BATCH_SIZE}.`);
  }
  const grouped = new Map<string, T[]>();
  for (const product of [...products].sort((left, right) => left.product_id.localeCompare(right.product_id))) {
    const sourceCategory = product.product_category_name.trim();
    const category = translations.get(sourceCategory) || sourceCategory || 'General';
    const group = grouped.get(category) || [];
    group.push(product);
    grouped.set(category, group);
  }
  const categories = [...grouped.keys()].sort((left, right) => left.localeCompare(right));
  const selected: T[] = [];
  let round = 0;
  while (selected.length < limit) {
    let found = false;
    for (const category of categories) {
      const product = grouped.get(category)?.[round];
      if (!product) continue;
      selected.push(product);
      found = true;
      if (selected.length === limit) break;
    }
    if (!found) break;
    round += 1;
  }
  return selected;
};

export const parseOlistImagePipelineOptions = (args: readonly string[]): OlistImagePipelineOptions => {
  const options: OlistImagePipelineOptions = { pilotSearch: false, retries: 2 };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--') || seen.has(argument)) throw new Error(`Invalid or repeated option: ${argument}`);
    seen.add(argument);
    if (argument === '--pilot-search') options.pilotSearch = true;
    else if (argument === '--retries') {
      const value = args[index + 1];
      if (!value || !/^\d+$/.test(value)) throw new Error('--retries requires a whole number from 0 to 3.');
      options.retries = Number(value);
      index += 1;
    } else {
      throw new Error(`Unsupported option: ${argument}`);
    }
  }
  if (options.retries < 0 || options.retries > 3) {
    throw new RangeError('--retries must be from 0 to 3.');
  }
  return options;
};

export const normalizeLicense = (value: string): OpenLicense | undefined => {
  const normalized = value.trim().toLowerCase()
    .replace(/^https?:\/\/creativecommons\.org\/licenses\//, '')
    .replace(/^creative commons\s+/, 'cc ');
  const code = normalized.match(/^(?:cc\s*)?(cc0|pdm|by-sa|by)(?:[\s/.-]|$)/)?.[1]
    || (/\bpublic domain mark\b|\bpdm\b/.test(normalized) ? 'pdm' : undefined)
    || (/\bcc0\b|zero\b/.test(normalized) ? 'cc0' : undefined)
    || (/\bcc by-sa\b|\bby-sa\b/.test(normalized) ? 'by-sa' : undefined)
    || (/\bcc by\b|\bby\b/.test(normalized) ? 'by' : undefined);
  if (!code || !ACCEPTED_LICENSES.has(code as OpenLicense) || NONCOMMERCIAL_OR_NO_DERIVATIVES.test(value)) {
    return undefined;
  }
  return code as OpenLicense;
};

export const isCommerciallyUsableLicense = (license: string, licenseUrl: string): boolean => {
  const code = normalizeLicense(license);
  if (!code || !isSafeHttpsUrl(licenseUrl)) return false;
  const url = new URL(licenseUrl);
  if (code === 'pdm') {
    return (url.hostname === 'creativecommons.org' && /\/publicdomain\/mark(?:\/|$)/i.test(url.pathname))
      || (url.hostname.endsWith('.wikimedia.org') && /publicdomain.?mark/i.test(url.pathname));
  }
  if (url.hostname !== 'creativecommons.org') return false;
  const expectedPath = code === 'cc0' ? /\/publicdomain\/zero(?:\/|$)/i
    : code === 'by-sa' ? /\/licenses\/by-sa(?:\/|$)/i
      : code === 'by' ? /\/licenses\/by(?:\/|$)/i
        : undefined;
  return Boolean(expectedPath?.test(url.pathname));
};

export const isSafeHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

const stringValue = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const numericValue = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const normalizeOpenverseResult = (item: OpenverseSearchResult): OpenPhotoCandidate | undefined => {
  if (getOpenverseResultRejectionReason(item)) return undefined;
  const license = stringValue(item.license).toLowerCase();
  const licenseUrl = stringValue(item.license_url);
  const licenseCode = normalizeLicense(license);
  if (!licenseCode) return undefined;
  const sourceUrl = stringValue(item.foreign_landing_url);
  const imageUrl = stringValue(item.url);
  const creator = stringValue(item.creator);
  const creatorUrl = stringValue(item.creator_url);
  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag) => tag && typeof tag === 'object' && 'name' in tag ? stringValue(tag.name) : '').filter(Boolean)
    : [];
  return {
    id: stringValue(item.id),
    provider: 'Openverse',
    title: stringValue(item.title) || 'Untitled photograph',
    description: stringValue(item.description),
    creator,
    creatorUrl,
    sourceUrl,
    imageUrl,
    license,
    licenseCode,
    licenseVersion: stringValue(item.license_version),
    licenseUrl,
    attribution: stringValue(item.attribution),
    width: numericValue(item.width),
    height: numericValue(item.height),
    tags,
  };
};

export const getOpenverseResultRejectionReason = (item: OpenverseSearchResult): string | undefined => {
  const license = stringValue(item.license).toLowerCase();
  const licenseUrl = stringValue(item.license_url);
  if (!normalizeLicense(license) || !isCommerciallyUsableLicense(license, licenseUrl)) {
    return 'license is missing, unsupported, or its URL does not match a permitted license';
  }
  if (!isSafeHttpsUrl(stringValue(item.foreign_landing_url))) return 'source page URL is missing or not HTTPS';
  if (!isSafeHttpsUrl(stringValue(item.url))) return 'image URL is missing or not HTTPS';
  if (!stringValue(item.creator) || !isSafeHttpsUrl(stringValue(item.creator_url))) {
    return 'creator name or HTTPS creator URL is missing';
  }
  if (!stringValue(item.attribution)) return 'attribution text is missing';
  if (item.mature === true) return 'provider marked the result as mature';
  const width = numericValue(item.width);
  const height = numericValue(item.height);
  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    return `image dimensions are missing or below ${MIN_IMAGE_DIMENSION}px`;
  }
  return undefined;
};

const stripHtml = (value: unknown): string => stringValue(value)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<\/p>/gi, ' ')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizeWikimediaPage = (page: WikimediaPage): OpenPhotoCandidate | undefined => {
  if (getWikimediaPageRejectionReason(page)) return undefined;
  const info = page.imageinfo?.[0];
  const metadata = info?.extmetadata;
  if (!info || !metadata) return undefined;
  const license = stripHtml(metadata.LicenseShortName?.value);
  const licenseUrl = stripHtml(metadata.LicenseUrl?.value);
  const licenseCode = normalizeLicense(license);
  if (!licenseCode) return undefined;
  const imageUrl = stringValue(info.url);
  const sourceUrl = stringValue(info.descriptionurl);
  const creator = stripHtml(metadata.Artist?.value || metadata.Credit?.value);
  const attribution = stripHtml(metadata.Attribution?.value || metadata.Artist?.value);
  return {
    id: sourceUrl,
    provider: 'Wikimedia Commons',
    title: stripHtml(page.title) || 'Untitled Commons photograph',
    description: stripHtml(metadata.ImageDescription?.value || metadata.ObjectName?.value),
    creator,
    creatorUrl: sourceUrl,
    sourceUrl,
    imageUrl,
    license,
    licenseCode,
    licenseVersion: '',
    licenseUrl,
    attribution,
    width: numericValue(info.width),
    height: numericValue(info.height),
    tags: [],
  };
};

export const getWikimediaPageRejectionReason = (page: WikimediaPage): string | undefined => {
  const info = page.imageinfo?.[0];
  const metadata = info?.extmetadata;
  if (!info || !metadata || !stringValue(info.mime).startsWith('image/')) {
    return 'image information or image MIME type is missing';
  }
  const license = stripHtml(metadata.LicenseShortName?.value);
  const licenseUrl = stripHtml(metadata.LicenseUrl?.value);
  if (!normalizeLicense(license) || !isCommerciallyUsableLicense(license, licenseUrl)) {
    return 'license is missing, unsupported, or its URL does not match a permitted license';
  }
  if (!isSafeHttpsUrl(stringValue(info.url))) return 'image URL is missing or not HTTPS';
  if (!isSafeHttpsUrl(stringValue(info.descriptionurl))) return 'source page URL is missing or not HTTPS';
  const creator = stripHtml(metadata.Artist?.value || metadata.Credit?.value);
  const attribution = stripHtml(metadata.Attribution?.value || metadata.Artist?.value);
  if (!creator || !attribution) return 'creator or attribution metadata is missing';
  if (numericValue(info.width) < MIN_IMAGE_DIMENSION || numericValue(info.height) < MIN_IMAGE_DIMENSION) {
    return `image dimensions are missing or below ${MIN_IMAGE_DIMENSION}px`;
  }
  return undefined;
};

const normalizeSearchText = (value: string): string =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const containsSearchTerm = (haystack: string, term: string): boolean => {
  const normalizedHaystack = ` ${normalizeSearchText(haystack)} `;
  const normalizedTerm = ` ${normalizeSearchText(term)} `;
  return normalizedHaystack.includes(normalizedTerm);
};

const UNRELATED_SCENE_TERMS = [
  'people', 'person', 'portrait', 'selfie', 'man', 'woman', 'child', 'crowd', 'audience',
  'concert', 'music festival', 'festival crowd', 'live performance', 'trade show', 'conference',
  'lecture', 'exhibition', 'beach', 'seaside', 'seascape', 'landscape', 'cityscape', 'skyline',
  'architecture', 'building',
];

export interface CategoryRelevance {
  accepted: boolean;
  score: number;
  evidence: string[];
  rejectionReason: string;
}

export const evaluateCategoryRelevance = (candidate: OpenPhotoCandidate, category: string): CategoryRelevance => {
  const spec = getOlistCategorySearchSpec(category);
  if (!spec) {
    return { accepted: false, score: 0, evidence: [], rejectionReason: `No product-specific query mapping exists for category "${category}".` };
  }
  const title = normalizeSearchText(candidate.title);
  const description = normalizeSearchText(candidate.description || '');
  const tags = candidate.tags.map(normalizeSearchText);
  const fullText = [title, description, ...tags].join(' ');
  const conflictingTerm = UNRELATED_SCENE_TERMS.find((term) => containsSearchTerm(fullText, term));
  if (conflictingTerm) {
    return {
      accepted: false,
      score: 0,
      evidence: [],
      rejectionReason: `Rejected: metadata identifies an unrelated scene or subject ("${conflictingTerm}").`,
    };
  }
  const titleMatches = spec.productTerms.filter((term) => containsSearchTerm(title, term));
  if (!titleMatches.length) {
    const metadataMatches = spec.productTerms.filter((term) =>
      containsSearchTerm(description, term) || tags.some((tag) => containsSearchTerm(tag, term)));
    if (metadataMatches.length >= 2) {
      return {
        accepted: true,
        score: 0.82,
        evidence: metadataMatches.map((term) => `Description or tags identify product term "${term}".`),
        rejectionReason: '',
      };
    }
    return {
      accepted: false,
      score: 0,
      evidence: [],
      rejectionReason: 'Rejected: title does not identify a category-specific product; category-word overlap alone is insufficient.',
    };
  }
  const corroboratingMatches = spec.productTerms.filter((term) =>
    !titleMatches.includes(term)
    && (containsSearchTerm(description, term) || tags.some((tag) => containsSearchTerm(tag, term))));
  const evidence = [
    ...titleMatches.map((term) => `Title identifies product term "${term}".`),
    ...corroboratingMatches.map((term) => `Description or tags corroborate product term "${term}".`),
  ];
  const score = corroboratingMatches.length ? 0.95 : 0.82;
  return { accepted: true, score, evidence, rejectionReason: '' };
};

export const scoreCategoryMatch = (candidate: OpenPhotoCandidate, category: string): number =>
  evaluateCategoryRelevance(candidate, category).score;

export const buildOpenverseSearchUrl = (category: string): string => {
  if (!getOlistCategorySearchSpec(category)) {
    throw new Error(`No product-specific photo query is configured for Olist category "${category}".`);
  }
  const url = new URL(OPENVERSE_IMAGES_ENDPOINT);
  url.searchParams.set('q', categorySearchQuery(category));
  url.searchParams.set('license', 'cc0,pdm,by,by-sa');
  url.searchParams.set('license_type', 'commercial');
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('mature', 'false');
  url.searchParams.set('page_size', '20');
  url.searchParams.set('format', 'json');
  return url.toString();
};

export const buildWikimediaSearchUrl = (category: string): string => {
  if (!getOlistCategorySearchSpec(category)) {
    throw new Error(`No product-specific photo query is configured for Olist category "${category}".`);
  }
  const url = new URL(WIKIMEDIA_API_ENDPOINT);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', `filetype:bitmap ${categorySearchQuery(category)} photo`);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', '50');
  url.searchParams.set('maxlag', '5');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  url.searchParams.set('iiurlwidth', '1600');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  return url.toString();
};

const retryDelay = (response: Response): number => {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return response.status === 429 ? 30_000 : 1_000;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 30_000;
};

export const fetchWithRespectfulRetry = async (
  url: string,
  options: { retries: number; minimumIntervalMs: number; userAgent?: string; fetcher?: typeof fetch },
): Promise<Response> => {
  if (!isSafeHttpsUrl(url)) throw new Error('Free-image API URLs must use HTTPS and contain no embedded credentials.');
  const fetcher = options.fetcher || fetch;
  let lastError = new Error('Free-image source request failed.');
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, options.minimumIntervalMs));
    try {
      const response = await fetcher(url, {
        headers: {
          accept: 'application/json,image/*',
          'user-agent': options.userAgent || USER_AGENT,
        },
        redirect: 'follow',
      });
      if (response.url && !isSafeHttpsUrl(response.url)) {
        throw new Error('Free-image source redirected to an unsafe URL.');
      }
      if (response.ok) return response;
      const statusMessage = response.status === 401 && new URL(url).hostname === 'api.openverse.org'
        ? 'Openverse returned HTTP 401 for anonymous access. This client intentionally sends no Authorization header; check Openverse current API access requirements.'
        : `Free-image source returned HTTP ${response.status}.`;
      lastError = new Error(statusMessage);
      if (response.status === 429 || response.status === 503) {
        if (attempt < options.retries) await new Promise((resolve) => setTimeout(resolve, retryDelay(response)));
        continue;
      }
      if (response.status >= 500 && attempt < options.retries) {
        await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
        continue;
      }
      throw lastError;
    } catch (error) {
      if (error instanceof Error
        && /^(?:Openverse returned HTTP 401|Free-image source (?:returned HTTP|redirected|request limit exceeded))/.test(error.message)) throw error;
      lastError = error instanceof Error ? error : lastError;
      if (attempt < options.retries) await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    }
  }
  throw lastError;
};

export const parseOpenverseSearchResponse = (value: unknown): OpenPhotoCandidate[] => {
  if (!value || typeof value !== 'object' || !('results' in value) || !Array.isArray(value.results)) {
    throw new Error('Openverse search response did not contain a results array.');
  }
  return value.results
    .map((item) => item && typeof item === 'object' ? normalizeOpenverseResult(item as OpenverseSearchResult) : undefined)
    .filter((item): item is OpenPhotoCandidate => Boolean(item));
};

export const parseWikimediaSearchResponse = (value: unknown): OpenPhotoCandidate[] => {
  if (!value || typeof value !== 'object' || !('query' in value) || !value.query || typeof value.query !== 'object') {
    return [];
  }
  const pages = 'pages' in value.query ? value.query.pages : undefined;
  if (!Array.isArray(pages)) return [];
  return pages
    .map((page) => page && typeof page === 'object' ? normalizeWikimediaPage(page as WikimediaPage) : undefined)
    .filter((item): item is OpenPhotoCandidate => Boolean(item));
};

export const readSearchCache = (
  cachePath: string,
  expectedProvider: OpenverseSearchProvider,
  expectedQuery: string,
  now = Date.now(),
): OpenverseSearchCache | undefined => {
  if (!fs.existsSync(cachePath)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const cache = parsed as Partial<OpenverseSearchCache>;
  const createdAt = Date.parse(cache.createdAt || '');
  if (cache.version !== 2 || cache.provider !== expectedProvider || cache.query !== expectedQuery
    || !Array.isArray(cache.results) || !Number.isFinite(createdAt)
    || now - createdAt > SEARCH_CACHE_MAX_AGE_MS || createdAt > now + 60_000) {
    return undefined;
  }
  return cache as OpenverseSearchCache;
};

export const writeSearchCache = (
  cachePath: string,
  provider: OpenverseSearchProvider,
  query: string,
  results: OpenPhotoCandidate[],
): void => {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify({
    version: 2,
    createdAt: new Date().toISOString(),
    query,
    provider,
    results,
  } satisfies OpenverseSearchCache, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporaryPath, cachePath);
};

export const downloadLicensedPhoto = async (
  candidate: OpenPhotoCandidate,
  outputPath: string,
  retries: number,
  fetcher: typeof fetch = fetch,
): Promise<{ bytes: Buffer; width: number; height: number; format: string; sourceSha256: string }> => {
  if (!isCommerciallyUsableLicense(candidate.license, candidate.licenseUrl)
    || !isSafeHttpsUrl(candidate.imageUrl) || !isSafeHttpsUrl(candidate.sourceUrl)
    || !candidate.creator.trim() || !candidate.attribution.trim()) {
    throw new Error('Photo candidate does not include verified public-use licensing, creator, and source metadata.');
  }
  const response = await fetchWithRespectfulRetry(candidate.imageUrl, {
      retries,
      minimumIntervalMs: 1_000,
      fetcher,
    });
  if (response.url && !isSafeHttpsUrl(response.url)) throw new Error('Photo download redirected to an unsafe URL.');
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error('Source photo exceeds the 15 MiB download limit.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(contentType)) {
    throw new Error('Source must be a raster photograph; SVG and other vector formats are rejected.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Source photo response has no readable body.');
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error('Source photo exceeds the 15 MiB download limit.');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, totalBytes);
  if (!bytes.byteLength) throw new Error('Source photo is empty.');
  let metadata: Metadata;
  try {
    metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new Error('Source must be a decodable raster photograph.');
  }
  if (!metadata.format || !['jpeg', 'png', 'webp', 'avif'].includes(metadata.format)
    || !metadata.width || !metadata.height
    || metadata.width < MIN_IMAGE_DIMENSION || metadata.height < MIN_IMAGE_DIMENSION) {
    throw new Error('Source must be a decodable raster photograph at least 512×512 pixels.');
  }
  const optimized = await sharp(bytes)
    .rotate()
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toBuffer();
  const optimizedMeta = await sharp(optimized).metadata();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, optimized, { flag: 'wx' });
  return {
    bytes: optimized,
    width: optimizedMeta.width || 0,
    height: optimizedMeta.height || 0,
    format: 'webp',
    sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
};

export const createPhotoManifestEntry = (
  product: OlistImageSourceProduct,
  category: string,
  candidate: OpenPhotoCandidate,
  imagePath: string,
  imageBytes: Buffer,
  width: number,
  height: number,
  matchConfidence: number,
  matchReason: string,
  relevanceEvidence: string[],
): OlistPhotoManifestEntry => {
  const productId = product.product_id.toLowerCase();
  return {
    sku: `OLIST-${productId.toUpperCase()}`,
    productId,
    displayTitle: buildOlistDisplayName(category, productId),
    category,
    imagePath,
    sourceProvider: candidate.provider,
    sourceTitle: candidate.title,
    creator: candidate.creator,
    creatorUrl: candidate.creatorUrl,
    sourceUrl: candidate.sourceUrl,
    originalImageUrl: candidate.imageUrl,
    license: candidate.license,
    licenseVersion: candidate.licenseVersion,
    licenseUrl: candidate.licenseUrl,
    attribution: candidate.attribution,
    matchType: 'representative-category-match',
    matchConfidence,
    matchReason,
    relevanceEvidence,
    relevanceStatus: 'candidate-accepted',
    sha256: crypto.createHash('sha256').update(imageBytes).digest('hex'),
    byteLength: imageBytes.byteLength,
    width,
    height,
    validationStatus: 'needs-human-review',
    downloadedAt: new Date().toISOString(),
  };
};

export const validatePhotoManifestEntries = (entries: readonly OlistPhotoManifestEntry[]): void => {
  const skus = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of entries) {
    if (!OLIST_SKU_PATTERN.test(entry.sku) || entry.sku !== `OLIST-${entry.productId.toUpperCase()}`) {
      throw new Error(`Invalid Olist SKU in photo manifest: ${entry.sku}`);
    }
    if (!isSafeHttpsUrl(entry.sourceUrl) || !isSafeHttpsUrl(entry.originalImageUrl)
      || !isSafeHttpsUrl(entry.creatorUrl) || !isCommerciallyUsableLicense(entry.license, entry.licenseUrl)
      || !entry.creator.trim() || !entry.attribution.trim()) {
      throw new Error(`Missing or invalid source, creator, attribution, or license metadata for ${entry.sku}.`);
    }
    if (!/^images\/[a-f\d]{64}\.webp$/i.test(entry.imagePath)
      || !/^[a-f\d]{64}$/i.test(entry.sha256)
      || entry.validationStatus !== 'needs-human-review'
      || entry.matchType !== 'representative-category-match'
      || !['candidate-accepted', 'needs-re-review', 'rejected-pending-validation'].includes(entry.relevanceStatus)
      || !Array.isArray(entry.relevanceEvidence)
      || !Number.isFinite(entry.matchConfidence)
      || entry.matchConfidence < 0 || entry.matchConfidence > 1
      || (entry.relevanceStatus === 'candidate-accepted' && entry.matchConfidence < 0.8)) {
      throw new Error(`Invalid path, match metadata, or hash for ${entry.sku}.`);
    }
    if (skus.has(entry.sku) || hashes.has(entry.sha256)) {
      throw new Error(`Duplicate SKU or image hash rejected for ${entry.sku}.`);
    }
    skus.add(entry.sku);
    hashes.add(entry.sha256);
  }
};

export const countUniqueImageHashes = (entries: readonly { sha256: string }[]): number =>
  new Set(entries.map((entry) => entry.sha256)).size;

export const localPhotoProvenanceStatus = (photoReviewHtml: string): {
  count: number;
  ineligibleCount: number;
  reason: string;
} => {
  const matches = [...photoReviewHtml.matchAll(/<img[^>]+src="\/images\/products\/[^"]+\.jpg"/gi)];
  return {
    count: matches.length,
    ineligibleCount: matches.length,
    reason: 'Existing photo review lists captions only; it lacks verified creator, source URL, and license metadata required for this pilot.',
  };
};
