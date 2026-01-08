#!/usr/bin/env node
/**
 * add_missing_to_upload_queue.js
 * 
 * Adds the missing image files to the upload queue
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const BASE = 'c:/Users/Nuwud/Projects/theme_export__h-moon-hydro-myshopify-com-horizon__29OCT2025-1206pm';
const queuePath = path.join(BASE, 'outputs/files_to_upload.json');

// Load existing queue
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
const existingFilenames = new Set(queue.map(f => f.filename));

// Files we need to add
const missing = [
  { relPath: '2019/08/grozone_co2.jpg', name: 'grozone_co2.jpg' },
  { relPath: '2019/09/10-inch-q-fan.jpg', name: '10-inch-q-fan.jpg' },
  { relPath: '2023/08/HMH_logo_small_03-200x200.png', name: 'HMH_logo_small_03-200x200.png' },
  { relPath: '2024/01/customer-taking-lettuce-from-shelf-2023-11-27-04-50-18-utc-1.jpg', name: 'customer-taking-lettuce-from-shelf-2023-11-27-04-50-18-utc-1.jpg' },
  { relPath: '2021/12/1840-led.png', name: '1840-led.png' },
  { relPath: '2020/02/HarvestMonn_Logo-600.png', name: 'HarvestMonn_Logo-600.png' },
  { relPath: '2024/03/GreaseBottle1LGoldcopy_b4aaa8ce-7525-4faa-b491-f2349fe2a66a.webp', name: 'GreaseBottle1LGoldcopy_b4aaa8ce-7525-4faa-b491-f2349fe2a66a.webp' },
  { relPath: '2019/08/Picture_16__36070.1335549599.120.120.png', name: 'Picture_16__36070.1335549599.120.120.png' },
  { relPath: '2021/12/2.8-1.jpg', name: '2.8-1.jpg' },
];

let added = 0;
for (const m of missing) {
  if (existingFilenames.has(m.name)) {
    console.log('Already in queue:', m.name);
    continue;
  }
  
  const localPath = path.join(BASE, 'hmoonhydro.com/wp-content/uploads', m.relPath);
  if (!fs.existsSync(localPath)) {
    console.log('File not found:', localPath);
    continue;
  }
  
  // Calculate SHA1
  const buffer = fs.readFileSync(localPath);
  const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
  
  queue.push({
    localPath,
    filename: m.name,
    sha1
  });
  console.log('Added:', m.name);
  added++;
}

fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
console.log('\nTotal in queue:', queue.length);
console.log('Added:', added);
