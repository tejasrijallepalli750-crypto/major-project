import fs from 'node:fs';
import path from 'node:path';
import { catalogSeed } from '../server/catalog/catalogSeed';

const baseUrl = (process.env.AURA_URL || 'http://localhost:3000').replace(/\/$/, '');
const projectRoot = process.cwd();
let products = catalogSeed.map((product) => ({
  ...product,
  id: `prod-${product.sku.toLowerCase()}`,
}));
let source = 'curated seed mapping (database is not yet available)';

try {
  const response = await fetch(`${baseUrl}/api/products?limit=1000`);
  if (response.ok) {
    const result = await response.json() as { data?: typeof products };
    if (Array.isArray(result.data)) {
      products = result.data;
      source = 'live product API';
    }
  } else {
    console.warn(`Live catalog API returned HTTP ${response.status}; auditing curated seed assets instead.`);
  }
} catch {
  console.warn('Live catalog API is unavailable; auditing curated seed assets instead.');
}

const imageOwners = new Map<string, string[]>();
const results = await Promise.all(products.map(async (product) => {
  const owners = imageOwners.get(product.image) || [];
  owners.push(product.id);
  imageOwners.set(product.image, owners);

  const localFile = path.resolve(projectRoot, 'public', `.${product.image}`);
  const contained = localFile.startsWith(`${path.resolve(projectRoot, 'public')}${path.sep}`);
  const exists = contained && fs.existsSync(localFile);
  try {
    const response = await fetch(new URL(product.image, baseUrl));
    const mime = response.headers.get('content-type') || 'missing content-type';
    const body = await response.arrayBuffer();
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      image: product.image,
      response: response.status,
      mime,
      loads: exists && response.ok && mime.startsWith('image/') && body.byteLength > 0,
    };
  } catch {
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      image: product.image,
      response: 'ERROR',
      mime: 'request failed',
      loads: false,
    };
  }
}));

console.log(`Image source: ${source}`);
console.log('id | product | category | image path | HTTP | content-type | duplicate finding');
for (const result of results) {
  const duplicateIds = imageOwners.get(result.image) || [];
  console.log([
    result.id,
    result.name,
    result.category,
    result.image,
    result.response,
    result.mime,
    duplicateIds.length > 1 ? `SHARED with ${duplicateIds.filter((id) => id !== result.id).join(', ')}` : 'unique',
  ].join(' | '));
}

const broken = results.filter((result) => !result.loads);
const duplicatePaths = [...imageOwners.values()].filter((ids) => ids.length > 1);
console.log(`\nProducts audited: ${products.length}`);
console.log(`Images returned as non-empty image/* and present locally: ${results.length - broken.length}/${results.length}`);
console.log(`Duplicate image paths: ${duplicatePaths.length}`);
console.log(`Missing or broken image assets: ${broken.length}`);
if (broken.length || duplicatePaths.length) process.exitCode = 1;
