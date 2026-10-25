import fs from 'node:fs';
import path from 'node:path';
import { catalogSeed } from '../server/catalog/catalogSeed';
import { usesSharedOlistCatalogImage } from '../src/utils/productPresentation';

interface ProductImageRecord {
  id: string;
  sku: string;
  name: string;
  image: string;
}

interface ProductApiPage {
  data?: ProductImageRecord[];
  totalPages?: number;
}

const baseUrl = (process.env.AURA_URL || 'http://localhost:3000').replace(/\/$/, '');
const projectRoot = process.cwd();
const publicRoot = path.resolve(projectRoot, 'public');
let products: ProductImageRecord[] = catalogSeed.map((product) => ({
  ...product,
  id: `prod-${product.sku.toLowerCase()}`,
}));
let source = 'curated seed mapping (database API unavailable)';

try {
  const firstResponse = await fetch(`${baseUrl}/api/products?limit=1000&page=1`);
  if (firstResponse.ok) {
    const firstPage = await firstResponse.json() as ProductApiPage;
    if (!Array.isArray(firstPage.data) || !Number.isInteger(firstPage.totalPages)) {
      throw new Error('Product API returned invalid pagination metadata.');
    }
    const fetchedProducts = [...firstPage.data];
    for (let page = 2; page <= firstPage.totalPages!; page += 1) {
      const response = await fetch(`${baseUrl}/api/products?limit=1000&page=${page}`);
      if (!response.ok) throw new Error(`Product API returned HTTP ${response.status} for page ${page}.`);
      const result = await response.json() as ProductApiPage;
      if (!Array.isArray(result.data)) throw new Error(`Product API returned invalid data for page ${page}.`);
      fetchedProducts.push(...result.data);
    }
    products = fetchedProducts;
    source = 'all active product API pages';
  } else {
    console.warn(`Live catalog API returned HTTP ${firstResponse.status}; auditing curated seed assets instead.`);
  }
} catch (error) {
  console.warn(
    `Live catalog API could not be fully read (${error instanceof Error ? error.name : 'UnknownError'}); auditing curated seed assets instead.`,
  );
}

const imageOwners = new Map<string, ProductImageRecord[]>();
for (const product of products) {
  const owners = imageOwners.get(product.image) || [];
  owners.push(product);
  imageOwners.set(product.image, owners);
}

const localPaths = new Map<string, { filePath: string; contained: boolean; exists: boolean }>();
for (const image of imageOwners.keys()) {
  const filePath = path.resolve(publicRoot, `.${image}`);
  const contained = image.startsWith('/images/')
    && !image.startsWith('//')
    && filePath.startsWith(`${publicRoot}${path.sep}`);
  localPaths.set(image, {
    filePath,
    contained,
    exists: contained && fs.existsSync(filePath),
  });
}

const uniqueImages = [...imageOwners.keys()];
const imageResults = new Map<string, { response: number | string; mime: string; loads: boolean }>();
let nextImageIndex = 0;
const worker = async (): Promise<void> => {
  while (nextImageIndex < uniqueImages.length) {
    const image = uniqueImages[nextImageIndex];
    nextImageIndex += 1;
    const local = localPaths.get(image)!;
    if (!local.exists) {
      imageResults.set(image, { response: 'LOCAL FILE MISSING', mime: 'not checked', loads: false });
      continue;
    }
    try {
      const response = await fetch(new URL(image, baseUrl));
      const mime = response.headers.get('content-type') || 'missing content-type';
      const body = await response.arrayBuffer();
      imageResults.set(image, {
        response: response.status,
        mime,
        loads: response.ok && mime.startsWith('image/') && body.byteLength > 0,
      });
    } catch {
      imageResults.set(image, { response: 'REQUEST FAILED', mime: 'not available', loads: false });
    }
  }
};
await Promise.all(Array.from({ length: Math.min(12, uniqueImages.length) }, () => worker()));

const broken = products.filter((product) => !imageResults.get(product.image)?.loads);
const duplicatePaths = [...imageOwners.entries()].filter(([image, owners]) =>
  owners.length > 1 && !owners.every((product) => usesSharedOlistCatalogImage(product.sku, image)),
);
console.log(`Image source: ${source}`);
console.log(`Products audited: ${products.length}`);
console.log(`Unique local image paths checked: ${uniqueImages.length}`);
console.log(`Images served as non-empty image/* and present locally: ${uniqueImages.length - new Set(broken.map((product) => product.image)).size}/${uniqueImages.length}`);
console.log(`Products with missing or broken image assets: ${broken.length}`);
console.log(`Unexpected duplicate image paths: ${duplicatePaths.length}`);
for (const product of broken.slice(0, 30)) {
  const result = imageResults.get(product.image);
  console.error(`${product.sku} | ${product.name} | ${product.image} | ${result?.response} | ${result?.mime}`);
}
for (const [image, owners] of duplicatePaths) {
  console.error(`${image} | shared by ${owners.map((product) => product.sku).join(', ')}`);
}
if (broken.length || duplicatePaths.length) process.exitCode = 1;
