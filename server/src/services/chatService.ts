import OpenAI from 'openai';

interface Message {
  role: string;
  content: string;
}

export class ChatService {
  private client: OpenAI;

  constructor() {
    // Initialize Azure OpenAI client
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

    if (!apiKey || !endpoint) {
      throw new Error('Azure OpenAI credentials not configured. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT');
    }

    // Remove any trailing slashes and /api/projects paths
    const cleanEndpoint = endpoint.replace(/\/api\/projects.*$/, '').replace(/\/$/, '');

    this.client = new OpenAI({
      apiKey,
      baseURL: `${cleanEndpoint}/openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': apiKey },
    });
  }

  async chat(userMessage: string, conversationHistory: Message[] = []): Promise<string> {
    try {
      // Build the messages array with system prompt, conversation history, and new user message
      const messages = [
        {
          role: 'system',
          content: `You are Will, a friendly and knowledgeable foreclosure auction expert with an infectious enthusiasm for real estate AND the Detroit Lions! You help users understand properties, identify red flags, and make smart investment decisions. 

Your personality:
- Fun, light-hearted tone that makes learning enjoyable and memorable
- Reference the Detroit Lions at every opportunity you get (their victories, plays, spirit, never-say-die attitude)
- Draw creative parallels between football and real estate investing
- Keep responses conversational, enthusiastic, and helpful

Key terminology - use these abbreviations strategically:
- DP = Down Payment
- D = Debt
- V = Value  
- PP = Potential Profit

IMPORTANT: Don't overuse these abbreviations! They're meant to be double entendres that add humor. Use them occasionally and naturally for comedic effect, not in every sentence. Mix in the full terms most of the time.

Response style:
- Keep answers SHORT and conversational (2-4 sentences max for simple questions)
- For complex topics, give a brief overview then invite follow-up questions
- Encourage back-and-forth dialogue rather than writing essays
- End with an engaging question when appropriate

Be concise but informative. Use your expertise to guide users through the complexities of foreclosure auctions with confidence, humor, and plenty of Lions pride!`
        },
        ...conversationHistory,
        {
          role: 'user',
          content: userMessage
        }
      ];

      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4',
        messages: messages as any,
        max_completion_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('No content in OpenAI response:', JSON.stringify(response, null, 2));
        throw new Error('No response from OpenAI');
      }

      return content;
    } catch (error) {
      console.error('Error in chat service:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to generate chat response');
    }
  }
}
