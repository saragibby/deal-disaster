import { pool } from '../db/pool.js';

/**
 * Script to check for data:image URLs in daily challenges
 * Run with: npm run check-data-images
 */

async function checkForDataImages() {
  try {
    console.log('🔍 Checking for data:image URLs in daily challenges...\n');
    
    const result = await pool.query(`
      SELECT id, challenge_date, property_data 
      FROM daily_challenges 
      ORDER BY challenge_date DESC
    `);

    const challengesWithDataImages: any[] = [];
    const challengesWithEmojis: any[] = [];

    for (const challenge of result.rows) {
      const photos = challenge.property_data?.photos || [];
      const hasDataImages = photos.some((photo: string) => 
        typeof photo === 'string' && photo.startsWith('data:image')
      );
      const hasEmojis = photos.some((photo: string) => 
        typeof photo === 'string' && !photo.startsWith('http') && !photo.startsWith('data:image')
      );

      if (hasDataImages) {
        challengesWithDataImages.push({
          id: challenge.id,
          date: challenge.challenge_date,
          photoCount: photos.length,
          dataImageCount: photos.filter((p: string) => p.startsWith('data:image')).length
        });
      } else if (hasEmojis) {
        challengesWithEmojis.push({
          id: challenge.id,
          date: challenge.challenge_date,
          photoCount: photos.length
        });
      }
    }

    console.log(`📊 Total challenges checked: ${result.rows.length}\n`);

    if (challengesWithDataImages.length === 0) {
      console.log('✅ No challenges found with data:image URLs');
    } else {
      console.log(`⚠️  Found ${challengesWithDataImages.length} challenges with data:image URLs:\n`);
      challengesWithDataImages.forEach(c => {
        console.log(`  ${c.date} (ID: ${c.id}): ${c.dataImageCount}/${c.photoCount} photos are data:image`);
      });
      console.log('\n💡 To fix these, run: npm run regenerate-images');
    }

    if (challengesWithEmojis.length > 0) {
      console.log(`\nℹ️  Found ${challengesWithEmojis.length} challenges with emoji placeholders (no images generated yet)`);
      console.log('   These will be replaced with real images when you run: npm run regenerate-images');
    }

    await pool.end();
  } catch (error) {
    console.error('Error checking for data images:', error);
    process.exit(1);
  }
}

checkForDataImages();
