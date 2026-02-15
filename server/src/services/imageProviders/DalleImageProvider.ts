import OpenAI from 'openai';
import { IImageProvider } from './IImageProvider.js';

/**
 * Image provider using OpenAI DALL-E 3
 */
export class DalleImageProvider implements IImageProvider {
  private client: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log('✅ DALL-E image provider initialized');
    } else {
      console.log('⚠️  DALL-E image provider not configured (missing OPENAI_API_KEY)');
    }
  }

  async generateImage(prompt: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('DALL-E provider not configured. Set OPENAI_API_KEY environment variable.');
    }

    try {
      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      });

      if (!response.data || !response.data[0]?.url) {
        throw new Error('No image URL returned from DALL-E');
      }

      const imageUrl = response.data[0].url;
      
      // Download the image from the temporary URL
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from DALL-E: ${imageResponse.statusText}`);
      }

      const arrayBuffer = await imageResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('DALL-E image generation error:', error);
      throw new Error(`DALL-E image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getProviderName(): string {
    return 'DALL-E 3';
  }

  isConfigured(): boolean {
    return this.client !== null;
  }
}
