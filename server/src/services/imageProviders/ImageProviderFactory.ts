import { IImageProvider } from './IImageProvider.js';
import { DalleImageProvider } from './DalleImageProvider.js';
import { GeminiImageProvider } from './GeminiImageProvider.js';

export type ImageProviderType = 'dalle' | 'gemini';

/**
 * Factory for creating image provider instances
 * Allows switching between different image generation services via configuration
 */
export class ImageProviderFactory {
  /**
   * Create an image provider based on the IMAGE_PROVIDER environment variable
   * Defaults to 'dalle' if not specified
   */
  static createProvider(providerType?: ImageProviderType): IImageProvider {
    const type = providerType || (process.env.IMAGE_PROVIDER as ImageProviderType) || 'dalle';

    console.log(`📸 Initializing image provider: ${type}`);

    switch (type) {
      case 'gemini':
        return new GeminiImageProvider();
      case 'dalle':
        return new DalleImageProvider();
      default:
        console.warn(`⚠️  Unknown image provider type: ${type}. Falling back to DALL-E.`);
        return new DalleImageProvider();
    }
  }

  /**
   * Get the currently configured provider type from environment
   */
  static getConfiguredProviderType(): ImageProviderType {
    return (process.env.IMAGE_PROVIDER as ImageProviderType) || 'dalle';
  }
}
