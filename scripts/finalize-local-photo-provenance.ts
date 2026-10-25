import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const auditDirectory = path.join(projectDirectory, "data/olist-image-enrichment/local-photo-audit");

const approvedCategoryReview: Record<string, string> = {
  bed_bath_table: "Official source content matches the local bedding photograph; bed linen is a direct, visible category subject.",
  sports_leisure: "Official source content matches the local tennis-racket photograph; sports equipment is a direct product subject.",
  furniture_decor: "Official source content matches the local ceramic-vase photograph; decorative homeware is a direct category subject.",
  health_beauty: "Official source content matches the local skincare-product photograph; personal-care products are the direct subject.",
  housewares: "Official source content matches the local ceramic-mug photograph; a household/kitchenware product is isolated and visible.",
  computers_accessories: "Official source content matches the local wireless-mouse photograph; a computer peripheral is isolated and visible.",
  watches_gifts: "Official source content matches the local wristwatch photograph; the watch is clearly visible in its case.",
  telephony: "Official source content matches the local smartphone photograph; phones are the primary products in view.",
  perfumery: "Official source content matches the local perfume-bottle photograph; fragrance packaging is the direct subject.",
  fashion_bags_accessories: "Official source content matches the local wallet photograph; wallets are direct fashion accessories.",
  garden_tools: "Official source content matches the local garden-tool photograph; hand tools are arranged as products.",
  construction_tools_construction: "Official source content matches the local cordless-drill photograph; a power tool is the direct subject.",
  home_appliances: "Official source content matches the local cordless-vacuum photograph; a household appliance is the direct subject.",
  luggage_accessories: "Official source content matches the local backpack photograph; a travel bag is the direct subject.",
  consoles_games: "Official source content matches the local gaming-controller/console photograph; gaming hardware is clearly visible.",
  small_appliances: "Official source content matches the local electric-kettle photograph; a small kitchen appliance is the direct subject.",
  fashion_shoes: "Official source content matches the local sneaker photograph; footwear is the clear product subject.",
  costruction_tools_garden: "Official source content matches the local garden-tool photograph; the arranged hand tools fit garden construction tools.",
  drinks: "Official source content matches the local bottled sports-drink photograph; bottled beverages are the direct subject.",
  audio: "Official source content matches the local headphone photograph; an audio product is the clear subject.",
  costruction_tools_tools: "Official source content matches the local drill-and-tools photograph; the tools are the clear product subjects.",
  computers: "Official source content matches the local laptop photograph; a laptop is the direct subject of the computers category.",
  cine_photo: "Official source content matches the local Canon camera photograph; a camera is isolated as the product subject.",
  fashion_sport: "Official source content matches the local sneaker photograph; athletic footwear is directly relevant to sports fashion.",
};

const rejectedCategoryReview: Record<string, string> = {
  office_furniture: "Not approved: the source title and image identify a laptop workspace; office furniture is incidental and not the direct product subject.",
  furniture_living_room: "Not approved: the source page identifies picture frames as the main subject; the couch is a background element, not a reliable living-room furniture representative.",
  food_drink: "Not approved: the image shows only bottled drinks and does not represent the combined food-and-drink category; the dedicated drinks category already has a direct candidate.",
  kitchen_dining_laundry_garden_furniture: "Not approved: the table/chairs appear in an outdoor scene and the candidate has weak category confidence; retain the category illustration rather than infer a broad match.",
  home_appliances_2: "Not approved: the kettle represents only one narrow small-appliance subtype and is a weak representative for the broad category.",
  furniture_mattress_and_upholstery: "Not approved: the source page identifies picture frames as the main subject; the sofa is incidental and does not establish a suitable furniture representative.",
  la_cuisine: "Not approved: the mug is a plausible kitchen item but the category match is broad and weak; retain the illustration rather than force a placement.",
};

interface CategoryProposal {
  sourceCategory: string;
  categoryKey: string;
  productCount: number;
  proposedFilename: string | null;
  proposedImagePath: string | null;
  sourceUrl: string | null;
  sourceImageUrl?: string;
  creator: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution?: string;
  visualConfidence: number | null;
  rationale: string;
  [key: string]: unknown;
}

interface ComparisonResult {
  id: string;
  filename: string;
  sourceUrl: string;
  sourceImageUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  localSha256: string;
  sourceSha256: string | null;
  sourceBytes: number;
  pHashDistance: number | null;
  dHashDistance: number | null;
  identityStatus: string;
  resultMessage: string;
}

