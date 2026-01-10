import { AgentsClient } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';

interface Message {
  role: string;
  content: string;
}

export class ChatService {
  private agentsClient: AgentsClient;
  private agentId: string;

  // Helper function to remove citation markers from agent responses
  private removeCitations(text: string): string {
    // Remove citation markers like 【4:2†yt-Finding a Foreclosure Fast.txt】
    return text.replace(/【[^】]*】/g, '').trim();
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

  async chat(userMessage: string, conversationHistory: Message[] = []): Promise<string> {
    try {
      // Create a new thread for this conversation
      const thread = await this.agentsClient.threads.create();

      // Add conversation history to the thread
      for (const msg of conversationHistory) {
        await this.agentsClient.messages.create(thread.id, msg.role as 'user' | 'assistant', msg.content);
      }

      // Add the new user message
      await this.agentsClient.messages.create(thread.id, 'user', userMessage);

      // Create and run the agent
      let run = await this.agentsClient.runs.create(thread.id, this.agentId);

      // Poll for completion
      while (run.status === 'queued' || run.status === 'in_progress') {
        await new Promise(resolve => setTimeout(resolve, 1000));
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
