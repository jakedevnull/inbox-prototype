import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  ListObjectsV2Command,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { MailSource } from "./types";

export interface MailObject {
  id: string;
  source: MailSource;
  filename: string;
  key: string;
  bytes: Buffer;
}

function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

function r2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID!;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function isEml(name: string): boolean {
  return name.toLowerCase().endsWith(".eml");
}

function slugId(source: MailSource, key: string): string {
  const stem = key.replace(/\.eml$/i, "").replace(/\\/g, "/");
  return `${source}:${stem}`;
}

async function loadLocal(): Promise<MailObject[]> {
  const dir = path.join(process.cwd(), "data", "emails");
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: MailObject[] = [];
  for (const name of names) {
    if (!isEml(name)) continue;
    const bytes = await readFile(path.join(dir, name));
    out.push({
      id: slugId("local", name),
      source: "local",
      filename: name,
      key: name,
      bytes,
    });
  }
  return out;
}

async function loadR2(): Promise<MailObject[]> {
  const client = r2Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const prefix = process.env.R2_PREFIX ?? "";
  const out: MailObject[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (!obj.Key || !isEml(obj.Key)) continue;
      const got = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: obj.Key }),
      );
      const bytes = Buffer.from(await got.Body!.transformToByteArray());
      const filename = obj.Key.split("/").pop() ?? obj.Key;
      out.push({
        id: slugId("r2", obj.Key),
        source: "r2",
        filename,
        key: obj.Key,
        bytes,
      });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export function storageMode(): "local" | "r2" | "both" {
  if (!r2Configured()) return "local";
  if (process.env.R2_INCLUDE_LOCAL === "true") return "both";
  return "r2";
}

export async function loadMailObjects(): Promise<MailObject[]> {
  const mode = storageMode();
  if (mode === "local") return loadLocal();
  if (mode === "r2") return loadR2();
  const [local, r2] = await Promise.all([loadLocal(), loadR2()]);
  return [...local, ...r2];
}
