import assert from "node:assert/strict";
import test from "node:test";
import {
  applyProvenance,
  renderReport,
  verifiedPexelsSources,
} from "./verify-local-photo-provenance";

test("verifies source metadata separately from category-use approval", () => {
  const sources = verifiedPexelsSources.slice(0, 2);
  const inventory = {
    count: 2,
    records: sources.map((source) => ({
      id: source.id,
      filename: `pexels-${source.id}.jpg`,
      path: `/images/products/pexels-${source.id}.jpg`,
      sha256: `hash-${source.id}`,
      visualClass: "product-focused / category-relevant object visible",
    })),
  };
  const mapping = {
    categories: [
      {
        sourceCategory: "category_a",
        categoryKey: "category_a",
        productCount: 10,
        proposedFilename: `pexels-${sources[0].id}.jpg`,
        visualConfidence: 0.9,
        rationale: "Product visible.",
      },
      {
        sourceCategory: "category_b",
        categoryKey: "category_b",
        productCount: 5,
        proposedFilename: `pexels-${sources[1].id}.jpg`,
        visualConfidence: 0.8,
        rationale: "Category-relevant object visible.",
      },
      {
        sourceCategory: "category_c",
        categoryKey: "category_c",
        productCount: 3,
        rationale: "No suitable local photo.",
      },
    ],
  };

  const result = applyProvenance(inventory, mapping, sources);
  const [first, second, missing] = result.mapping.categories;

  assert.equal(result.inventory.provenanceReview.verifiedUniquePhotoCount, 2);
  assert.equal(result.mapping.provenanceReview.sourcePageVerifiedCandidateRows, 2);
  assert.equal(first.sourceUrl, `https://www.pexels.com/photo/${sources[0].slug}-${sources[0].id}/`);
  assert.equal(first.license, "Pexels License");
  assert.equal(first.licenseUrl, "https://www.pexels.com/license/");
  assert.match(String(first.attribution), /Attribution is not required/);
  assert.equal(first.visualSuitabilityStatus, "VISUALLY_SUITABLE_CANDIDATE");
  assert.equal(first.rightsVerificationStatus, "PEXELS_PAGE_AND_LICENSE_VERIFIED");
  assert.equal(first.categoryUseApprovalStatus, "NOT_APPROVED");
  assert.equal(second.categoryUseApprovalStatus, "NOT_APPROVED");
  assert.equal(missing.visualSuitabilityStatus, "NO_SUITABLE_LOCAL_PHOTO_IDENTIFIED");
  assert.equal(result.mapping.provenanceReview.approvedForCategoryUseCount, 0);

  const html = renderReport(result.inventory, result.mapping);
  assert.match(html, /Source page and platform license verified/);
  assert.match(html, /NOT APPROVED for category use/);
  assert.match(html, /No candidate photo ID is missing/);
});

test("fails closed when a candidate has no verified source record", () => {
  assert.throws(
    () => applyProvenance(
      {
        count: 1,
        records: [{
          id: "999",
          filename: "pexels-999.jpg",
          path: "/images/products/pexels-999.jpg",
          sha256: "hash",
          visualClass: "candidate",
        }],
      },
      {
        categories: [{
          sourceCategory: "unknown",
          categoryKey: "unknown",
          productCount: 1,
          proposedFilename: "pexels-999.jpg",
          rationale: "Unknown.",
        }],
      },
      [],
    ),
    /Missing verified Pexels source metadata for photo IDs: 999/,
  );
});

test("verified source records cover 25 unique IDs with canonical Pexels page paths", () => {
  assert.equal(verifiedPexelsSources.length, 25);
  assert.equal(new Set(verifiedPexelsSources.map((source) => source.id)).size, 25);
  for (const source of verifiedPexelsSources) {
    assert.match(source.slug, /^[a-z0-9-]+$/);
    assert.ok(source.title.length > 0);
    assert.ok(source.creator.length > 0);
  }
});
