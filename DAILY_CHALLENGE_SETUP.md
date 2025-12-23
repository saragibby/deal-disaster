# Daily Challenge Feature - Setup Guide

## Overview
The daily challenge feature generates unique foreclosure scenarios using Azure OpenAI every day, stores them in the database, and allows users to complete current and past challenges.

## Setup Instructions

### 1. Azure OpenAI Configuration

Add these environment variables to your `.env` file:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4
AZURE_OPENAI_API_VERSION=2024-08-01-preview

# Daily Challenge Scheduling (optional - defaults shown)
DAILY_CHALLENGE_CRON=1 0 * * *  # 12:01 AM every day
TIMEZONE=America/New_York

# Admin API Key for manual challenge generation
ADMIN_API_KEY=your_secure_random_key_here
```

### 2. Database Setup

The database tables have already been created via migration. The schema includes:
- `daily_challenges`: Stores generated foreclosure scenarios by date
- `user_daily_challenges`: Tracks user completions

### 3. Scheduling

The system automatically:
- Generates a new challenge at 12:01 AM daily (configurable via `DAILY_CHALLENGE_CRON`)
- Checks on server startup and generates today's challenge if it doesn't exist
- Varies difficulty by day of week (weekends are harder)

### 4. API Endpoints

#### Get Today's Challenge
```
GET /api/daily-challenge/today
Authorization: Bearer <token>
```

#### Get Past Challenges
```
GET /api/daily-challenge/history?page=1
Authorization: Bearer <token>
```

#### Get Challenge by Date
```
GET /api/daily-challenge/date/2025-12-22
Authorization: Bearer <token>
```

#### Complete Challenge
```
POST /api/daily-challenge/:challengeId/complete
Authorization: Bearer <token>
Body: {
  "decision": "BUY" | "INVESTIGATE" | "WALK_AWAY",
  "points_earned": 100,
  "time_taken": 120
}
```

#### Manual Generation (Admin)
```
POST /api/daily-challenge/generate
Body: {
  "admin_key": "your_admin_api_key",
  "date": "2025-12-22" (optional),
  "difficulty": "easy" | "medium" | "hard" (optional)
}
```

### 5. Reusable Foreclosure Generator

The `ForeclosureScenarioGenerator` class can be used anywhere:

```typescript
import { foreclosureGenerator } from './services/foreclosureGenerator';

// Generate a scenario
const scenario = await foreclosureGenerator.generateScenario('medium');
```

Perfect for creating:
- Practice mode scenarios
- Tutorial scenarios
- Challenge events
- User-generated content

### 6. Testing

To manually generate today's challenge:
```bash
curl -X POST http://localhost:3001/api/daily-challenge/generate \
  -H "Content-Type: application/json" \
  -d '{"admin_key": "your_admin_key"}'
```

## Features

✅ Automated daily generation via cron job
✅ Azure OpenAI integration for realistic scenarios
✅ Historical challenge browsing
✅ Completion tracking per user
✅ Reusable scenario generator
✅ Difficulty variation by day
✅ Manual generation endpoint
✅ User progress tracking

## Next Steps

1. Add Azure OpenAI credentials to `.env`
2. Set a secure `ADMIN_API_KEY`
3. Restart server to initialize scheduler
4. Test by fetching today's challenge or generating manually
