import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { catalogSeed } from '../catalog/catalogSeed';

const router = Router();
const DATASET_DIR = path.resolve(process.cwd(), 'dataset');

const escapeCsv = (value: string | number): string => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Ensure dataset directory exists
if (!fs.existsSync(DATASET_DIR)) {
  fs.mkdirSync(DATASET_DIR, { recursive: true });
}

// GET /api/dataset/status
// Scans the dataset directory and returns file names, sizes, and record previews
router.get('/status', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(DATASET_DIR)) {
      return res.json({ success: true, folderExists: true, files: [] });
    }

    const fileNames = fs.readdirSync(DATASET_DIR);
    const filesInfo = fileNames
      .filter((file) => !file.startsWith('.') && (file.endsWith('.csv') || file.endsWith('.json')))
      .map((fileName) => {
        const filePath = path.join(DATASET_DIR, fileName);
        const stats = fs.statSync(filePath);
        return {
          name: fileName,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
          type: fileName.endsWith('.csv') ? 'CSV' : 'JSON',
        };
      });

    return res.json({
      success: true,
      folderPath: '/dataset',
      filesCount: filesInfo.length,
      files: filesInfo,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to scan dataset directory: ' + err.message });
  }
});

// POST /api/dataset/sync
// Reads all files in /dataset/ and imports products into the catalog
router.post('/sync', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(DATASET_DIR)) {
      return res.status(404).json({ success: false, message: 'Dataset folder does not exist.' });
    }

    const hasSupportedFiles = fs.readdirSync(DATASET_DIR).some(
      (file) => !file.startsWith('.') && (file.endsWith('.csv') || file.endsWith('.json')),
    );
    if (!hasSupportedFiles) {
      return res.status(400).json({
        success: false,
        message: 'No CSV or JSON files found in the /dataset/ folder. Please place your dataset file inside /dataset/ and try again.',
      });
    }

    const result = await db.syncDatasetProducts();

    return res.json({
      success: true,
      message: `Processed ${result.processedFiles.length} file(s): ${result.importedCount} product(s) added, ${result.updatedCount} existing product(s) refreshed, ${result.duplicateCount} duplicate(s) already present, and ${result.invalidCount} invalid row(s) skipped.`,
      importedCount: result.importedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      duplicateCount: result.duplicateCount,
      invalidCount: result.invalidCount,
      processedFiles: result.processedFiles,
      errors: result.errors,
    });
  } catch (err: any) {
    return res.status(db.isConnected ? 500 : 503).json({ success: false, message: 'Sync failed: ' + err.message });
  }
});

// POST /api/dataset/upload
// Allows uploading a dataset file directly into the /dataset directory
router.post('/upload', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const { filename, content } = req.body;
    if (!filename || !content) {
      return res.status(400).json({ success: false, message: 'Filename and file content are required.' });
    }

    const cleanName = path.basename(filename);
    if (!cleanName.endsWith('.csv') && !cleanName.endsWith('.json')) {
      return res.status(400).json({ success: false, message: 'Only .csv and .json dataset files are supported.' });
    }

    if (!fs.existsSync(DATASET_DIR)) {
      fs.mkdirSync(DATASET_DIR, { recursive: true });
    }

    const targetPath = path.join(DATASET_DIR, cleanName);
    fs.writeFileSync(targetPath, content, 'utf-8');

    return res.json({
      success: true,
      message: `File "${cleanName}" uploaded successfully to /dataset folder.`,
      filename: cleanName,
      size: Buffer.byteLength(content, 'utf-8'),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
  }
});

// POST /api/dataset/sample
// Creates or restores standard sample datasets in the /dataset directory
router.post('/sample', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(DATASET_DIR)) {
      fs.mkdirSync(DATASET_DIR, { recursive: true });
    }

    const sampleProducts = [
      catalogSeed[0],
      catalogSeed[6],
      catalogSeed[9],
      catalogSeed[14],
      catalogSeed[19],
      catalogSeed[24],
    ];
    const columns = ['name', 'description', 'price', 'category', 'stock', 'sku', 'brand', 'image'];
    const sampleCSV = [
      columns.join(','),
      ...sampleProducts.map((product) => [
        product.name,
        product.description,
        product.price,
        product.category,
        product.stock,
        product.sku,
        product.brand,
        product.image,
      ].map(escapeCsv).join(',')),
    ].join('\r\n') + '\r\n';

    fs.writeFileSync(path.join(DATASET_DIR, 'sample_products.csv'), sampleCSV, 'utf-8');

    return res.json({
      success: true,
      message: 'Sample dataset sample_products.csv created in /dataset directory.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Failed to create sample dataset: ' + err.message });
  }
});

export default router;
