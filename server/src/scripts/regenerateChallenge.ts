import { pool } from '../db/pool.js';
import { foreclosureGenerator } from '../services/foreclosureGenerator.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to completely regenerate a daily challenge for a specific date
 * This will delete the existing challenge and generate a brand new one with new property data and images
 * Run with: npm run regenerate-challenge YYYY-MM-DD
 * Example: npm run regenerate-challenge 2026-01-01
 */

async function regenerateChallenge(dateString: string) {
  console.log(`🔄 Regenerating complete challenge for: ${dateString}\n`);

  try {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      console.error('❌ Invalid date format. Use YYYY-MM-DD (e.g., 2026-01-01)');
      process.exit(1);
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not set. Please configure it first.');
      process.exit(1);
    }

    // Check if Azure OpenAI is configured
    if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
      console.error('❌ Azure OpenAI not configured. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.');
      process.exit(1);
    }

    // Check if a challenge already exists for this date
    const existingResult = await pool.query(
      'SELECT id FROM daily_challenges WHERE challenge_date = $1',
      [dateString]
    );

    if (existingResult.rows.length > 0) {
      console.log(`⚠️  Found existing challenge for ${dateString}`);
      console.log('🗑️  Deleting existing challenge...\n');
      
      await pool.query('DELETE FROM daily_challenges WHERE challenge_date = $1', [dateString]);
      console.log('✅ Existing challenge deleted\n');
    }

    // Random difficulty selection
    const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

    console.log(`📊 Difficulty level: ${difficulty} (randomly selected)`);
    console.log('🏗️  Generating new challenge...\n');

    // Generate new challenge
    const scenario = await foreclosureGenerator.generateScenario(difficulty, dateString);

    console.log(`✅ Generated new property:`);
    console.log(`   Address: ${scenario.address}, ${scenario.city}, ${scenario.state}`);
    console.log(`   Type: ${scenario.propertyType}`);
    console.log(`   Auction: $${scenario.auctionPrice.toLocaleString()}`);
    console.log(`   Decision: ${scenario.correctDecision}`);
    console.log(`   Images: ${scenario.photos.length} photos generated\n`);

    // Save to database
    console.log('💾 Saving to database...\n');

    await pool.query(
      `INSERT INTO daily_challenges (challenge_date, difficulty, property_data) 
       VALUES ($1, $2, $3)`,
      [dateString, difficulty, scenario]
    );

    console.log('✅ Challenge saved successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✨ Challenge regeneration complete!');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Challenge for ${dateString} is ready to play.`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error regenerating challenge:', error);
    process.exit(1);
  }
}

// Get date from command line argument
const dateArg = process.argv[2];

if (!dateArg) {
  console.error('❌ Please provide a date argument');
  console.log('\nUsage: npm run regenerate-challenge YYYY-MM-DD');
  console.log('Example: npm run regenerate-challenge 2026-01-01\n');
  process.exit(1);
}

regenerateChallenge(dateArg);
