import cron from 'node-cron';
import { foreclosureGenerator } from './services/foreclosureGenerator.js';
import { pool } from './db/pool.js';
import { getTodayInTimezone, getServerTimezone } from './utils/dateUtils.js';

/**
 * Scheduled task to generate daily foreclosure challenges
 * Runs every day at 12:01 AM (configurable via DAILY_CHALLENGE_CRON env variable)
 */
export function initializeScheduledTasks() {
  // Default: run at 12:01 AM every day
  // Format: minute hour day month dayOfWeek
  const cronSchedule = process.env.DAILY_CHALLENGE_CRON || '1 0 * * *';
  
  console.log(`Initializing daily challenge scheduler: ${cronSchedule}`);

  cron.schedule(cronSchedule, async () => {
    console.log('Running daily challenge generation...');
    await generateDailyChallenge();
  }, {
    timezone: process.env.TIMEZONE || 'America/New_York'
  });

  // Also run on startup if no challenge exists for today
  checkAndGenerateTodaysChallenge();
}

async function generateDailyChallenge(date?: string): Promise<void> {
  try {
    const targetDate = date || getTodayInTimezone(getServerTimezone());
    
    // Check if challenge already exists
    const existingResult = await pool.query(
      'SELECT * FROM daily_challenges WHERE challenge_date = $1',
      [targetDate]
    );

    if (existingResult.rows.length > 0) {
      console.log(`Daily challenge already exists for ${targetDate}`);
      return;
    }

    console.log(`Generating new daily challenge for ${targetDate}...`);
    
    // Random difficulty selection
    const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
    console.log(`Selected difficulty: ${difficulty}`);

    // Generate scenario using OpenAI
    const scenario = await foreclosureGenerator.generateScenario(difficulty, targetDate);

    // Store in database
    await pool.query(
      'INSERT INTO daily_challenges (challenge_date, difficulty, property_data) VALUES ($1, $2, $3)',
      [targetDate, difficulty, JSON.stringify(scenario)]
    );

    console.log(`Successfully generated daily challenge for ${targetDate}`);
  } catch (error) {
    console.error('Error generating daily challenge:', error);
    // Don't throw - we don't want to crash the server
  }
}

async function checkAndGenerateTodaysChallenge(): Promise<void> {
  const today = getTodayInTimezone(getServerTimezone());
  
  try {
    const result = await pool.query(
      'SELECT * FROM daily_challenges WHERE challenge_date = $1',
      [today]
    );

    if (result.rows.length === 0) {
      console.log('No challenge exists for today. Generating...');
      await generateDailyChallenge(today);
    } else {
      console.log(`Daily challenge already exists for ${today}`);
    }
  } catch (error) {
    console.error('Error checking for today\'s challenge:', error);
  }
}

// Export for manual triggering
export { generateDailyChallenge };
