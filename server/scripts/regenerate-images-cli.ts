#!/usr/bin/env node
/**
 * CLI tool to regenerate property images for cases and daily challenges
 * Run with: npm run regenerate-images [-- --daily-only|--cases-only]
 */

import { foreclosureGenerator } from '../src/services/foreclosureGenerator.js';
import { pool } from '../src/db/pool.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse cases from static file
function loadStaticCases() {
  const casesPath = join(__dirname, '../../src/data/cases.ts');
  const casesContent = readFileSync(casesPath, 'utf-8');
  const casesMatch = casesContent.match(/export const propertyCases: PropertyCase\[\] = (\[[\s\S]*?\]);/);
  if (!casesMatch) {
    throw new Error('Could not parse cases.ts');
  }
  return eval(casesMatch[1]);
}

async function regenerateTodaysChallengeImages() {
  console.log('\n🌟 Regenerating images for today\'s daily challenge...\n');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'SELECT * FROM daily_challenges WHERE challenge_date = $1',
      [today]
    );
    
    if (result.rows.length === 0) {
      console.log('ℹ️  No challenge found for today');
      return;
    }
    
    const challenge = result.rows[0];
    const propertyData = challenge.property_data;
    
    console.log(`📸 Processing daily challenge for ${today}`);
    console.log(`   Address: ${propertyData.address}, ${propertyData.city}, ${propertyData.state}`);
    
    // Use the foreclosureGenerator's image generation method
    const imageUrls = await (foreclosureGenerator as any).generatePropertyImages(
      propertyData, 
      `daily-${challenge.id}`
    );
    
    if (imageUrls && imageUrls.length > 0) {
      // Update property data with new URLs
      propertyData.photos = imageUrls;
      await pool.query(
        'UPDATE daily_challenges SET property_data = $1 WHERE id = $2',
        [JSON.stringify(propertyData), challenge.id]
      );
      
      console.log(`\n  ✅ Generated ${imageUrls.length} images for today's challenge`);
      console.log(`  ✅ Updated database with new URLs`);
      console.log(`\n  📷 Image URLs:`);
      imageUrls.forEach((url: string, i: number) => {
        console.log(`    ${i + 1}. ${url}`);
      });
    }
    
  } catch (error: any) {
    console.error('  ❌ Failed to regenerate today\'s challenge images:', error.message);
    throw error;
  }
}

async function regenerateCaseImages() {
  console.log('\n🏠 Regenerating images for static cases...\n');
  
  const cases = loadStaticCases();
  const results = [];
  
  for (const propertyCase of cases) {
    console.log(`\n📸 Processing ${propertyCase.id}: ${propertyCase.address}`);
    
    try {
      const imageUrls = await (foreclosureGenerator as any).generatePropertyImages(
        propertyCase,
        propertyCase.id
      );
      
      if (imageUrls && imageUrls.length > 0) {
        console.log(`  ✅ Generated ${imageUrls.length} images`);
        results.push({
          id: propertyCase.id,
          address: propertyCase.address,
          urls: imageUrls
        });
      }
    } catch (error: any) {
      console.error(`  ❌ Failed: ${error.message}`);
    }
  }
  
  // Print results for easy copying to cases.ts
  if (results.length > 0) {
    console.log('\n\n📋 UPDATE cases.ts WITH THESE URLs:\n');
    console.log('='.repeat(80));
    for (const result of results) {
      console.log(`\n// ${result.id} - ${result.address}`);
      console.log(`photoUrls: [`);
      result.urls.forEach((url: string) => console.log(`  "${url}",`));
      console.log(`],`);
    }
    console.log('\n' + '='.repeat(80));
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--daily-only')) {
      await regenerateTodaysChallengeImages();
    } else if (args.includes('--cases-only')) {
      await regenerateCaseImages();
    } else {
      // Do both
      await regenerateTodaysChallengeImages();
      await regenerateCaseImages();
    }
    
    console.log('\n✅ Image regeneration complete!\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
