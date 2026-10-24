import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "dataset", "olist_raw");
const OUT_FILE = path.join(ROOT, "dataset", "olist_catalog.csv");
const IMAGE_DIR = path.join(ROOT, "public", "images", "olist-products");
const ART_DIR = path.join(ROOT, "public", "images", "catalog-category-art");

const BRL_TO_INR = 18.81;
const PRODUCT_LIMIT = 100;
const DEMO_STOCK = 20;
const FAMILY_GLYPHS = {
  beauty: "M50 20h24l4 18v42H46V38z M47 38h34 M57 12h10v8H57z M53 50h18v15H53z",
  sports: "M36 36a24 24 0 1 0 48 0a24 24 0 1 0-48 0 M42 20l15 12-5 19-16 8 M78 20L63 32l5 19 16 8 M36 36h48",
  garden: "M48 72h28 M62 72V45 M62 46C34 43 34 20 34 20c23 0 34 10 28 26z M63 39c0-19 15-25 29-25 0 0-1 19-29 25z M43 72l5-17h28l5 17",
  home: "M28 46l34-27 34 27v33H28z M40 52h44v27H40z M48 60h28 M48 68h28 M54 79V59 M28 46h68",
  technology: "M28 22h68v44H28z M46 66l-6 12h44l-6-12 M38 34h48v22H38z M54 78h16",
  accessories: "M43 35v-9a19 19 0 0 1 38 0v9 M34 35h56v43H34z M47 51h30v27H47z M54 48a8 8 0 1 1 16 0",
  stationery: "M33 22h27a13 13 0 0 1 13 13v44H46a13 13 0 0 0-13 5z M73 35a13 13 0 0 1 13-13h13v62H73 M43 39h17 M43 50h17 M81 39h10 M81 50h10",
  toys: "M62 19a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M62 39v37 M45 76h34 M47 51h30 M45 60a17 17 0 0 0 34 0",
  automotive: "M26 57l7-21h57l8 21v19H26z M37 36l9-15h31l10 15 M38 76a8 8 0 1 0 0-16a8 8 0 1 0 0 16 M86 76a8 8 0 1 0 0-16a8 8 0 1 0 0 16 M35 52h54",
  food: "M62 26c-26 0-31 21-22 39 6 12 15 21 22 21s16-9 22-21c9-18 4-39-22-39z M62 25c-4-10 4-17 14-19 M62 26c-9-9-20-6-25-1",
  pets: "M42 42a7 7 0 1 0 0-14a7 7 0 1 0 0 14 M60 34a7 7 0 1 0 0-14a7 7 0 1 0 0 14 M78 42a7 7 0 1 0 0-14a7 7 0 1 0 0 14 M31 57a8 8 0 1 0 0-16a8 8 0 1 0 0 16 M88 57a8 8 0 1 0 0-16a8 8 0 1 0 0 16 M39 67c0-13 10-23 23-23s23 10 23 23c0 11-10 18-23 18s-23-7-23-18z",
  music: "M52 70V28l39-8v42 M52 70a12 9 0 1 1-24 0a12 9 0 1 1 24 0 M91 62a12 9 0 1 1-24 0a12 9 0 1 1 24 0",
  general: "M36 34h52l-5 49H41z M30 34l6-13h52l6 13 M49 50h26 M49 62h26 M49 74h15",
};

const categoryOverrides = {
  auto: "Automotive",
  bed_bath_table: "Bedding & Bath",
  computers_accessories: "Computers & Accessories",
  consoles_games: "Gaming",
  cool_stuff: "Everyday Finds",
  general: "Everyday Finds",
  fashion_bags_accessories: "Bags & Accessories",
  furniture_decor: "Home Decor",
  garden_tools: "Garden & Tools",
  health_beauty: "Health & Beauty",
  home_confort: "Home Comfort",
  housewares: "Home Essentials",
  perfumery: "Beauty & Fragrance",
  sports_leisure: "Sports & Outdoors",
  stationery: "Books & Stationery",
  telephony: "Phones & Accessories",
  toys: "Toys & Games",
  watches_gifts: "Watches & Gifts",
};

function readCsv(fileName) {
  const filePath = path.join(RAW, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);

  const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some(value => value.length > 0)) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows.shift().map(header => header.trim());
  return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
}

