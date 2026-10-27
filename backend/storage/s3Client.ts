import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export interface S3StorageOptions {
  bucketName?: string;
  region?: string;
  localMode?: boolean;
}

export class S3StorageService {
  private client: S3Client | null = null;
  private inMemoryStore = new Map<string, { data: Buffer; metadata?: Record<string, string> }>();
  private bucketName: string;
  private localMode: boolean;

  constructor(options: S3StorageOptions = {}) {
    this.bucketName = options.bucketName || process.env.RESULTS_BUCKET_NAME || "spookython-sim-results-private";
    this.localMode = options.localMode ?? !process.env.AWS_REGION;

    if (!this.localMode) {
      this.client = new S3Client({
        region: options.region || process.env.AWS_REGION || "us-east-1",
      });
    }
  }

  async putObject(
    key: string,
    data: Buffer,
    metadata?: Record<string, string>,
  ): Promise<void> {
    if (this.localMode || !this.client) {
      this.inMemoryStore.set(key, { data: Buffer.from(data), metadata });
      return;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      Metadata: metadata,
      ContentType: "application/json",
      ContentEncoding: "gzip",
    });

    await this.client.send(command);
  }

  async getObject(key: string): Promise<Buffer> {
    if (this.localMode || !this.client) {
      const stored = this.inMemoryStore.get(key);
      if (!stored) {
        throw new Error(`S3 NoSuchKey: ${key}`);
      }
      return stored.data;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty body for key ${key}`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  async hasObject(key: string): Promise<boolean> {
    if (this.localMode || !this.client) {
      return this.inMemoryStore.has(key);
    }
    try {
      await this.getObject(key);
      return true;
    } catch {
      return false;
    }
  }
}
