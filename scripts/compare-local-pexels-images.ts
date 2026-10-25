import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const auditDirectory = path.join(projectDirectory, "data/olist-image-enrichment/local-photo-audit");
const comparisonsDirectory = path.join(auditDirectory, "source-comparisons");
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const REQUEST_DELAY_MS = 1200;
const MAX_PHASH_DISTANCE = 6;
const MAX_DHASH_DISTANCE = 10;

interface InventoryRecord {
  id: string;
  filename: string;
  bytes: number;
  sha256: string;
  sourceUrl: string;
  sourceImageUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  attribution: string;
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
  localBytes: number;
  sourceBytes: number;
  pHashDistance: number | null;
  dHashDistance: number | null;
  identityStatus: "VERIFIED_IMAGE_CONTENT_MATCH" | "IMAGE_CONTENT_MISMATCH" | "SOURCE_DOWNLOAD_FAILED";
  resultMessage: string;
}

const bitCount = (value: bigint): number => {
  let bits = value;
  let count = 0;
  while (bits) {
    bits &= bits - 1n;
    count++;
  }
  return count;
};

function computePerceptualHash(pixels: Uint8Array): bigint {
  if (pixels.length !== 32 * 32) throw new Error("pHash requires a 32x32 grayscale image");
  const coefficients: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue;
      let coefficient = 0;
      for (let x = 0; x < 32; x++) {
        for (let y = 0; y < 32; y++) {
          coefficient += pixels[x * 32 + y]
            * Math.cos(((2 * x + 1) * u * Math.PI) / 64)
            * Math.cos(((2 * y + 1) * v * Math.PI) / 64);
        }
      }
      coefficients.push(coefficient);
    }
  }
  const sorted = [...coefficients].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return coefficients.reduce((hash, coefficient, index) =>
    coefficient > median ? hash | (1n << BigInt(index)) : hash, 0n);
}

function computeDifferenceHash(pixels: Uint8Array): bigint {
  if (pixels.length !== 9 * 8) throw new Error("dHash requires a 9x8 grayscale image");
  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (pixels[y * 9 + x] > pixels[y * 9 + x + 1]) hash |= 1n << bit;
      bit++;
    }
  }
  return hash;
}

async function hashes(image: Buffer) {
  const pHashImage = await sharp(image).rotate().resize(32, 32, { fit: "fill" }).greyscale().raw().toBuffer();
  const dHashImage = await sharp(image).rotate().resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  return {
    pHash: computePerceptualHash(pHashImage),
    dHash: computeDifferenceHash(dHashImage),
  };
}

async function normalizeLocalForSource(localImage: Buffer, sourceImage: Buffer): Promise<Buffer> {
  const sourceMetadata = await sharp(sourceImage).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error("Official Pexels image dimensions could not be read");
  }
  return sharp(localImage)
    .rotate()
    .resize(sourceMetadata.width, sourceMetadata.height, { fit: "cover", position: "centre" })
    .jpeg()
    .toBuffer();
}

function validateSourceUrl(sourceUrl: string, id: string) {
  const url = new URL(sourceUrl);
  if (url.hostname !== "images.pexels.com"
    || url.pathname !== `/photos/${id}/pexels-photo-${id}.jpeg`) {
    throw new Error(`Unexpected Pexels image URL for ${id}: ${sourceUrl}`);
  }
}

