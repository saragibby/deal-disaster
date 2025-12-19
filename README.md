# Deal or Disaster - Foreclosure Investment Game

An interactive educational game that teaches students how to evaluate foreclosure properties and identify hidden red flags.

## Features

- **Real-time Decision Making**: 3-5 minute timer per case mimics auction pressure
- **Hidden Red Flags**: Learn to spot IRS liens, HOA superpriority issues, code violations, and more
- **Scoring System**: 
  - Buy good deal: +100 points
  - Buy bad deal: -150 points
  - Walk from bad deal: +50 points
  - Walk from great deal: -50 points
  - Find red flag: +25 bonus points
- **5 Realistic Cases**: Each with unique challenges and learning opportunities

## Getting Started

### Installation

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Then open your browser to the URL shown (typically http://localhost:5173)

### Build for Production

```bash
npm run build
```

## How to Play

1. Review the property details, liens, and documents
2. Look for hidden red flags in the title reports and lien stack
3. Make your decision before time runs out:
   - ✅ **BUY** - Purchase the property
   - ⚠️ **INVESTIGATE MORE** - Need more time (costs points)
   - ❌ **WALK AWAY** - Pass on the deal

## Educational Value

Students learn:
- Fast property evaluation under pressure
- Pattern recognition for common foreclosure issues
- Understanding lien priority and survivability
- Identifying red flags in legal documents
- Risk assessment and decision-making

## Technology Stack

- React 18
- TypeScript
- Vite
- CSS3

## License

MIT
