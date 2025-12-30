# Chat Analytics

The system now tracks all questions users ask the Will AI chat for analytics purposes.

## Database Schema

All chat questions are stored in the `chat_questions` table:
- `id`: Unique identifier
- `user_id`: Reference to the user who asked (nullable)
- `question`: The full question text
- `response_preview`: First 200 characters of the response
- `asked_at`: Timestamp when the question was asked
- `session_id`: Optional session identifier
- `created_at`: Record creation timestamp

## Accessing Analytics

### Via API Endpoint

You can access the analytics by making a GET request to:
```
GET /api/chat/analytics
```

This endpoint requires authentication and returns:

**Top Questions** - Grouped by question text with frequency counts
```json
{
  "topQuestions": [
    {
      "question": "What are liens?",
      "count": 45,
      "last_asked": "2025-12-30T10:30:00Z"
    }
  ]
}
```

**Recent Questions** - Last 100 questions asked
```json
{
  "recentQuestions": [
    {
      "question": "How do I calculate ARV?",
      "response_preview": "Great question! ARV (After Repair Value) is...",
      "asked_at": "2025-12-30T10:30:00Z",
      "user_name": "Sara Gibbons"
    }
  ]
}
```

**Daily Statistics** - Question volume over the last 30 days
```json
{
  "dailyStats": [
    {
      "date": "2025-12-30",
      "question_count": 127,
      "unique_users": 34
    }
  ]
}
```

### Using JavaScript in Browser Console

When logged in to the site, you can access analytics via the browser console:

```javascript
// Fetch analytics data
const analytics = await fetch('/api/chat/analytics', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  }
}).then(r => r.json());

// View top questions
console.table(analytics.topQuestions);

// View recent questions
console.table(analytics.recentQuestions);

// View daily stats
console.table(analytics.dailyStats);
```

### Direct Database Queries

If you have direct database access:

```sql
-- Most frequently asked questions
SELECT 
  question,
  COUNT(*) as count,
  MAX(asked_at) as last_asked
FROM chat_questions
GROUP BY question
ORDER BY count DESC
LIMIT 20;

-- Questions asked in the last 24 hours
SELECT 
  question,
  asked_at,
  response_preview
FROM chat_questions
WHERE asked_at >= NOW() - INTERVAL '24 hours'
ORDER BY asked_at DESC;

-- User engagement stats
SELECT 
  DATE(asked_at) as date,
  COUNT(*) as total_questions,
  COUNT(DISTINCT user_id) as unique_users,
  ROUND(COUNT(*)::numeric / COUNT(DISTINCT user_id), 2) as avg_questions_per_user
FROM chat_questions
WHERE asked_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(asked_at)
ORDER BY date DESC;
```

## Privacy & Data Retention

- Questions are stored with user associations for analytics
- Consider implementing data retention policies
- Users can be anonymized by setting `user_id` to NULL
- Response previews are limited to 200 characters

## Future Enhancements

Consider adding:
- Topic categorization using AI
- Sentiment analysis
- Question clustering to identify similar questions
- Admin dashboard UI
- Export functionality
- Automated insights/reports
