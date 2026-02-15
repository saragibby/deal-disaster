import { AgentsClient } from '@azure/ai-agents';
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

export class ChatService {
  private agentsClient: AgentsClient;
  private agentId: string;

  // Helper function to remove citation markers from agent responses
  private removeCitations(text: string): string {
    // Remove citation markers like 【4:2†yt-Finding a Foreclosure Fast.txt】
    return text.replace(/【[^】]*】/g, '').trim();
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
    
    // Use DefaultAzureCredential which automatically uses:
    // - Environment variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) in production/Heroku
    // - Azure CLI credentials for local development
    this.agentsClient = new AgentsClient(endpoint, new DefaultAzureCredential());
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
}
