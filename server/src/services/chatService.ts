import { AgentsClient, MessageStreamEvent, DoneEvent, MessageDeltaChunk, MessageDeltaTextContent } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';

interface Message {
  role: string;
  content: string;
}

interface DailyChallengeContext {
  propertyData: any;
  hasCompleted: boolean;
  userDecision: string | null;
  userPoints: number | null;
  difficulty: string;
}

type StreamCallback = (chunk: string) => void;

export class ChatService {
  private agentsClient: AgentsClient;
  private agentId: string;
  private endpoint: string;

  // Remove citation markers like 【4:2†yt-Finding a Foreclosure Fast.txt】
  // Use stripCitations for streaming chunks (preserves whitespace between words)
  // Use removeCitations for final output (also trims)
  private stripCitations(text: string): string {
    return text.replace(/【[^】]*】/g, '');
  }

  private removeCitations(text: string): string {
    return this.stripCitations(text).trim();
  }

  // Build context message for daily challenge
  private buildDailyChallengeContextMessage(context: DailyChallengeContext): string {
    const propertyData = context.propertyData;
    
    let message = `IMPORTANT CONTEXT: The user is working on today's daily challenge. Here are the property details:

`;
    message += `Property Address: ${propertyData.address}\n`;
    message += `List Price: $${propertyData.listPrice?.toLocaleString() || 'N/A'}\n`;
    message += `Estimated Value: $${propertyData.estimatedValue?.toLocaleString() || 'N/A'}\n`;
    message += `Estimated Repairs: $${propertyData.repairEstimate?.toLocaleString() || 'N/A'}\n`;
    
    if (propertyData.propertyType) {
      message += `Property Type: ${propertyData.propertyType}\n`;
    }
    if (propertyData.squareFeet) {
      message += `Square Feet: ${propertyData.squareFeet.toLocaleString()}\n`;
    }
    if (propertyData.bedrooms && propertyData.bathrooms) {
      message += `Bedrooms/Bathrooms: ${propertyData.bedrooms}/${propertyData.bathrooms}\n`;
    }
    
    message += `\nYOUR ROLE: Help the user understand this foreclosure opportunity. You can:\n`;
    message += `- Explain what different property details mean\n`;
    message += `- Give hints about what to look for in a good vs. bad deal\n`;
    message += `- Help them understand the scoring system\n`;
    message += `- Encourage them to think critically about the numbers\n`;
    message += `- Provide general real estate investment education\n\n`;
    message += `CRITICAL: DO NOT tell them whether this is a "Deal" or "Disaster" or what decision to make. DO NOT calculate exact scores for them. Your job is to educate and guide, not to give away the answer. Give them clues and help them learn, but let them make the final decision themselves.\n\n`;
    
    if (context.hasCompleted) {
      message += `Note: The user has already completed this challenge. They chose "${context.userDecision}" and earned ${context.userPoints} points. You can now discuss their decision and help them understand why it was scored that way.\n`;
    } else {
      message += `Note: The user has NOT yet made their decision. Help them learn without giving away the answer.\n`;
    }
    
    return message;
  }

  constructor() {
    // Initialize Azure AI Agent client with Azure AD authentication
    const endpoint = process.env.AZURE_AI_AGENT_ENDPOINT;
    const agentId = process.env.AZURE_AI_AGENT_ID;

    if (!endpoint || !agentId) {
      throw new Error('Azure AI Agent credentials not configured. Set AZURE_AI_AGENT_ENDPOINT and AZURE_AI_AGENT_ID');
    }

    this.agentId = agentId;
    this.endpoint = endpoint;
    
    // Use DefaultAzureCredential which automatically uses:
    // - Environment variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) in production/Heroku
    // - Azure CLI credentials for local development
    this.agentsClient = new AgentsClient(endpoint, new DefaultAzureCredential());
  }

  // Create a fresh AgentsClient for streaming requests
  // The singleton client's internal state can hang when reused for streaming
  private createFreshClient(): AgentsClient {
    return new AgentsClient(this.endpoint, new DefaultAzureCredential());
  }

