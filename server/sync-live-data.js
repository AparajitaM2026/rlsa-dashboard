import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data', 'db.json');

const LIVE_URL = 'https://ottmconnect.com';

const entitiesToSync = [
  'ClientAccount',
  'Vendor',
  'MonthlyFxRate',
  'LabelMapping',
  'ArtistMapping',
  'MonthlyAggregate',
  'Payout'
];

async function syncAll() {
  console.log('Fetching live data from ottmconnect.com...');
  const currentDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));

  for (const entity of entitiesToSync) {
    try {
      console.log(`Syncing ${entity}...`);
      const res = await fetch(`${LIVE_URL}/api/entities/${entity}?limit=500`);
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items) && items.length > 0) {
          // Normalize vendors
          if (entity === 'Vendor') {
            for (const v of items) {
              v.name = v.name || v.vendor_name;
              v.vendor_name = v.vendor_name || v.name;
              v.status = v.status || 'active';
            }
          }
          currentDb[entity] = items;
          console.log(`✓ ${entity}: Synced ${items.length} records`);
        }
      }
    } catch (err) {
      console.error(`Failed to sync ${entity}:`, err.message);
    }
  }

  // Also fetch RevenueRow sample rows
  try {
    console.log('Syncing RevenueRows...');
    const res = await fetch(`${LIVE_URL}/api/entities/RevenueRow?limit=500`);
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        currentDb['RevenueRow'] = rows;
        console.log(`✓ RevenueRow: Synced ${rows.length} records`);
      }
    }
  } catch (err) {
    console.error('Failed to sync RevenueRow:', err.message);
  }

  // Ensure Admin and Client accounts are present in User table
  if (!currentDb.User) currentDb.User = [];
  const adminExists = currentDb.User.some(u => u.email === 'admin@ottm.com');
  if (!adminExists) {
    currentDb.User.push({
      id: 'user_admin_001',
      email: 'admin@ottm.com',
      password: 'admin123',
      name: 'Admin User',
      role: 'admin',
      created_date: new Date().toISOString()
    });
  }

  const aparajitaExists = currentDb.User.some(u => u.email === 'aparajita@ottsol.com');
  if (!aparajitaExists) {
    currentDb.User.push({
      id: 'user_aparajita',
      email: 'aparajita@ottsol.com',
      password: 'admin123',
      name: 'Aparajita (Admin)',
      role: 'admin',
      created_date: new Date().toISOString()
    });
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(currentDb, null, 2), 'utf-8');
  console.log('🎉 Live data synchronization complete!');
}

syncAll();
