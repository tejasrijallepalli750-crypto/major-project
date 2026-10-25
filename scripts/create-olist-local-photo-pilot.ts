import fs from 'node:fs';
import path from 'node:path';
import { parseOlistCsv } from './olist-product-importer';
import { buildOlistDisplayName, OlistImageSourceProduct } from './olist-image-enrichment';
import {
  buildLocalPhotoPilot,
  createLocalPhotoContactSheet,
  escapeXml,
  inventoryLocalPhotos,
  LOCAL_PHOTO_ASSIGNMENTS,
  parsePhotoReviewHtml,
  validateLocalPhotoPilot,
} from './olist-local-photo-pilot';
import { formatCategoryLabel } from '../src/utils/productPresentation';

const ROOT = process.cwd();
const PUBLIC_ROOT = path.resolve(ROOT, 'public');
const OUTPUT_ROOT = path.resolve(ROOT, 'data', 'olist-image-enrichment', 'pilot-local-photos');

const writeJson = (filename: string, value: unknown): void => {
  fs.writeFileSync(path.join(OUTPUT_ROOT, filename), `${JSON.stringify(value, null, 2)}\n`);
};

const main = async (): Promise<void> => {
  const cards = parsePhotoReviewHtml(fs.readFileSync(path.join(PUBLIC_ROOT, 'photo-review.html'), 'utf8'));
  const inventory = await inventoryLocalPhotos(cards, PUBLIC_ROOT);
  const products = parseOlistCsv<OlistImageSourceProduct>(
    fs.readFileSync(path.join(ROOT, 'dataset', 'olist_raw', 'olist_products_dataset.csv'), 'utf8'),
  );
  const translationRows = parseOlistCsv<Record<string, string>>(
    fs.readFileSync(path.join(ROOT, 'dataset', 'olist_raw', 'product_category_name_translation.csv'), 'utf8'),
  );
  const translations = new Map(translationRows.map((row) => [
    row.product_category_name,
    row.product_category_name_english,
  ]));
  const plan = buildLocalPhotoPilot(
    inventory,
    products,
    translations,
    LOCAL_PHOTO_ASSIGNMENTS,
    formatCategoryLabel,
    buildOlistDisplayName,
  );
  validateLocalPhotoPilot(plan.entries);
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  writeJson('inventory.json', inventory);
  writeJson('manifest.json', {
    source: 'Existing local product photographs; not original Olist product photos.',
    generatedAt: new Date().toISOString(),
    requestedCount: LOCAL_PHOTO_ASSIGNMENTS.length,
    completedCount: plan.entries.length,
    uniqueSourceHashes: new Set(plan.entries.map((entry) => entry.sha256)).size,
    licenseNotice: 'Repository metadata does not include license proof. Confirm the source terms before production use.',
    entries: plan.entries,
    missingCategories: plan.missingCategories,
    rejectedPhotos: plan.rejectedPhotos,
  });
  await createLocalPhotoContactSheet(
    plan.entries,
    PUBLIC_ROOT,
    path.join(OUTPUT_ROOT, 'contact-sheet.jpg'),
  );
  const tableRows = plan.entries.map((entry) => `<tr>
    <td><code>${escapeXml(entry.sku)}</code><br>${escapeXml(entry.displayTitle)}</td>
    <td>${escapeXml(entry.category)}</td>
    <td><img src="${escapeXml(`../../../public${entry.sourceImagePath}`)}" alt="${escapeXml(entry.caption)}"><br><code>${escapeXml(entry.imageFilename)}</code></td>
    <td>${escapeXml(entry.caption)}</td>
    <td>${escapeXml(entry.matchType)}<br>Confidence: ${entry.confidence.toFixed(2)}<br>${escapeXml(entry.rationale)}</td>
    <td>${entry.width}×${entry.height} JPEG<br><code>${entry.sha256}</code><br>${escapeXml(entry.validationStatus)}</td>
  </tr>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AURA local photo pilot</title>
  <style>body{font:15px system-ui,sans-serif;margin:24px;color:#183047}p{max-width:1000px;line-height:1.5}.sheet{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd6df;padding:12px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#edf3f7}td img{width:min(34vw,420px);height:min(34vw,420px);min-width:280px;min-height:280px;object-fit:contain;background:#f4f6f8}code{overflow-wrap:anywhere}td{max-width:500px}</style>
  <h1>AURA Olist local photographic pilot</h1>
  <p>${plan.entries.length} of ${LOCAL_PHOTO_ASSIGNMENTS.length} selected local photographs passed raster validation. These are existing Pexels-named local photos used as representative category matches, not verified original Olist product photos. All require human review. License/attribution evidence is not stored in this repository; verify permissions before production use. No external provider or database was used.</p>
  <p>Distinct source hashes: ${new Set(plan.entries.map((entry) => entry.sha256)).size} of ${plan.entries.length}.</p>
  <h2>Contact sheet</h2><img class="sheet" src="./contact-sheet.jpg" alt="Selected local photographic pilot contact sheet">
  <h2>Product-by-product review</h2><table><thead><tr><th>SKU / generated display title</th><th>Translated category</th><th>Large photo preview / filename</th><th>Existing photo caption and description</th><th>Match type / confidence</th><th>Raster validation / SHA-256</th></tr></thead><tbody>${tableRows}</tbody></table>
  ${plan.missingCategories.length ? `<h2>Categories without a valid selected photo</h2><p>${plan.missingCategories.map(escapeXml).join(', ')}</p>` : ''}
  ${plan.rejectedPhotos.length ? `<h2>Rejected photos</h2><ul>${plan.rejectedPhotos.map((item) => `<li>${escapeXml(item.filename)}: ${escapeXml(item.reason)}</li>`).join('')}</ul>` : ''}
  </html>`;
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'report.html'), html);
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'report.csv'), [
    'sku,display_title,category,image_filename,source_image_path,caption,sha256,match_type,match_confidence,rationale,validation_status',
    ...plan.entries.map((entry) => [
      entry.sku,
      entry.displayTitle,
      entry.category,
      entry.imageFilename,
      entry.sourceImagePath,
      entry.caption,
      entry.sha256,
      entry.matchType,
      entry.confidence.toFixed(2),
      entry.rationale,
      entry.validationStatus,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')),
  ].join('\n') + '\n');
  console.log(`Local photo inventory: ${inventory.length}; valid JPEG rasters: ${inventory.filter((item) => item.validRaster).length}.`);
  console.log(`Pilot photos passed: ${plan.entries.length}/${LOCAL_PHOTO_ASSIGNMENTS.length}.`);
  console.log(`Distinct source-image hashes: ${new Set(plan.entries.map((entry) => entry.sha256)).size}/${plan.entries.length}.`);
  console.log(`Categories represented: ${new Set(plan.entries.map((entry) => entry.category)).size}.`);
  if (plan.missingCategories.length) console.log(`Categories missing valid photos: ${plan.missingCategories.join(', ')}.`);
  if (plan.rejectedPhotos.length) console.log(`Rejected candidate photos: ${JSON.stringify(plan.rejectedPhotos)}.`);
  console.log(`HTML report: ${path.join(OUTPUT_ROOT, 'report.html')}`);
  console.log(`Contact sheet: ${path.join(OUTPUT_ROOT, 'contact-sheet.jpg')}`);
  console.log('No external APIs or MongoDB were used; source product data and image files were not modified.');
};

main().catch((error: unknown) => {
  console.error(`Local Olist photo pilot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exitCode = 1;
});
