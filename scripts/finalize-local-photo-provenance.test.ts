import assert from "node:assert/strict";
import test from "node:test";
import { reviewPlacements } from "./finalize-local-photo-provenance";

const comparison = {
  id: "212269",
  filename: "pexels-212269.jpg",
  sourceUrl: "https://www.pexels.com/photo/white-bed-comforter-212269/",
  sourceImageUrl: "https://images.pexels.com/photos/212269/pexels-photo-212269.jpeg",
  creator: "Jaymantri",
  license: "Pexels License",
  licenseUrl: "https://www.pexels.com/license/",
  attribution: "Photo by Jaymantri on Pexels.",
  localSha256: "a".repeat(64),
  sourceSha256: "b".repeat(64),
  sourceBytes: 1000,
  pHashDistance: 1,
  dHashDistance: 2,
  identityStatus: "VERIFIED_IMAGE_CONTENT_MATCH",
  resultMessage: "Match",
};

test("placement approval requires verified identity and explicit relevant-category review", () => {
  const result = reviewPlacements([
    {
      sourceCategory: "cama_mesa_banho",
      categoryKey: "bed_bath_table",
      productCount: 100,
      proposedFilename: "pexels-212269.jpg",
      proposedImagePath: null,
      sourceUrl: comparison.sourceUrl,
      creator: "Jaymantri",
      license: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
      visualConfidence: 0.94,
      rationale: "Bed linen visible.",
    },
    {
      sourceCategory: "moveis_escritorio",
      categoryKey: "office_furniture",
      productCount: 20,
      proposedFilename: "pexels-212269.jpg",
      proposedImagePath: null,
      sourceUrl: comparison.sourceUrl,
      creator: "Jaymantri",
      license: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
      visualConfidence: 0.76,
      rationale: "Weak match.",
    },
    {
      sourceCategory: "automotivo",
      categoryKey: "auto",
      productCount: 10,
      proposedFilename: null,
      proposedImagePath: null,
      sourceUrl: null,
      creator: null,
      license: null,
      licenseUrl: null,
      visualConfidence: null,
      rationale: "No candidate.",
    },
  ], [comparison]);

  assert.equal(result[0].categoryUseApprovalStatus, "APPROVED_CATEGORY_REPRESENTATIVE");
  assert.equal(result[0].imageIdentityStatus, "VERIFIED_IMAGE_CONTENT_MATCH");
  assert.equal(result[1].categoryUseApprovalStatus, "NOT_APPROVED");
  assert.match(String(result[1].placementReview), /laptop workspace/);
  assert.equal(result[2].categoryUseApprovalStatus, "NO_PHOTO_CANDIDATE");
});

test("unverified or mismatching source content cannot be approved", () => {
  const category = {
    sourceCategory: "cama_mesa_banho",
    categoryKey: "bed_bath_table",
    productCount: 1,
    proposedFilename: "pexels-212269.jpg",
    proposedImagePath: null,
    sourceUrl: comparison.sourceUrl,
    creator: "Jaymantri",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
    visualConfidence: 1,
    rationale: "Candidate.",
  };
  const result = reviewPlacements([category], [{
    ...comparison,
    identityStatus: "IMAGE_CONTENT_MISMATCH",
    pHashDistance: 50,
    dHashDistance: 50,
    resultMessage: "Mismatch",
  }],);
  assert.equal(result[0].categoryUseApprovalStatus, "NOT_APPROVED");
  assert.match(String(result[0].placementReview), /source image identity was not verified/);
});
