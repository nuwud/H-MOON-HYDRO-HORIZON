#!/usr/bin/env npx tsx
/**
 * CREATE COLLECTIONS
 * Creates smart collections in Shopify that auto-organize products by Type
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadShopifyConfig, executeGraphQL } from '../utils/shopifyAdminGraphql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadShopifyConfig();

const CREATE_COLLECTION = `
  mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        handle
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Collection definitions matching Type field values
const COLLECTIONS = [
  { handle: 'nutrients', title: 'Nutrients & Supplements', type: 'nutrients', description: 'Plant nutrients, fertilizers, and supplements for optimal growth' },
  { handle: 'grow-lights', title: 'Grow Lights', type: 'grow_lights', description: 'LED, fluorescent, and specialty grow lights' },
  { handle: 'hid-bulbs', title: 'HID Bulbs & Lamps', type: 'hid_bulbs', description: 'HID, HPS, MH bulbs and replacement lamps' },
  { handle: 'airflow-ventilation', title: 'Airflow & Ventilation', type: 'airflow', description: 'Fans, ducting, and ventilation equipment' },
  { handle: 'odor-control', title: 'Odor Control', type: 'odor_control', description: 'Carbon filters, odor neutralizers, and air treatment' },
  { handle: 'water-filtration', title: 'Water Filtration', type: 'water_filtration', description: 'RO systems, filters, and water treatment' },
  { handle: 'irrigation-pumps', title: 'Irrigation & Pumps', type: 'irrigation', description: 'Pumps, drip systems, and irrigation supplies' },
  { handle: 'containers', title: 'Containers & Pots', type: 'containers', description: 'Pots, trays, fabric containers, and growing vessels' },
  { handle: 'growing-media', title: 'Growing Media', type: 'grow_media', description: 'Soil, coco coir, rockwool, and hydroponic media' },
  { handle: 'propagation', title: 'Propagation & Cloning', type: 'propagation', description: 'Cloning supplies, rooting hormones, and propagation equipment' },
  { handle: 'seeds', title: 'Seeds', type: 'seeds', description: 'Quality seeds for growing' },
  { handle: 'controllers-timers', title: 'Controllers & Timers', type: 'controllers', description: 'Environmental controllers, timers, and automation' },
  { handle: 'environmental-monitors', title: 'Environmental Monitors', type: 'environmental_monitors', description: 'Temperature, humidity, and CO2 monitors' },
  { handle: 'ph-ec-meters', title: 'pH & EC Meters', type: 'ph_meters', description: 'pH pens, EC meters, and calibration solutions' },
  { handle: 'co2-equipment', title: 'CO2 Equipment', type: 'co2', description: 'CO2 controllers, regulators, and enrichment systems' },
  { handle: 'harvesting', title: 'Harvesting & Drying', type: 'harvesting', description: 'Drying racks, harvest tools, and curing supplies' },
  { handle: 'trimming', title: 'Trimming Tools', type: 'trimming', description: 'Scissors, trimmers, and trimming machines' },
  { handle: 'extraction', title: 'Extraction Equipment', type: 'extraction', description: 'Extraction and processing equipment' },
  { handle: 'pest-control', title: 'Pest Control', type: 'pest_control', description: 'IPM, pest prevention, and organic pest control' },
  { handle: 'grow-tents', title: 'Grow Tents', type: 'grow_tents', description: 'Grow tents and indoor growing enclosures' },
  { handle: 'grow-room-materials', title: 'Grow Room Materials', type: 'grow_room_materials', description: 'Reflective materials, framing, and room construction' },
  { handle: 'electrical', title: 'Electrical Supplies', type: 'electrical_supplies', description: 'Wiring, ballasts, and electrical components' },
  { handle: 'books-education', title: 'Books & Education', type: 'books', description: 'Growing guides, reference books, and educational materials' },
];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--confirm');
  
  console.log('\n' + '═'.repeat(60));
  console.log('📁 CREATE SHOPIFY COLLECTIONS');
  console.log('═'.repeat(60));
  
  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes will be made');
    console.log('   Use --confirm to create collections\n');
  } else {
    console.log('\n🔴 LIVE MODE - Creating collections\n');
  }
  
  let created = 0;
  let failed = 0;
  
  for (const coll of COLLECTIONS) {
    if (dryRun) {
      console.log(`   [DRY-RUN] Would create: ${coll.title} (${coll.handle})`);
      console.log(`             Rule: Type EQUALS "${coll.type}"`);
      created++;
      continue;
    }
    
    // Create smart collection with rule
    const input = {
      title: coll.title,
      handle: coll.handle,
      descriptionHtml: `<p>${coll.description}</p>`,
      ruleSet: {
        appliedDisjunctively: false,
        rules: [
          {
            column: 'TYPE',
            relation: 'EQUALS',
            condition: coll.type
          }
        ]
      }
    };
    
    try {
      const result = await executeGraphQL<any>(config, CREATE_COLLECTION, { input });
      
      if (result.data?.collectionCreate?.userErrors?.length > 0) {
        console.log(`   ❌ ${coll.title}: ${result.data.collectionCreate.userErrors[0].message}`);
        failed++;
      } else if (result.data?.collectionCreate?.collection) {
        console.log(`   ✅ ${coll.title}`);
        created++;
      } else {
        console.log(`   ❌ ${coll.title}: Unknown error`);
        failed++;
      }
    } catch (error: any) {
      console.log(`   ❌ ${coll.title}: ${error.message}`);
      failed++;
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`   Created: ${created}`);
  console.log(`   Failed:  ${failed}`);
}

main().catch(console.error);
