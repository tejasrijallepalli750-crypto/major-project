import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATABASE_FILE = path.join(ROOT, "data", "aura_database.json");
const CATALOG_FILE = path.join(ROOT, "dataset", "olist_catalog.csv");
const PUBLIC_DIR = path.join(ROOT, "public");
const BACKUP_DIR = path.join(ROOT, "data", "backups");
const IMPORT_MARKER = "Imported from /dataset folder";

function parseCsvLine(line) {
  const fields = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  fields.push(value);
  return fields;
}

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function readCatalogue() {
  const lines = fs.readFileSync(CATALOG_FILE, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("Prepared catalogue has no product rows.");

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const skuIndex = headers.indexOf("sku");
  const nameIndex = headers.indexOf("name");
  const descriptionIndex = headers.indexOf("description");
  const categoryIndex = headers.indexOf("category");
  const brandIndex = headers.indexOf("brand");
  const imageIndex = headers.indexOf("image");
  if ([skuIndex, nameIndex, descriptionIndex, categoryIndex, brandIndex, imageIndex].some((index) => index < 0)) {
    throw new Error("Prepared catalogue must contain sku, name, description, category, brand, and image columns.");
  }

  const catalogue = new Map();
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const sku = (fields[skuIndex] || "").trim();
    const name = (fields[nameIndex] || "").trim();
    const description = (fields[descriptionIndex] || "").trim();
    const category = (fields[categoryIndex] || "").trim();
    const brand = (fields[brandIndex] || "").trim();
    const image = (fields[imageIndex] || "").trim();
    if (!/^OLIST-[a-z0-9]+$/i.test(sku)) continue;
    if (!name || !description || !category) {
      throw new Error(`Prepared catalogue has missing display content for ${sku}.`);
    }
    if (!image.startsWith("/images/") || image.includes("..")) {
      throw new Error(`Unsafe or non-local image path for ${sku}: ${image}`);
    }

    const assetPath = path.resolve(PUBLIC_DIR, image.slice(1));
    const relativeAssetPath = path.relative(PUBLIC_DIR, assetPath);
    if (relativeAssetPath.startsWith("..") || path.isAbsolute(relativeAssetPath) || !fs.existsSync(assetPath)) {
      throw new Error(`Image asset for ${sku} does not exist under public/: ${image}`);
    }
    if (catalogue.has(sku.toUpperCase())) throw new Error(`Duplicate catalogue SKU: ${sku}`);
    catalogue.set(sku.toUpperCase(), { name, description, category, brand, image });
  }
  return catalogue;
}

function createBackup(originalBytes) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `aura_database-before-olist-catalogue-update-${timestamp}.json`;
  const backupPath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(backupPath, originalBytes, { flag: "wx" });

  const backupHash = sha256(fs.readFileSync(backupPath));
  const originalHash = sha256(originalBytes);
  if (backupHash !== originalHash) {
    throw new Error(`Database backup verification failed: ${backupPath}`);
  }
  return backupPath;
}

