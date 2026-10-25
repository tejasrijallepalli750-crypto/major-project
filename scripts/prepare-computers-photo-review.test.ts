import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  renderComputersReviewHtml,
  selectComputerCategoryCandidates,
  validateComputersBatch,
  writeComputersReview,
} from './prepare-computers-photo-review';
import { OpenPhotoCandidate } from './olist-image-enrichment';

const validCandidate = (overrides: Partial<OpenPhotoCandidate> = {}): OpenPhotoCandidate => ({
  id: 'computer-photo-1',
  provider: 'Openverse',
  title: 'Laptop computer product',
  description: 'Notebook computer on a plain surface.',
  creator: 'Photographer',
  creatorUrl: 'https://creator.example.test/profile',
  sourceUrl: 'https://source.example.test/photo',
  imageUrl: 'https://images.example.test/photo.jpg',
  license: 'by',
  licenseCode: 'by',
  licenseVersion: '4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Photographer, CC BY 4.0',
  width: 1200,
  height: 900,
  tags: ['laptop', 'computer'],
  ...overrides,
});

test('Computers batch validation accepts only its 30 pcs records', () => {
  const row = {
    'Olist product ID': '1'.repeat(32),
    'Original category identifier': 'pcs',
    'English category': 'computers',
  };
  assert.doesNotThrow(() => validateComputersBatch(Array.from({ length: 30 }, () => row)));
  assert.throws(() => validateComputersBatch([row]), /Expected the existing 30-product/);
  assert.throws(() => validateComputersBatch(Array.from({ length: 30 }, () => ({
    ...row,
    'English category': 'electronics',
  }))), /outside Olist pcs \/ Computers/);
});

test('candidate selection requires strong computer evidence and a permitted license', () => {
  const laptop = validCandidate();
  const person = validCandidate({
    id: 'people',
    title: 'People on a beach',
    description: '',
    tags: ['laptop'],
  });
  const personUsingComputer = validCandidate({
    id: 'person-using-computer',
    title: 'A man using a laptop',
    description: 'Laptop computer in a room.',
    tags: ['laptop'],
  });
  const weak = validCandidate({
    id: 'weak',
    title: 'Modern technology scene',
    description: '',
    tags: ['accessories'],
  });
  const nonCommercial = validCandidate({
    id: 'nc',
    license: 'by-nc',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
  });
  const selected = selectComputerCategoryCandidates([
    { candidate: person, query: 'laptop' },
    { candidate: personUsingComputer, query: 'laptop' },
    { candidate: weak, query: 'computer peripherals' },
    { candidate: nonCommercial, query: 'laptop' },
    { candidate: laptop, query: 'laptop' },
  ]);
  assert.deepEqual(selected.map((item) => item.candidate.id), ['computer-photo-1']);
  assert.ok(selected[0].evidence.some((evidence) => evidence.includes('laptop')));
});

test('category review reports never assign a candidate to an Olist product', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-computers-review-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const candidate = validCandidate();
  const entry = {
    provider: candidate.provider,
    title: candidate.title,
    description: candidate.description,
    creator: candidate.creator,
    creatorUrl: candidate.creatorUrl,
    sourceUrl: candidate.sourceUrl,
    originalImageUrl: candidate.imageUrl,
    license: candidate.license,
    licenseVersion: candidate.licenseVersion,
    licenseUrl: candidate.licenseUrl,
    attribution: candidate.attribution,
    searchQuery: 'laptop',
    relevanceEvidence: ['Title identifies product term "laptop".'],
    matchType: 'representative-category-match' as const,
    assignment: null,
    reviewStatus: 'needs-human-review' as const,
    visualScreening: 'category-relevant-candidate' as const,
    visualScreeningNote: 'A laptop is clearly visible; candidate only, pending human approval.',
    imagePath: 'images/example.webp',
    originalSha256: crypto.createHash('sha256').update('original').digest('hex'),
    sha256: crypto.createHash('sha256').update('optimized').digest('hex'),
    byteLength: 1000,
    width: 800,
    height: 600,
  };
  const html = renderComputersReviewHtml([entry], []);
  assert.match(html, /No image is connected to an Olist product ID/);
  assert.match(html, /Products still needing identity-matched images: 30\/30/);
  assert.match(html, /Photographer, CC BY 4\.0/);
  assert.match(html, /needs human review/i);
  const rejectedHtml = renderComputersReviewHtml([{
    ...entry,
    visualScreening: 'rejected-after-visual-screen',
    visualScreeningNote: 'Person-centered scene; rejected.',
  }], []);
  assert.match(rejectedHtml, /rejected-after-visual-screen/);
  assert.match(rejectedHtml, /Person-centered scene; rejected/);
  await writeComputersReview([], [], directory);
  assert.equal(fs.existsSync(path.join(directory, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(directory, 'report.html')), true);
  const emptyReport = fs.readFileSync(path.join(directory, 'report.html'), 'utf8');
  assert.match(emptyReport, /No suitable image candidates passed/);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as {
    candidates: unknown[];
    exactProductMatches: number;
    productsStillNeedingIdentityMatchedImages: number;
  };
  assert.equal(manifest.candidates.length, 0);
  assert.equal(manifest.exactProductMatches, 0);
  assert.equal(manifest.productsStillNeedingIdentityMatchedImages, 30);
});
