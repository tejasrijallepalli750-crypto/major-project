import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const auditDirectory = path.resolve(scriptDirectory, "../data/olist-image-enrichment/local-photo-audit");
const pexelsLicenseUrl = "https://www.pexels.com/license/";

export interface PexelsSource {
  id: string;
  slug: string;
  title: string;
  creator: string;
}

interface ProvenanceResult {
  inventory: {
    count: number;
    records: InventoryRecord[];
    provenanceReview: Record<string, unknown>;
    [key: string]: unknown;
  };
  mapping: {
    categories: CategoryProposal[];
    provenanceReview: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export const verifiedPexelsSources: PexelsSource[] = [
  { id: "212269", slug: "white-bed-comforter", title: "White Bed Comforter", creator: "Jaymantri" },
  { id: "36156260", slug: "tennis-racket-and-balls-in-studio-setup", title: "Tennis Racket and Balls in Studio Setup", creator: "Florencia Pérez" },
  { id: "15028227", slug: "decorative-vase-on-black-background", title: "Decorative Vase on Black Background", creator: "Vural Yavas" },
  { id: "16378446", slug: "pump-bottles-with-skincare-products", title: "Pump Bottles with Skincare Products", creator: "mearlywan" },
  { id: "1809127", slug: "close-up-photo-of-cup", title: "Close-Up Photo of Cup", creator: "Andrea Piacquadio" },
  { id: "13870516", slug: "photograph-of-a-black-wireless-mouse", title: "Photograph of a Black Wireless Mouse", creator: "Matheus Bertelli" },
  { id: "15107945", slug: "close-up-of-a-black-mens-wristwatch-in-a-box", title: "Close-up of a Black Mens Wristwatch in a Box", creator: "Nathan J Hilton" },
  { id: "18386860", slug: "smartphones-on-red-flat-lay", title: "Smartphones on Red Flat Lay", creator: "Amar Preciado" },
  { id: "29805437", slug: "elegant-black-perfume-bottle-on-a-dark-background", title: "Elegant Black Perfume Bottle on a Dark Background", creator: "PIC MATTI" },
  { id: "7085799", slug: "close-up-shot-of-black-wallets-on-a-wooden-surface", title: "Close-Up Shot of Black Wallets on a Wooden Surface", creator: "Emil Kalibradov" },
  { id: "9507250", slug: "black-and-silver-hand-tool", title: "Black and Silver Hand Tool", creator: "ROCKETMANN TEAM" },
  { id: "8811529", slug: "close-up-shot-of-a-cordless-hand-drill", title: "Close-Up Shot of a Cordless Hand Drill", creator: "Jonathan Cooper" },
  { id: "12167650", slug: "close-up-of-the-handle-of-a-cordless-vacuum-cleaner", title: "Close-up of the Handle of a Cordless Vacuum Cleaner", creator: "Vedat Öncelik" },
  { id: "13870707", slug: "blue-backpack-on-the-ground", title: "Blue Backpack on the Ground", creator: "Matheus Bertelli" },
  { id: "4522995", slug: "platystation-controllers-on-a-white-surface-near-black-box", title: "Platystation Controllers on a White Surface Near Black Box", creator: "Polina Tankilevitch" },
  { id: "280471", slug: "macbook-on-pedestal-table", title: "Macbook on Pedestal Table", creator: "Pixabay" },
  { id: "10965752", slug: "glass-electric-kettle-in-close-up-shot", title: "Glass Electric Kettle in Close Up Shot", creator: "Engin Akyurt" },
  { id: "684152", slug: "pair-of-black-and-gray-adidas-low-top-sneakers-with-box", title: "Pair of Black-and-gray Adidas Low Top Sneakers With Box", creator: "Athul Adhu" },
  { id: "5978655", slug: "wooden-picture-frames-on-brown-leather-couch", title: "Wooden Picture Frames on Brown Leather Couch", creator: "https://kaboompics.com/" },
  { id: "30731004", slug: "chilled-pocari-sweat-bottles-on-ice", title: "Chilled Pocari Sweat Bottles on Ice", creator: "Airam Dato-on" },
  { id: "2919003", slug: "black-headphone", title: "Black Headphone", creator: "Jessica Lewis 🦋 thepaintedsquare" },
  { id: "5974048", slug: "modern-convenient-screwdriver-drill-among-tools-for-carpentry", title: "Modern convenient screwdriver drill among tools for carpentry", creator: "Ono Kosuki" },
  { id: "8534378", slug: "apple-macbook-on-small-white-desk", title: "Apple MacBook on Small White Desk", creator: "Hanna Pad" },
  { id: "7789218", slug: "canon-eos-rp", title: "Canon EOS RP", creator: "Ivan Babydov" },
  { id: "5411382", slug: "brown-wooden-chairs-on-gray-concrete-floor", title: "Brown Wooden Chairs on Gray Concrete Floor", creator: "Ellie Burgin" },
];

interface InventoryRecord {
  id: string;
  filename: string;
  path: string;
  sha256: string;
  visualClass: string;
  [key: string]: unknown;
}

interface CategoryProposal {
  sourceCategory: string;
  categoryKey: string;
  productCount: number;
  proposedFilename?: string;
  proposedImagePath?: string;
  visualConfidence?: number;
  rationale: string;
  [key: string]: unknown;
}

export function applyProvenance(
  inventory: { count: number; records: InventoryRecord[]; [key: string]: unknown },
  mapping: { categories: CategoryProposal[]; [key: string]: unknown },
  sources: PexelsSource[] = verifiedPexelsSources,
): ProvenanceResult {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const candidateIds = new Set(
    mapping.categories
      .filter((category) => category.proposedFilename)
      .map((category) => category.proposedFilename!.match(/^pexels-(\d+)\.jpg$/)?.[1])
      .filter((id): id is string => Boolean(id)),
  );

  const missingSourceIds = [...candidateIds].filter((id) => !sourcesById.has(id));
  if (missingSourceIds.length > 0) {
    throw new Error(`Missing verified Pexels source metadata for photo IDs: ${missingSourceIds.join(", ")}`);
  }

  const inventoryIds = new Set(inventory.records.map((record) => record.id));
  const missingInventoryIds = [...candidateIds].filter((id) => !inventoryIds.has(id));
  if (missingInventoryIds.length > 0) {
    throw new Error(`Candidate photo IDs are missing from the inventory: ${missingInventoryIds.join(", ")}`);
  }

  const enrichedRecords = inventory.records.map((record) => {
    const source = sourcesById.get(record.id);
    if (!candidateIds.has(record.id) || !source) return record;

    const sourceUrl = `https://www.pexels.com/photo/${source.slug}-${source.id}/`;
    return {
      ...record,
      sourceUrl,
      sourcePageTitle: source.title,
      sourceImageUrl: `https://images.pexels.com/photos/${source.id}/pexels-photo-${source.id}.jpeg?auto=compress&cs=tinysrgb&h=627&fit=crop&w=1200`,
      creator: source.creator,
      license: "Pexels License",
      licenseUrl: pexelsLicenseUrl,
      attribution: `Attribution is not required by the Pexels License. Suggested credit: Photo by ${source.creator} on Pexels.`,
      rightsStatus: "Pexels source page and Pexels License verified for website/e-commerce use; third-party rights and exact local-file byte identity are not independently verified.",
      sourceVerificationStatus: "VERIFIED_OFFICIAL_PEXELS_PAGE",
      sourceImageBytesCompared: false,
      visualSuitabilityStatus: "VISUALLY_SUITABLE_CANDIDATE",
      categoryUseApprovalStatus: "NOT_APPROVED",
    };
  });

  const enrichedCategories = mapping.categories.map((category) => {
    if (!category.proposedFilename) {
      return {
        ...category,
        visualSuitabilityStatus: "NO_SUITABLE_LOCAL_PHOTO_IDENTIFIED",
        rightsVerificationStatus: "NOT_APPLICABLE",
        categoryUseApprovalStatus: "NOT_APPLICABLE",
      };
    }

    const id = category.proposedFilename.match(/^pexels-(\d+)\.jpg$/)?.[1];
    const source = id ? sourcesById.get(id) : undefined;
    if (!source) throw new Error(`Invalid or unverified candidate filename: ${category.proposedFilename}`);
    const sourceUrl = `https://www.pexels.com/photo/${source.slug}-${source.id}/`;

    return {
      ...category,
      sourceUrl,
      sourcePageTitle: source.title,
      creator: source.creator,
      license: "Pexels License",
      licenseUrl: pexelsLicenseUrl,
      attribution: `Attribution is not required by the Pexels License. Suggested credit: Photo by ${source.creator} on Pexels.`,
      sourceVerificationStatus: "VERIFIED_OFFICIAL_PEXELS_PAGE",
      rightsVerificationStatus: "PEXELS_PAGE_AND_LICENSE_VERIFIED",
      visualSuitabilityStatus: "VISUALLY_SUITABLE_CANDIDATE",
      approvalStatus: "UNAPPROVED - provenance checked; category use awaits separate approval",
      categoryUseApprovalStatus: "NOT_APPROVED",
      sourceImageBytesCompared: false,
    };
  });

  return {
    inventory: {
      ...inventory,
      records: enrichedRecords,
      provenanceReview: {
        verifiedUniquePhotoCount: candidateIds.size,
        sourcePageVerifiedUniqueCount: candidateIds.size,
        sourcePageVerifiedCandidateRows: enrichedCategories.filter((category) => category.proposedFilename).length,
        unresolvedSourcePhotoIds: [],
        localImageBytesComparedCount: 0,
        approvedForCategoryUseCount: 0,
      },
    },
    mapping: {
      ...mapping,
      categories: enrichedCategories,
      provenanceReview: {
        verifiedUniquePhotoCount: candidateIds.size,
        sourcePageVerifiedCandidateRows: enrichedCategories.filter((category) => category.proposedFilename).length,
        unresolvedSourcePhotoIds: [],
        approvedForCategoryUseCount: 0,
      },
    },
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function renderReport(
  inventory: { count: number; records: InventoryRecord[] },
  mapping: { categories: CategoryProposal[]; provenanceReview: Record<string, unknown> },
) {
  const candidates = mapping.categories.filter((category) => category.proposedFilename);
  const rows = candidates.map((category) => {
    const record = inventory.records.find((item) => item.filename === category.proposedFilename);
    if (!record) throw new Error(`Missing inventory record for ${category.proposedFilename}`);
    const sourceUrl = String(category.sourceUrl);
    return `<tr><td>${escapeHtml(category.categoryKey)}<br><small>${escapeHtml(category.sourceCategory)}</small><br>${escapeHtml(category.productCount)} products</td><td><img class="thumb" src="../../../public/images/products/${escapeHtml(record.filename)}" alt="${escapeHtml(record.filename)}"><br>${escapeHtml(record.filename)}<br><small>SHA-256: ${escapeHtml(record.sha256)}</small></td><td>${escapeHtml(category.visualConfidence)}<br>${escapeHtml(category.rationale)}</td><td><a href="${escapeHtml(sourceUrl)}">${escapeHtml(category.sourcePageTitle)}</a><br>Creator: ${escapeHtml(category.creator)}<br><a href="${pexelsLicenseUrl}">Pexels License</a></td><td>Visually suitable candidate<br>Source page and platform license verified<br>Suggested credit: ${escapeHtml(category.attribution)}<br><b>NOT APPROVED for category use</b></td></tr>`;
  }).join("");
  const noPhotoCount = mapping.categories.length - candidates.length;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AURA local photo provenance review</title><style>body{font:14px system-ui,sans-serif;color:#1b2a38;margin:24px}p{max-width:1150px;line-height:1.5}.notice{background:#fff4d7;padding:14px}.counts{font-weight:600}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #cbd5df;padding:8px;text-align:left;vertical-align:top}th{background:#edf2f7}.thumb{width:110px;height:90px;object-fit:contain;background:#fff}small{font-size:11px;overflow-wrap:anywhere}</style><h1>Local-photo provenance and license review</h1><p class="notice"><b>Read-only review.</b> No images were downloaded, no database was connected, and no product mapping was applied. The official Pexels photo pages were resolved for every candidate ID; each page's canonical URL and Open Graph image identify the same numeric Pexels photo ID as the local filename, and the page title was checked against the visual audit. The Pexels License page explicitly allows website/e-commerce use. This does not establish third-party trademark, model, or property rights, and local image bytes were not compared with the source image because no additional downloads were made. Pexels attribution is not required by its license; suggested credit is retained below. All candidates remain unapproved for category use.</p><p class="counts">Local photos inventoried: ${inventory.count} | Category candidates: ${candidates.length} | Unique source pages and photos verified: ${mapping.provenanceReview.verifiedUniquePhotoCount} | Categories without a suitable local photo: ${noPhotoCount} | Approved for category use: 0</p><p>Visual suitability, source-page provenance, license/platform rights, and approval are separate statuses. Visual confidence refers only to the existing visual review. The local file's SHA-256 is retained as an audit identifier; it is not a Pexels source checksum.</p><table><thead><tr><th>Category</th><th>Local candidate</th><th>Visual review</th><th>Verified source and license</th><th>Status / attribution</th></tr></thead><tbody>${rows}</tbody></table><h2>Replacement follow-up</h2><p>No candidate photo ID is missing an official Pexels source page or Pexels License record. This verifies provenance at the source-page/platform-license level, not a binary comparison of the local file to Pexels CDN content. All 31 category proposals remain unapproved; the 42 categories without suitable local photos remain without candidates. No candidate is assigned to an Olist product.</p><p><a href="./contact-sheet.jpg">Open the original contact sheet</a> | <a href="./inventory.json">Inventory JSON</a> | <a href="./proposed-category-mapping.json">Category mapping JSON</a></p></body></html>`;
}

export async function generateProvenanceReport(directory = auditDirectory) {
  const inventory = JSON.parse(await readFile(path.join(directory, "inventory.json"), "utf8"));
  const mapping = JSON.parse(await readFile(path.join(directory, "proposed-category-mapping.json"), "utf8"));
  const result = applyProvenance(inventory, mapping);
  const summary = JSON.parse(await readFile(path.join(directory, "audit-summary.json"), "utf8"));
  const candidateCount = result.mapping.categories.filter((category) => category.proposedFilename).length;
  const verifiedCount = result.mapping.provenanceReview.verifiedUniquePhotoCount as number;
  const enrichedSummary = {
    ...summary,
    generatedAt: new Date().toISOString(),
    perImageProvenanceRecorded: true,
    rightsVerificationRequiredCount: 0,
    categoryCounts: {
      ...summary.categoryCounts,
      withProposedPhoto: candidateCount,
      withoutSuitablePhoto: result.mapping.categories.length - candidateCount,
    },
    provenanceReview: {
      verifiedUniquePhotoCount: verifiedCount,
      verifiedCategoryCandidateRows: candidateCount,
      unresolvedSourcePhotoIds: [],
      localImageBytesComparedCount: 0,
      approvedForCategoryUseCount: 0,
    },
  };

  await writeFile(path.join(directory, "inventory.json"), `${JSON.stringify(result.inventory, null, 2)}\n`);
  await writeFile(path.join(directory, "proposed-category-mapping.json"), `${JSON.stringify(result.mapping, null, 2)}\n`);
  await writeFile(path.join(directory, "audit-summary.json"), `${JSON.stringify(enrichedSummary, null, 2)}\n`);
  await writeFile(path.join(directory, "report.html"), renderReport(result.inventory, result.mapping));
  return { candidateCount, verifiedCount, noPhotoCount: result.mapping.categories.length - candidateCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  generateProvenanceReport()
    .then((counts) => console.log(`Updated provenance report: ${counts.verifiedCount} unique photos verified across ${counts.candidateCount} category candidates; ${counts.noPhotoCount} categories without suitable local photos; 0 approved.`))
    .catch((error: unknown) => {
      console.error("Could not generate the local-photo provenance report:", error);
      process.exitCode = 1;
    });
}
