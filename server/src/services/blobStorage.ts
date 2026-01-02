import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob';
import crypto from 'crypto';

export class BlobStorageService {
  private blobServiceClient: BlobServiceClient | null = null;
  private containerName: string;
  private accountName: string = '';
  private accountKey: string = '';
  private folderPrefix: string;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'property-images';
    
    // Use AZURE_ENV for folder prefix (dev/prod), defaults to dev
    const environment = process.env.AZURE_ENV === 'production' ? 'prod' : 'dev';
    this.folderPrefix = environment;

    if (!connectionString) {
      console.warn('Azure Storage not configured - images will use base64 fallback');
      return;
    }

    try {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      
      // Extract account name and key from connection string for SAS generation
      const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
      const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);
      
      if (accountNameMatch && accountKeyMatch) {
        this.accountName = accountNameMatch[1];
        this.accountKey = accountKeyMatch[1];
      }
      
      console.log('✅ Azure Blob Storage initialized');
    } catch (error) {
      console.error('Failed to initialize Azure Blob Storage:', error);
    }
  }

  async uploadImage(imageBuffer: Buffer, contentType: string = 'image/png'): Promise<string> {
    if (!this.blobServiceClient) {
      throw new Error('Azure Blob Storage not configured');
    }

    try {
      // Generate unique filename with folder prefix
      const filename = `${this.folderPrefix}/${crypto.randomUUID()}.png`;
      
      // Get container client
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      
      // Create container if it doesn't exist (with private access)
      try {
        await containerClient.createIfNotExists({
          access: 'container' // Try container-level access first
        });
      } catch (publicAccessError) {
        // If public access is not allowed, create with private access
        await containerClient.createIfNotExists();
      }

      // Get blob client
      const blockBlobClient = containerClient.getBlockBlobClient(filename);

      // Upload image
      await blockBlobClient.uploadData(imageBuffer, {
        blobHTTPHeaders: {
          blobContentType: contentType
        }
      });

      // Generate a SAS token that's valid for 10 years (max Azure allows)
      const sasUrl = this.generateSasUrl(filename);
      
      return sasUrl || blockBlobClient.url;
    } catch (error) {
      console.error('Error uploading to blob storage:', error);
      throw error;
    }
  }

  private generateSasUrl(blobName: string): string | null {
    if (!this.accountName || !this.accountKey) {
      return null;
    }

    try {
      const sharedKeyCredential = new StorageSharedKeyCredential(
        this.accountName,
        this.accountKey
      );

      // SAS token valid for 10 years from now
      const startsOn = new Date();
      const expiresOn = new Date(startsOn);
      expiresOn.setFullYear(expiresOn.getFullYear() + 10);

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          blobName: blobName,
          permissions: BlobSASPermissions.parse('r'), // Read-only permission
          startsOn: startsOn,
          expiresOn: expiresOn,
        },
        sharedKeyCredential
      ).toString();

      return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobName}?${sasToken}`;
    } catch (error) {
      console.error('Failed to generate SAS URL:', error);
      return null;
    }
  }

  isConfigured(): boolean {
    return this.blobServiceClient !== null;
  }
}

export const blobStorage = new BlobStorageService();