function humanizeCategory(value) {
  if (!value) return "General";
  const normalized = value.trim().toLowerCase();
  if (categoryOverrides[normalized]) return categoryOverrides[normalized];
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/\b[a-z]/g, character => character.toUpperCase());
}

function categoryFamily(category) {
  const value = category.toLowerCase();
  if (/beauty|health|perfum|care/.test(value)) return "beauty";
  if (/sport|leisure|outdoor/.test(value)) return "sports";
  if (/garden|tool|agro|construction/.test(value)) return "garden";
  if (/bed|bath|comfort|houseware|home|furniture|decor/.test(value)) return "home";
  if (/computer|electronics|audio|telephony|phone|consol|game/.test(value)) return "technology";
  if (/watch|gift|jewel|fashion|bag|luggage|accessor/.test(value)) return "accessories";
  if (/stationery|book|office|education/.test(value)) return "stationery";
  if (/toy|baby|child/.test(value)) return "toys";
  if (/auto|car|motor/.test(value)) return "automotive";
  if (/food|drink|market/.test(value)) return "food";
  if (/pet/.test(value)) return "pets";
  if (/music|instrument/.test(value)) return "music";
  return "general";
}

function existingImageForCategory(category) {
  const value = category.toLowerCase();
  if (/watch/.test(value)) return "/images/product_smartwatch_titanium_1792292818604.jpg";
  if (/bag|luggage/.test(value)) return "/images/product_leather_bag_1792292819084.jpg";
  if (/computer/.test(value)) return "/images/product_mechanical_keyboard_1792292819678.jpg";
  if (/audio|headphone|earbud|earphone/.test(value)) return "/images/product_headphones_matte_1792292817977.jpg";
  return null;
}