async function downloadBounded(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { Accept: "image/jpeg,image/*;q=0.8" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const finalUrl = new URL(response.url);
  const requestedUrl = new URL(url);
  if (finalUrl.hostname !== "images.pexels.com" || finalUrl.pathname !== requestedUrl.pathname) {
    throw new Error(`Unexpected source redirect to ${response.url}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Expected an image response, received ${contentType || "unknown content type"}`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES}-byte per-image limit`);
  }
  if (!response.body) throw new Error("The source response has no body");

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES}-byte per-image limit`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function delay() {
  await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
}

export async function compareLocalPexelsImages() {
  const inventory = JSON.parse(await readFile(path.join(auditDirectory, "inventory.json"), "utf8")) as {
    records: InventoryRecord[];
  };
  const mapping = JSON.parse(await readFile(path.join(auditDirectory, "proposed-category-mapping.json"), "utf8")) as {
    categories: Array<{ proposedFilename?: string }>;
  };
  const candidateIds = [...new Set(mapping.categories
    .filter((category) => category.proposedFilename)
    .map((category) => category.proposedFilename!.match(/^pexels-(\d+)\.jpg$/)?.[1])
    .filter((id): id is string => Boolean(id)))];

  if (candidateIds.length !== 25) {
    throw new Error(`Expected 25 unique photo candidates; found ${candidateIds.length}`);
  }
  await mkdir(comparisonsDirectory, { recursive: true });
  let totalBytes = 0;
  const results: ComparisonResult[] = [];

  for (const [index, id] of candidateIds.entries()) {
    const record = inventory.records.find((item) => item.id === id);
    if (!record) throw new Error(`Inventory record missing for Pexels photo ${id}`);
    validateSourceUrl(record.sourceImageUrl, id);
    if (!record.sourceUrl.startsWith(`https://www.pexels.com/photo/`) || !record.sourceUrl.endsWith(`-${id}/`)) {
      throw new Error(`Unverified official Pexels page URL for photo ${id}`);
    }
    const localImage = await readFile(path.join(projectDirectory, "public/images/products", record.filename));
    const localSha256 = createHash("sha256").update(localImage).digest("hex");
    if (localSha256 !== record.sha256) {
      throw new Error(`Local image hash changed for ${record.filename}; expected ${record.sha256}, found ${localSha256}`);
    }

    console.log(`[${index + 1}/${candidateIds.length}] Downloading bounded official image for ${id}`);
    try {
      const image = await downloadBounded(record.sourceImageUrl);
      totalBytes += image.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`Total source downloads exceed ${MAX_TOTAL_BYTES} bytes`);
      const stagedImagePath = path.join(comparisonsDirectory, `${id}.jpg`);
      await writeFile(stagedImagePath, image);

      const normalizedLocalImage = await normalizeLocalForSource(localImage, image);
      const localHash = await hashes(normalizedLocalImage);
      const sourceHashes = await hashes(image);
      const pHashDistance = bitCount(localHash.pHash ^ sourceHashes.pHash);
      const dHashDistance = bitCount(localHash.dHash ^ sourceHashes.dHash);
      const matches = pHashDistance <= MAX_PHASH_DISTANCE && dHashDistance <= MAX_DHASH_DISTANCE;
      results.push({
        id,
        filename: record.filename,
        sourceUrl: record.sourceUrl,
        sourceImageUrl: record.sourceImageUrl,
        creator: record.creator,
        license: record.license,
        licenseUrl: record.licenseUrl,
        attribution: record.attribution,
        localSha256,
        sourceSha256: createHash("sha256").update(image).digest("hex"),
        localBytes: record.bytes,
        sourceBytes: image.byteLength,
        pHashDistance,
        dHashDistance,
        identityStatus: matches ? "VERIFIED_IMAGE_CONTENT_MATCH" : "IMAGE_CONTENT_MISMATCH",
        resultMessage: matches
          ? `Perceptual image match: pHash distance ${pHashDistance}/63; dHash distance ${dHashDistance}/64.`
          : `Image content mismatch: pHash distance ${pHashDistance}/63; dHash distance ${dHashDistance}/64.`,
      });
      console.log(`  ${matches ? "MATCH" : "MISMATCH"} — pHash ${pHashDistance}/63; dHash ${dHashDistance}/64; ${image.byteLength} bytes`);
    } catch (error) {
      results.push({
        id,
        filename: record.filename,
        sourceUrl: record.sourceUrl,
        sourceImageUrl: record.sourceImageUrl,
        creator: record.creator,
        license: record.license,
        licenseUrl: record.licenseUrl,
        attribution: record.attribution,
        localSha256: record.sha256,
        sourceSha256: null,
        localBytes: record.bytes,
        sourceBytes: 0,
        pHashDistance: null,
        dHashDistance: null,
        identityStatus: "SOURCE_DOWNLOAD_FAILED",
        resultMessage: error instanceof Error ? error.message : String(error),
      });
      console.error(`  FAILED — ${error instanceof Error ? error.message : String(error)}`);
    }
    if (index + 1 < candidateIds.length) await delay();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: "bounded official Pexels image identity comparison",
    sourcePageEvidence: "Each source page was previously verified; source image URL is its Pexels CDN Open Graph image URL with matching numeric photo ID.",
    comparisonMethod: {
      hashes: "Source-aligned center crop followed by an 8x8 DCT perceptual hash (63 AC coefficients) and 9x8 grayscale difference hash",
      maxPHashDistance: MAX_PHASH_DISTANCE,
      maxDHashDistance: MAX_DHASH_DISTANCE,
      decision: "The local image is center-cropped to the official Pexels CDN preview aspect ratio before comparison. Passes only when both Hamming-distance thresholds are met. A hash match supports image-content identity but does not establish all rights, visual suitability, or exact pixel equality.",
    },
    downloadLimits: {
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTotalBytes: MAX_TOTAL_BYTES,
      actualTotalBytes: totalBytes,
      requestDelayMs: REQUEST_DELAY_MS,
      count: candidateIds.length,
    },
    results,
    counts: {
      verifiedImageContentMatches: results.filter((result) => result.identityStatus === "VERIFIED_IMAGE_CONTENT_MATCH").length,
      imageContentMismatches: results.filter((result) => result.identityStatus === "IMAGE_CONTENT_MISMATCH").length,
      sourceDownloadFailures: results.filter((result) => result.identityStatus === "SOURCE_DOWNLOAD_FAILED").length,
    },
  };
  await writeFile(path.join(auditDirectory, "provenance-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv.includes("--compare")) {
    console.error("Network access is opt-in. Re-run with --compare to fetch the 25 bounded official Pexels image URLs.");
    process.exitCode = 2;
  } else {
    compareLocalPexelsImages()
      .then((manifest) => console.log("Image identity comparison summary:", manifest.counts))
      .catch((error: unknown) => {
        console.error("Could not complete Pexels image comparison:", error);
        process.exitCode = 1;
      });
  }
}