export function reviewPlacements<T extends CategoryProposal>(
  categories: T[],
  comparisons: ComparisonResult[],
) {
  const comparisonsById = new Map(comparisons.map((comparison) => [comparison.id, comparison]));
  return categories.map((category) => {
    if (!category.proposedFilename) {
      return {
        ...category,
        imageIdentityStatus: "NO_CANDIDATE",
        categoryUseApprovalStatus: "NO_PHOTO_CANDIDATE",
        placementReview: "No candidate was identified; use the existing category illustration.",
      };
    }
    const id = category.proposedFilename.match(/^pexels-(\d+)\.jpg$/)?.[1];
    const comparison = id ? comparisonsById.get(id) : undefined;
    if (!comparison) throw new Error(`No source-image comparison record for ${category.proposedFilename}`);
    const identityVerified = comparison.identityStatus === "VERIFIED_IMAGE_CONTENT_MATCH"
      && comparison.sourceUrl === category.sourceUrl
      && comparison.sourceSha256
      && comparison.pHashDistance !== null
      && comparison.dHashDistance !== null
      && comparison.pHashDistance <= 6
      && comparison.dHashDistance <= 10;
    if (!identityVerified) {
      return {
        ...category,
        imageIdentityStatus: comparison.identityStatus,
        categoryUseApprovalStatus: "NOT_APPROVED",
        placementReview: `Not approved: source image identity was not verified. ${comparison.resultMessage}`,
      };
    }
    const approvedReview = approvedCategoryReview[category.categoryKey];
    if (approvedReview) {
      return {
        ...category,
        sourceImageUrl: comparison.sourceImageUrl,
        sourceImageSha256: comparison.sourceSha256,
        localImageSha256: comparison.localSha256,
        pHashDistance: comparison.pHashDistance,
        dHashDistance: comparison.dHashDistance,
        imageIdentityStatus: comparison.identityStatus,
        rightsVerificationStatus: "PEXELS_PAGE_IMAGE_AND_WEBSITE_LICENSE_VERIFIED",
        visualSuitabilityStatus: "VISUALLY_RELEVANT_CATEGORY_REPRESENTATIVE",
        categoryUseApprovalStatus: "APPROVED_CATEGORY_REPRESENTATIVE",
        placementReview: approvedReview,
      };
    }
    const rejectedReview = rejectedCategoryReview[category.categoryKey];
    if (!rejectedReview) {
      throw new Error(`Category placement has no explicit visual review: ${category.categoryKey}`);
    }
    return {
      ...category,
      sourceImageUrl: comparison.sourceImageUrl,
      sourceImageSha256: comparison.sourceSha256,
      localImageSha256: comparison.localSha256,
      pHashDistance: comparison.pHashDistance,
      dHashDistance: comparison.dHashDistance,
      imageIdentityStatus: comparison.identityStatus,
      rightsVerificationStatus: "PEXELS_PAGE_IMAGE_AND_WEBSITE_LICENSE_VERIFIED",
      visualSuitabilityStatus: "NOT_SUFFICIENTLY_RELEVANT",
      categoryUseApprovalStatus: "NOT_APPROVED",
      placementReview: rejectedReview,
    };
  });
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

export function renderFinalReport(
  reviewedCategories: Array<CategoryProposal & {
    imageIdentityStatus: string;
    categoryUseApprovalStatus: string;
    placementReview: string;
    pHashDistance?: number | null;
    dHashDistance?: number | null;
    sourceImageSha256?: string | null;
  }>,
  comparisonCounts: Record<string, number>,
) {
  const approved = reviewedCategories.filter((category) => category.categoryUseApprovalStatus === "APPROVED_CATEGORY_REPRESENTATIVE");
  const illustrations = reviewedCategories.length - approved.length;
  const rows = reviewedCategories.filter((category) => category.proposedFilename).map((category) => {
    const photoPath = `../../../public/images/products/${category.proposedFilename}`;
    const status = category.categoryUseApprovalStatus === "APPROVED_CATEGORY_REPRESENTATIVE"
      ? "APPROVED — representative category photo"
      : "NOT APPROVED — category illustration retained";
    return `<tr><td>${escapeHtml(category.categoryKey)}<br><small>${escapeHtml(category.sourceCategory)}</small><br>${escapeHtml(category.productCount)} products</td><td><img class="thumb" src="${escapeHtml(photoPath)}" alt="${escapeHtml(category.proposedFilename)}"><br><a href="${escapeHtml(photoPath)}">${escapeHtml(category.proposedFilename)}</a><br>Visual confidence: ${escapeHtml(category.visualConfidence)}</td><td><a href="${escapeHtml(category.sourceUrl)}">${escapeHtml(category.sourceUrl)}</a><br>Creator: ${escapeHtml(category.creator)}<br>${escapeHtml(category.license)} — <a href="${escapeHtml(category.licenseUrl)}">license</a><br>${escapeHtml(category.attribution)}<br>Source image SHA-256: <code>${escapeHtml(category.sourceImageSha256 || "not verified")}</code></td><td>${escapeHtml(category.imageIdentityStatus)}<br>pHash distance: ${escapeHtml(category.pHashDistance ?? "n/a")}/63; dHash distance: ${escapeHtml(category.dHashDistance ?? "n/a")}/64<br>${escapeHtml(category.categoryUseApprovalStatus)}</td><td>${escapeHtml(status)}<br>${escapeHtml(category.placementReview)}</td></tr>`;
  }).join("");
  const noCandidates = reviewedCategories.filter((category) => !category.proposedFilename).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AURA local photo provenance and category review</title><style>body{font:14px system-ui,sans-serif;color:#1b2a38;margin:24px}p{max-width:1200px;line-height:1.5}.notice{background:#eef6ff;padding:14px}.counts{font-weight:600}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #cbd5df;padding:8px;text-align:left;vertical-align:top}th{background:#edf2f7}.thumb{width:110px;height:90px;object-fit:contain;background:#fff}small{font-size:11px;overflow-wrap:anywhere}code{overflow-wrap:anywhere;font-size:10px}</style><h1>Local-photo identity, rights, and category-placement review</h1><p class="notice"><b>Olist catalogue is unchanged.</b> The 25 unique local Pexels files were compared against official Pexels CDN images recorded by their verified source pages. Local images were center-cropped to the official Pexels preview aspect ratio and compared using pHash and dHash. Each match supports image-content identity; it is not a byte-for-byte equality claim. Pexels source pages identify the creators, and the Pexels License permits website/e-commerce use. Suggested creator attribution is retained. Category placement approval is a separate relevance review; no Olist record or database was modified. ABO samples and rejected free-photo pilot images are unaffected.</p><p class="counts">Official image-content matches: ${comparisonCounts.verifiedImageContentMatches} / 25 | Candidate placements reviewed: ${reviewedCategories.filter((category) => category.proposedFilename).length} | Approved representative photos: ${approved.length} categories | Illustration-backed translated categories: ${illustrations} | No photo candidates: ${noCandidates}</p><p>Coverage counts below are for 73 translated Olist categories. The separate uncategorized group continues to use its general illustration. Approved categories use their existing local image from <code>public/images/products/</code> at display time; every unapproved category retains its mapped illustration fallback. Product photos are representative category imagery, not exact original Olist product photos.</p><table><thead><tr><th>Olist category / product count</th><th>Local candidate</th><th>Verified source, creator, license, and attribution</th><th>Image identity</th><th>Placement decision</th></tr></thead><tbody>${rows}</tbody></table><h2>Categories retaining illustrations</h2><p>${escapeHtml(reviewedCategories.filter((category) => category.categoryUseApprovalStatus !== "APPROVED_CATEGORY_REPRESENTATIVE").map((category) => `${category.categoryKey}${category.proposedFilename ? " (candidate rejected)" : ""}`).join(", "))}</p><p>Original local contact sheet: <a href="./contact-sheet.jpg">contact-sheet.jpg</a>. Provenance and source-image comparison manifest: <a href="./provenance-manifest.json">provenance-manifest.json</a>.</p></body></html>`;
}

export async function finalizeLocalPhotoProvenance() {
  const [inventory, mapping, summary, manifest] = await Promise.all([
    readFile(path.join(auditDirectory, "inventory.json"), "utf8").then(JSON.parse),
    readFile(path.join(auditDirectory, "proposed-category-mapping.json"), "utf8").then(JSON.parse),
    readFile(path.join(auditDirectory, "audit-summary.json"), "utf8").then(JSON.parse),
    readFile(path.join(auditDirectory, "provenance-manifest.json"), "utf8").then(JSON.parse),
  ]);
  if (manifest.counts.verifiedImageContentMatches !== 25
    || manifest.counts.imageContentMismatches !== 0
    || manifest.counts.sourceDownloadFailures !== 0) {
    throw new Error("Cannot finalize category use: not all 25 image identity checks passed.");
  }
  const reviewedCategories = reviewPlacements(mapping.categories, manifest.results);
  const approvedCount = reviewedCategories.filter(
    (category) => category.categoryUseApprovalStatus === "APPROVED_CATEGORY_REPRESENTATIVE",
  ).length;
  const candidateCount = reviewedCategories.filter((category) => category.proposedFilename).length;
  const illustrationCount = reviewedCategories.length - approvedCount;
  if (approvedCount !== Object.keys(approvedCategoryReview).length
    || reviewedCategories.length !== 73
    || candidateCount !== 31) {
    throw new Error("Reviewed category counts do not match the expected 73 categories and 31 photo candidates.");
  }
  const updatedInventory = {
    ...inventory,
    provenanceReview: {
      ...inventory.provenanceReview,
      verifiedUniquePhotoCount: manifest.counts.verifiedImageContentMatches,
      imageContentMismatchCount: manifest.counts.imageContentMismatches,
      sourceDownloadFailureCount: manifest.counts.sourceDownloadFailures,
      sourceComparisonBytes: manifest.downloadLimits.actualTotalBytes,
      approvedCategoryPlacementCount: approvedCount,
    },
    records: inventory.records.map((record: Record<string, unknown>) => {
      const comparison = manifest.results.find((result: ComparisonResult) => result.id === record.id) as ComparisonResult | undefined;
      if (!comparison) return record;
      return {
        ...record,
        sourceImageUrl: comparison.sourceImageUrl,
        sourceImageSha256: comparison.sourceSha256,
        sourceImageBytes: comparison.sourceBytes,
        pHashDistance: comparison.pHashDistance,
        dHashDistance: comparison.dHashDistance,
        imageIdentityStatus: comparison.identityStatus,
        sourceImageContentCompared: true,
        sourceImageBytesCompared: false,
        rightsStatus: "Pexels source page, source image identity, creator, and Pexels website/e-commerce license verified.",
      };
    }),
  };
  const updatedMapping = {
    ...mapping,
    categories: reviewedCategories,
    categoryCoverage: {
      translatedCategoryCount: 73,
      approvedPhotoCategoryCount: approvedCount,
      illustrationCategoryCount: illustrationCount,
      noPhotoCandidateCategoryCount: reviewedCategories.filter((category) => !category.proposedFilename).length,
      rejectedCandidateCategoryCount: candidateCount - approvedCount,
      uncategorizedProductsUseGeneralIllustration: true,
    },
  };
  const finalizedManifest = {
    ...manifest,
    approvedCategoryKeys: Object.entries(approvedCategoryReview).map(([categoryKey, review]) => ({ categoryKey, review })),
    rejectedCategoryKeys: Object.entries(rejectedCategoryReview).map(([categoryKey, review]) => ({ categoryKey, review })),
    categoryCoverage: updatedMapping.categoryCoverage,
  };
  const updatedSummary = {
    ...summary,
    generatedAt: new Date().toISOString(),
    perImageProvenanceRecorded: true,
    rightsVerificationRequiredCount: 0,
    provenanceReview: {
      ...summary.provenanceReview,
      verifiedUniquePhotoCount: manifest.counts.verifiedImageContentMatches,
      imageContentMismatchCount: manifest.counts.imageContentMismatches,
      sourceDownloadFailureCount: manifest.counts.sourceDownloadFailures,
      approvedForCategoryUseCount: approvedCount,
      rejectedCategoryCandidateCount: candidateCount - approvedCount,
      uniqueApprovedPhotoCount: new Set(reviewedCategories
        .filter((category) => category.categoryUseApprovalStatus === "APPROVED_CATEGORY_REPRESENTATIVE")
        .map((category) => category.proposedFilename)).size,
    },
    categoryCounts: {
      withProposedPhoto: candidateCount,
      withApprovedPhoto: approvedCount,
      illustrationBacked: illustrationCount,
      withoutSuitablePhoto: reviewedCategories.filter((category) => !category.proposedFilename).length,
    },
  };

  await writeFile(path.join(auditDirectory, "inventory.json"), `${JSON.stringify(updatedInventory, null, 2)}\n`);
  await writeFile(path.join(auditDirectory, "proposed-category-mapping.json"), `${JSON.stringify(updatedMapping, null, 2)}\n`);
  await writeFile(path.join(auditDirectory, "provenance-manifest.json"), `${JSON.stringify(finalizedManifest, null, 2)}\n`);
  await writeFile(path.join(auditDirectory, "audit-summary.json"), `${JSON.stringify(updatedSummary, null, 2)}\n`);
  await writeFile(path.join(auditDirectory, "report.html"), renderFinalReport(
    reviewedCategories,
    manifest.counts,
  ));
  return {
    verifiedPhotos: manifest.counts.verifiedImageContentMatches,
    approvedPlacements: approvedCount,
    approvedPhotos: updatedSummary.provenanceReview.uniqueApprovedPhotoCount,
    illustrationCategories: illustrationCount,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  finalizeLocalPhotoProvenance()
    .then((summary) => console.log("Final local-photo review:", summary))
    .catch((error: unknown) => {
      console.error("Could not finalize local-photo provenance:", error);
      process.exitCode = 1;
    });
}