function main() {
  if (!fs.existsSync(DATABASE_FILE)) throw new Error(`Database file not found: ${DATABASE_FILE}`);
  if (!fs.existsSync(CATALOG_FILE)) throw new Error(`Prepared catalogue not found: ${CATALOG_FILE}`);

  const originalBytes = fs.readFileSync(DATABASE_FILE);
  const database = JSON.parse(originalBytes.toString("utf8"));
  if (!Array.isArray(database.products) || !Array.isArray(database.users) || !Array.isArray(database.orders)) {
    throw new Error("Database does not have valid products, users, and orders collections.");
  }

  const catalogue = readCatalogue();
  const targets = database.products.filter((product) =>
    /^OLIST-/i.test(product.sku || "") && product.features?.includes(IMPORT_MARKER),
  );
  if (targets.length === 0) throw new Error("No imported Olist products with the required import marker were found.");
  if (targets.length !== catalogue.size) {
    throw new Error(`Refusing partial update: database has ${targets.length} marked Olist products; catalogue has ${catalogue.size}.`);
  }

  const updates = [];
  for (const product of targets) {
    const sku = product.sku.toUpperCase();
    const catalogueProduct = catalogue.get(sku);
    if (!catalogueProduct) throw new Error(`Prepared catalogue is missing existing product SKU ${product.sku}.`);
    if (
      ["name", "description", "category", "brand", "image"].some((key) => product[key] !== catalogueProduct[key]) ||
      (product.features || []).includes("Verified specifications")
    ) {
      updates.push({ product, catalogueProduct });
    }
    if (!(product.features || []).includes(IMPORT_MARKER)) {
      throw new Error(`Imported product ${product.sku} is missing its required import marker.`);
    }
  }

  if (updates.length === 0) {
    console.log(`No catalogue display changes required for ${targets.length} imported Olist products.`);
    return;
  }

  const backupPath = createBackup(originalBytes);
  const usersBefore = JSON.stringify(database.users);
  const ordersBefore = JSON.stringify(database.orders);
  const preservedProductFieldsBefore = database.products.map(({ id, sku, price, stock }) => ({
    id, sku, price, stock,
  }));
  const originalFeatures = database.products.map((product) => product.features ? [...product.features] : undefined);
  const targetSkus = new Set(targets.map((product) => product.sku.toUpperCase()));
  const nonTargetProductsBefore = JSON.stringify(database.products.filter((product) => !targets.includes(product)));
  const timestamp = new Date().toISOString();
  for (const { product, catalogueProduct } of updates) {
    Object.assign(product, catalogueProduct);
    product.features = (product.features || []).filter((feature) => feature !== "Verified specifications");
    product.updatedAt = timestamp;
  }
  database.metadata = database.metadata || {};
  database.metadata.lastSavedAt = timestamp;

  if (JSON.stringify(database.users) !== usersBefore || JSON.stringify(database.orders) !== ordersBefore) {
    throw new Error("Refusing to write: user or order records changed unexpectedly.");
  }
  const preservedProductFieldsAfter = database.products.map(({ id, sku, price, stock }) => ({
    id, sku, price, stock,
  }));
  if (JSON.stringify(preservedProductFieldsAfter) !== JSON.stringify(preservedProductFieldsBefore)) {
    throw new Error("Refusing to write: product identity, price, stock, or import markers changed unexpectedly.");
  }

  const temporaryPath = `${DATABASE_FILE}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(database, null, 2), { flag: "wx" });
    JSON.parse(fs.readFileSync(temporaryPath, "utf8"));
    fs.renameSync(temporaryPath, DATABASE_FILE);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }

  const saved = JSON.parse(fs.readFileSync(DATABASE_FILE, "utf8"));
  const savedTargets = saved.products.filter((product) =>
    /^OLIST-/i.test(product.sku || "") && product.features?.includes(IMPORT_MARKER),
  );
  if (savedTargets.length !== catalogue.size || savedTargets.some((product) => {
    const prepared = catalogue.get(product.sku.toUpperCase());
    return !prepared || ["name", "description", "category", "brand", "image"].some((key) => product[key] !== prepared[key]);
  })) {
    throw new Error(`Post-write catalogue verification failed. Original database backup: ${backupPath}`);
  }
  if (JSON.stringify(saved.users) !== usersBefore || JSON.stringify(saved.orders) !== ordersBefore) {
    throw new Error(`Post-write user/order preservation check failed. Original database backup: ${backupPath}`);
  }
  const savedPreservedProductFields = saved.products.map(({ id, sku, price, stock, features }) => ({
    id, sku, price, stock,
  }));
  const savedNonTargetProducts = JSON.stringify(saved.products.filter((product) =>
    !/^OLIST-/i.test(product.sku || "") || !product.features?.includes(IMPORT_MARKER),
  ));
  if (
    JSON.stringify(savedPreservedProductFields) !== JSON.stringify(preservedProductFieldsBefore) ||
    savedNonTargetProducts !== nonTargetProductsBefore ||
    saved.products.some((product, index) => {
      const expectedFeatures = targetSkus.has((product.sku || "").toUpperCase())
        ? (originalFeatures[index] || []).filter((feature) => feature !== "Verified specifications")
        : originalFeatures[index];
      return JSON.stringify(product.features) !== JSON.stringify(expectedFeatures);
    })
  ) {
    throw new Error(`Post-write product preservation check failed. Original database backup: ${backupPath}`);
  }

  const images = new Set(savedTargets.map((product) => product.image));
  console.log(`Updated display names, descriptions, categories, brand labels, and images for ${updates.length} of ${savedTargets.length} imported products.`);
  console.log(`Distinct image paths used: ${images.size}`);
  console.log(`Verified backup: ${backupPath}`);
  console.log(`Preserved users: ${saved.users.length}; orders: ${saved.orders.length}; total products: ${saved.products.length}.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
