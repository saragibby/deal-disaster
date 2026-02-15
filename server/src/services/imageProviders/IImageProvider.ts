/**
 * Interface for image generation providers
 * Allows decoupling of image generation from specific AI services
 */
export interface IImageProvider {
  /**
   * Generate an image from a text prompt
   * @param prompt - The text description of the image to generate
   * @returns Promise resolving to the image data as a Buffer
   * @throws Error if image generation fails
   */
  generateImage(prompt: string): Promise<Buffer>;

  /**
   * Get the name of this provider (for logging/debugging)
   */
  getProviderName(): string;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;
}