  async chat(userMessage: string, conversationHistory: Message[] = [], dailyChallengeContext: DailyChallengeContext | null = null): Promise<string> {
    try {
      // Create a new thread for this conversation
      const thread = await this.agentsClient.threads.create();

      // If daily challenge context is provided, add it as system context
      if (dailyChallengeContext) {
        const contextMessage = this.buildDailyChallengeContextMessage(dailyChallengeContext);
        await this.agentsClient.messages.create(thread.id, 'user', contextMessage);
      }

      // Add conversation history to the thread
      for (const msg of conversationHistory) {
        await this.agentsClient.messages.create(thread.id, msg.role as 'user' | 'assistant', msg.content);
      }

      // Add the new user message
      await this.agentsClient.messages.create(thread.id, 'user', userMessage);

      // Create and run the agent
      let run = await this.agentsClient.runs.create(thread.id, this.agentId);

      // Poll for completion with faster polling interval
      while (run.status === 'queued' || run.status === 'in_progress') {
        await new Promise(resolve => setTimeout(resolve, 500));
        run = await this.agentsClient.runs.get(thread.id, run.id);
      }

      if (run.status !== 'completed') {
        console.error('Agent run failed with status:', run.status);
        throw new Error(`Agent run failed with status: ${run.status}`);
      }

      // Get the messages from the thread
      const messagesIterator = this.agentsClient.messages.list(thread.id);
      const messages = [];
      for await (const message of messagesIterator) {
        messages.push(message);
      }
      
      // Find the latest assistant message
      const assistantMessage = messages.find(msg => msg.role === 'assistant');
      
      if (!assistantMessage || !assistantMessage.content || assistantMessage.content.length === 0) {
        console.error('No assistant message found in response');
        throw new Error('No response from agent');
      }

      // Extract text content from the message
      const textContent = assistantMessage.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        console.error('No text content in assistant message');
        throw new Error('No text content in agent response');
      }

      // Remove citation markers before returning
      const rawText = (textContent as any).text.value;
      return this.removeCitations(rawText);
    } catch (error) {
      console.error('Error in chat service:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to generate chat response');
    }
  }

  async chatStream(
    userMessage: string,
    onChunk: StreamCallback,
    conversationHistory: Message[] = [],
    dailyChallengeContext: DailyChallengeContext | null = null
  ): Promise<string> {
    try {
      // Use a fresh client for streaming — the singleton client's HTTP pipeline
      // can stall when reused for SSE streaming connections
      const client = this.createFreshClient();

      // Create a new thread for this conversation
      const thread = await client.threads.create();

      // If daily challenge context is provided, add it as system context
      if (dailyChallengeContext) {
        const contextMessage = this.buildDailyChallengeContextMessage(dailyChallengeContext);
        await client.messages.create(thread.id, 'user', contextMessage);
      }

      // Add conversation history to the thread
      for (const msg of conversationHistory) {
        await client.messages.create(thread.id, msg.role as 'user' | 'assistant', msg.content);
      }

      // Add the new user message
      await client.messages.create(thread.id, 'user', userMessage);

      // Create a run and get the stream (don't await — use .stream() instead)
      const runResponse = client.runs.create(thread.id, this.agentId);
      const stream = await runResponse.stream();

      let fullText = '';
      // Buffer for handling citation markers that may span chunks
      let citationBuffer = '';

      for await (const event of stream) {
        if (event.event === MessageStreamEvent.ThreadMessageDelta) {
          const deltaChunk = event.data as MessageDeltaChunk;
          for (const content of deltaChunk.delta.content) {
            if (content.type === 'text') {
              const textDelta = (content as MessageDeltaTextContent).text?.value;
              if (textDelta) {
                fullText += textDelta;

                // Buffer text to strip citation markers that may span chunks
                citationBuffer += textDelta;
                
                // Process buffer: flush everything before any potential partial citation
                const openBracketIdx = citationBuffer.lastIndexOf('【');
                if (openBracketIdx === -1) {
                  // No open bracket — safe to flush entire buffer
                  const cleaned = this.stripCitations(citationBuffer);
                  if (cleaned) {
                    onChunk(cleaned);
                  }
                  citationBuffer = '';
                } else {
                  // Check if we have a complete citation in the buffer
                  const closeBracketIdx = citationBuffer.indexOf('】', openBracketIdx);
                  if (closeBracketIdx !== -1) {
                    // Complete citation found — remove it and flush
                    const cleaned = this.stripCitations(citationBuffer);
                    if (cleaned) {
                      onChunk(cleaned);
                    }
                    citationBuffer = '';
                  } else {
                    // Partial citation — flush everything before the open bracket
                    const safeText = citationBuffer.substring(0, openBracketIdx);
                    if (safeText) {
                      onChunk(safeText);
                    }
                    citationBuffer = citationBuffer.substring(openBracketIdx);
                  }
                }
              }
            }
          }
        }
      }

      // Flush any remaining buffer (e.g., if a 【 was not a citation after all)
      if (citationBuffer) {
        const cleaned = this.stripCitations(citationBuffer);
        if (cleaned) {
          onChunk(cleaned);
        }
      }

      return this.removeCitations(fullText);
    } catch (error) {
      console.error('Error in chat stream service:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to generate streaming chat response');
    }
  }
}
