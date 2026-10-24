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

export const formatCategoryLabel = (category: string): string => {
  const normalized = category.trim().toLowerCase();
  if (!normalized) return 'General';
  if (categoryLabels[normalized]) return categoryLabels[normalized];

  return category
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
};

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

export const getCategoryArtPath = (category: string): string =>
  `/images/catalog-category-art/${getCategoryArtFamily(category)}.svg`;

export const isIllustrativeCatalogImage = (sku: string): boolean =>
  sku.toUpperCase().startsWith('OLIST-');