function categoryImageSvg(family, category, seed) {
  const hue = seed % 360;
  const accentHue = (hue + 44 + (seed % 37)) % 360;
  const glyph = FAMILY_GLYPHS[family] || FAMILY_GLYPHS.general;
  const escapedCategory = category.replace(/[&<>"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  })[character]);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" role="img" aria-label="Illustrative ${escapedCategory} category artwork">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="hsl(${hue} 58% 95%)"/><stop offset="1" stop-color="hsl(${accentHue} 65% 89%)"/></linearGradient><linearGradient id="item" x2="1" y2="1"><stop stop-color="hsl(${hue} 54% 54%)"/><stop offset="1" stop-color="hsl(${accentHue} 56% 38%)"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#27364b" flood-opacity=".15"/></filter></defs>
<rect width="480" height="360" rx="28" fill="url(#bg)"/><circle cx="405" cy="62" r="54" fill="#fff" opacity=".34"/><circle cx="72" cy="300" r="78" fill="#fff" opacity=".28"/>
<path d="M58 274c92-28 241-28 365 0" fill="none" stroke="#fff" stroke-width="2" opacity=".65"/>
<circle cx="62" cy="50" r="37" transform="translate(178 57)" fill="#fff" opacity=".55" filter="url(#shadow)"/>
<g transform="translate(178 57)" fill="none" stroke="url(#item)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="${glyph}"/></g>
<path d="M32 316h416" stroke="#fff" stroke-width="2" opacity=".7"/><text x="34" y="341" font-family="Arial,sans-serif" font-size="15" font-weight="600" fill="#344054">${escapedCategory}</text>
<circle cx="${90 + (seed % 300)}" cy="${60 + (seed % 35)}" r="${4 + (seed % 5)}" fill="hsl(${accentHue} 58% 50%)" opacity=".55"/><circle cx="${330 - (seed % 100)}" cy="${110 + (seed % 30)}" r="${3 + (seed % 4)}" fill="#fff" opacity=".8"/>
</svg>`;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function getProductName(category, index) {
  const qualifiers = ["Everyday", "Thoughtful", "Modern", "Classic", "Curated"];
  const descriptors = ["Essential", "Selection", "Accent"];
  const qualifier = qualifiers[index % qualifiers.length];
  const descriptor = descriptors[Math.floor(index / qualifiers.length)];
  return `${qualifier} ${category} ${descriptor}`;
}

const productRows = readCsv("olist_products_dataset.csv");
const itemRows = readCsv("olist_order_items_dataset.csv");
const translationRows = readCsv("product_category_name_translation.csv");
const reviewRows = readCsv("olist_order_reviews_dataset.csv");

const productsById = new Map(productRows.map(product => [product.product_id, product]));
const translations = new Map(translationRows.map(row => [row.product_category_name, row.product_category_name_english]));
const priceStats = new Map();
const reviewByOrder = new Map();

for (const review of reviewRows) {
  const score = Number(review.review_score);
  if (review.order_id && Number.isFinite(score) && score > 0) reviewByOrder.set(review.order_id, score);
}

const ratingsByProduct = new Map();
for (const item of itemRows) {
  const id = item.product_id;
  if (!productsById.has(id)) continue;
  const price = Number(item.price);
  if (Number.isFinite(price) && price > 0) {
    const stats = priceStats.get(id) || { total: 0, count: 0 };
    stats.total += price;
    stats.count += 1;
    priceStats.set(id, stats);
  }
  const score = reviewByOrder.get(item.order_id);
  if (score !== undefined) {
    const reviews = ratingsByProduct.get(id) || new Map();
    reviews.set(item.order_id, score);
    ratingsByProduct.set(id, reviews);
  }
}

const candidates = [...priceStats.entries()]
  .filter(([id]) => productsById.has(id))
  .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
  .slice(0, PRODUCT_LIMIT);

if (!candidates.length) throw new Error("No products with valid historical prices were found.");

const headers = ["name", "description", "price", "category", "stock", "sku", "brand", "image", "rating", "numReviews"];
const indexesByFamily = new Map();
const generatedImages = new Map();

const outputRows = candidates.map(([id, stats]) => {
  const sourceProduct = productsById.get(id);
  const sourceCategory = sourceProduct.product_category_name;
  const category = humanizeCategory(
    translations.get(sourceCategory) || sourceCategory || "General",
  );
  const family = categoryFamily(category);
  const nameIndex = indexesByFamily.get(`${family}:${category}`) || 0;
  indexesByFamily.set(`${family}:${category}`, nameIndex + 1);

  const averageHistoricalBRL = stats.total / stats.count;
  const indicativeINR = Math.max(1, Math.round(averageHistoricalBRL * BRL_TO_INR));
  const reviews = [...(ratingsByProduct.get(id)?.values() || [])];
  const averageRating = reviews.length
    ? Number((reviews.reduce((total, score) => total + score, 0) / reviews.length).toFixed(1))
    : 0;
  const sku = `OLIST-${id}`;
  const fileName = `${sku}.svg`;
  const imagePath = existingImageForCategory(category) || `/images/olist-products/${fileName}`;
  const seed = [...id].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
  if (!existingImageForCategory(category)) {
    generatedImages.set(fileName, categoryImageSvg(family, category, seed));
  }

  return [
    getProductName(category, nameIndex),
    `A considered pick from our ${category} collection, selected to bring more choice to your everyday shopping.`,
    indicativeINR,
    category,
    DEMO_STOCK,
    sku,
    "",
    imagePath,
    averageRating,
    reviews.length,
  ];
});

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.mkdirSync(IMAGE_DIR, { recursive: true });
fs.mkdirSync(ART_DIR, { recursive: true });

for (const [fileName, contents] of generatedImages) {
fs.writeFileSync(path.join(IMAGE_DIR, fileName), contents, "utf8");
}
const defaultArtFiles = new Map();
for (const row of outputRows) {
  const category = row[3];
  const family = categoryFamily(category);
  if (!defaultArtFiles.has(family)) {
    defaultArtFiles.set(family, categoryImageSvg(family, category, family.length * 47));
  }
}
defaultArtFiles.set("general", categoryImageSvg("general", "Everyday Finds", 97));
for (const [family, contents] of defaultArtFiles) {
  fs.writeFileSync(path.join(ART_DIR, `${family}.svg`), contents, "utf8");
}

const csv = [
  headers.map(escapeCsv).join(","),
  ...outputRows.map(row => row.map(escapeCsv).join(",")),
].join("\r\n") + "\r\n";
fs.writeFileSync(OUT_FILE, csv, "utf8");

console.log(`Created: ${OUT_FILE}`);
console.log(`Products prepared: ${outputRows.length}`);
console.log(`Category-matched local illustrations created: ${generatedImages.size}`);
console.log(`Existing local category photographs reused: ${outputRows.length - generatedImages.size}`);
console.log("Display titles and descriptions are curated demo copy; they are not original product titles.");
console.log(`Indicative INR prices use a BRL conversion rate of ${BRL_TO_INR} and historical order-item prices.`);
console.log("Original Olist source CSV files were not modified.");
