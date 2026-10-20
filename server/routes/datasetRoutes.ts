import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();
const DATASET_DIR = path.resolve(process.cwd(), 'dataset');

// Ensure dataset directory exists
if (!fs.existsSync(DATASET_DIR)) {
  fs.mkdirSync(DATASET_DIR, { recursive: true });
}

// Simple robust CSV parser handling quotes
function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header line
  const headers = parseCSVLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.trim().toLowerCase()] = (values[index] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentValue += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue);
  return values;
}

// GET /api/dataset/status
// Scans the dataset directory and returns file names, sizes, and record previews
router.get('/status', (_req: Request, res: Response) => {
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
router.post('/sync', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(DATASET_DIR)) {
      return res.status(404).json({ success: false, message: 'Dataset folder does not exist.' });
    }

    const fileNames = fs.readdirSync(DATASET_DIR);
    const validFiles = fileNames.filter(
      (file) => !file.startsWith('.') && (file.endsWith('.csv') || file.endsWith('.json'))
    );

    if (validFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No CSV or JSON files found in the /dataset/ folder. Please place your dataset file inside /dataset/ and try again.',
      });
    }

    let importedCount = 0;
    const errors: string[] = [];
    const processedFiles: string[] = [];

    for (const file of validFiles) {
      const filePath = path.join(DATASET_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (file.endsWith('.csv')) {
        const rows = parseCSV(content);
        for (const row of rows) {
          const name = row['name'] || row['product_name'] || row['title'];
          const price = parseFloat(row['price'] || row['price_inr'] || '0');

          if (!name || isNaN(price) || price <= 0) {
            continue; // Skip header/invalid rows
          }

          const description = row['description'] || row['desc'] || `${name} - Premium product imported from dataset.`;
          const category = row['category'] || row['product_category'] || 'General';
          const stock = parseInt(row['stock'] || row['quantity'] || '25', 10);
          const sku = row['sku'] || `DS-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 900 + 100)}`;
          const brand = row['brand'] || 'AURA Import';
          const image = row['image'] || row['image_url'] || '/images/product_headphones_matte_1792292817977.jpg';

          // Check for existing duplicate SKU or Name
          const existing = db.findProducts({ search: sku }).products.find((p) => p.sku === sku);
          if (!existing) {
            db.createProduct({
              name,
              description,
              price,
              category,
              stock: isNaN(stock) ? 20 : stock,
              sku,
              brand,
              image,
              status: 'active',
              rating: 4.8,
              numReviews: 12,
              features: ['Imported from /dataset folder', 'Verified specifications'],
            });
            importedCount++;
          }
        }
        processedFiles.push(file);
      } else if (file.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content);
          const items = Array.isArray(parsed) ? parsed : [parsed];

          for (const item of items) {
            if (!item.name || !item.price) continue;
            const sku = item.sku || `DS-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 900 + 100)}`;
            db.createProduct({
              name: item.name,
              description: item.description || `${item.name} - Imported from dataset.`,
              price: Number(item.price),
              category: item.category || 'General',
              stock: Number(item.stock) || 20,
              sku,
              brand: item.brand || 'AURA Import',
              image: item.image || '/images/product_headphones_matte_1792292817977.jpg',
              status: 'active',
              rating: item.rating || 4.7,
              numReviews: item.numReviews || 8,
              features: item.features || ['Imported from /dataset folder'],
            });
            importedCount++;
          }
          processedFiles.push(file);
        } catch (jsonErr: any) {
          errors.push(`Error parsing ${file}: ${jsonErr.message}`);
        }
      }
    }

    return res.json({
      success: true,
      message: `Successfully processed ${processedFiles.length} file(s) from /dataset/ and synced ${importedCount} new product(s) to the storefront catalog.`,
      importedCount,
      processedFiles,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Sync failed: ' + err.message });
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

    const sampleCSV = `name,description,price,category,stock,sku,brand,image
AURA Studio Carbon Earbuds,Wireless earbuds with custom 11mm graphene drivers and adaptive noise cancellation,8999,Audio & Wearables,40,AUDIO-CRB-021,AURA Audio,/images/product_headphones_matte_1792292817977.jpg
AURA Voyager Weekender Duffle,Waterproof 800D ballistic nylon travel duffle with ventilated shoe pocket,6499,Bags & Accessories,25,BAG-VOY-022,AURA Travel,/images/product_leather_bag_1792292819084.jpg
AURA Precision Desk Mat XXL,Natural cork and vegan leather reversible desk protector with cable management channel,2199,Home & Living,50,HOME-MAT-023,AURA Living,/images/product_mechanical_keyboard_1792292819678.jpg
AURA Aero Titanium Carabiner Keychain,CNC milled aerospace grade 5 titanium key organizer with bottle opener,1499,Bags & Accessories,60,ACC-KEY-024,AURA Gear,/images/product_smartwatch_titanium_1792292818604.jpg
AURA Minimalist Mechanical Keycaps,Sublimated PBT dye keycap set with terracotta accents and ISO layout support,3299,Electronics,35,KEY-PBT-025,AURA Custom,/images/product_mechanical_keyboard_1792292819678.jpg
AURA Nomad Leather Tech Pouch,Full-grain vegetable tanned Italian leather organizer with elastic cable loops,4199,Bags & Accessories,30,TECH-LEA-026,AURA Leather,/images/product_leather_bag_1792292819084.jpg
`;

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
