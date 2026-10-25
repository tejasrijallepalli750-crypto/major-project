import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ABO_DATASET_ATTRIBUTION,
  ABO_DATASET_LICENSE,
  ABO_DATASET_LICENSE_URL,
  ABO_LISTING_METADATA_URL,
  aboSampleProducts,
  resolveAboSampleImageSrc,
} from './aboSampleCatalog';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('ABO sample contains ten unique listing-to-main-image pairs with matching local assets', async () => {
  assert.equal(aboSampleProducts.length, 10);
  assert.equal(new Set(aboSampleProducts.map((product) => `${product.domain}:${product.itemId}`)).size, 10);
  assert.equal(new Set(aboSampleProducts.map((product) => product.mainImageId)).size, 10);
  assert.equal(new Set(aboSampleProducts.map((product) => product.sha256)).size, 10);

  for (const product of aboSampleProducts) {
    assert.equal(product.purchasable, false);
    assert.match(product.itemId, /^B[A-Z0-9]+$/);
    assert.match(product.imagePath, new RegExp(`^/images/abo-sample/${product.itemId}-${product.mainImageId}\\.jpg$`));
    assert.ok(product.sourceImageUrl.endsWith(`/${product.mainImageId}.${product.sourceVariant}`));
    assert.equal(new URL(product.sourceListingUrl).hostname.replace(/^www\./, ''), product.domain);
    assert.equal(product.metadataSourceUrl, ABO_LISTING_METADATA_URL);

    const imagePath = path.join(projectRoot, 'public', product.imagePath.slice(1));
    const image = fs.readFileSync(imagePath);
    assert.equal(image.length, product.sourceBytes);
    assert.equal(crypto.createHash('sha256').update(image).digest('hex'), product.sha256);
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.equal(metadata.width, product.width);
    assert.equal(metadata.height, product.height);
  }
});

test('ABO sample records retain CC BY licensing, required attribution, and image processing provenance', () => {
  assert.match(ABO_DATASET_ATTRIBUTION, /Amazon\.com/);
  assert.match(ABO_DATASET_ATTRIBUTION, /Matthieu Guillaumin/);
  assert.match(ABO_DATASET_ATTRIBUTION, /Jitendra Malik/);

  for (const product of aboSampleProducts) {
    assert.equal(product.license, ABO_DATASET_LICENSE);
    assert.equal(product.licenseUrl, ABO_DATASET_LICENSE_URL);
    assert.equal(product.attribution, ABO_DATASET_ATTRIBUTION);
    assert.ok(product.sourceListingUrl.startsWith('https://'));
    assert.ok(product.sourceImageUrl.startsWith('https://'));
    assert.match(product.imageProcessing, /500_/);
    assert.match(product.imageProcessing, /byte-for-byte/);
    assert.match(product.changesMade, /no further local processing|otherwise alter/i);
  }
});

test('ABO sample image URLs honor the configured application base path', () => {
  const imagePath = '/images/abo-sample/B07P8ML82R-619y9YG9cnL.jpg';
  assert.equal(resolveAboSampleImageSrc(imagePath, '/'), imagePath);
  assert.equal(
    resolveAboSampleImageSrc(imagePath, '/aura/'),
    '/aura/images/abo-sample/B07P8ML82R-619y9YG9cnL.jpg',
  );
  assert.equal(
    resolveAboSampleImageSrc(imagePath, '/aura'),
    '/aura/images/abo-sample/B07P8ML82R-619y9YG9cnL.jpg',
  );
});

test('ABO sample stays outside Olist, cart, checkout, and order flows', () => {
  assert.ok(aboSampleProducts.every((product) => !product.itemId.toUpperCase().startsWith('OLIST-')));

  const samplePage = fs.readFileSync(path.join(projectRoot, 'src/pages/AboSampleCatalogPage.tsx'), 'utf8');
  assert.doesNotMatch(samplePage, /ProductCard|useCart|useWishlist|createOrder|Payment|\/api\//);
  assert.match(samplePage, /cannot be added to a\s+cart/);

  const app = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8');
  assert.match(app, /currentView === 'abo-sample' && <AboSampleCatalogPage \/>/);
  assert.match(app, /currentView === 'catalog' && \(/);
  assert.match(app, /currentView === 'checkout' && \(/);

  const orderRoutes = fs.readFileSync(path.join(projectRoot, 'server/routes/orderRoutes.ts'), 'utf8');
  assert.doesNotMatch(orderRoutes, /aboSampleProducts|AboSampleCatalogPage/);
});
