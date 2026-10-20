import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type { Config } from "../config.ts";

export type FileExt = "glb" | "png" | "webp" | "bin";

export const CONTENT_TYPES: Record<FileExt, string> = {
  glb: "model/gltf-binary",
  png: "image/png",
  webp: "image/webp",
  bin: "application/octet-stream",
};

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Content-addressed key (spec section 5): collections/<cid>/<mid>/<sha256>.<ext>. */
export function objectKey(collectionId: string, miniatureId: string, data: Buffer, ext: FileExt) {
  return `collections/${collectionId}/${miniatureId}/${sha256Hex(data)}.${ext}`;
}

export type StoredObject = { body: Readable; contentLength: number | undefined };

/** Thin wrapper over any S3-compatible service (RustFS locally). */
export class Storage {
  readonly client: S3Client;
  readonly bucket: string;

  constructor(config: Pick<
    Config,
    "S3_ENDPOINT" | "S3_REGION" | "S3_BUCKET" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY" | "S3_FORCE_PATH_STYLE"
  >) {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  /** Local development only: creates the bucket if it does not exist yet. */
  async ensureBucket(): Promise<void> {
    try {
      await this.ping();
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        return;
      }
      throw err;
    }
  }

  async put(key: string, data: Buffer, ext: FileExt): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: CONTENT_TYPES[ext],
      }),
    );
  }

  /** Returns null when the object does not exist. */
  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return { body: res.Body as Readable, contentLength: res.ContentLength };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }
}
