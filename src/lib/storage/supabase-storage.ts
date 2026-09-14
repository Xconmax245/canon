import { env } from "@/lib/env";

const BUCKET = "storyboard-images";

function storageHeaders(contentType: string) {
  return {
    Authorization: `Bearer ${env.supabase.serviceRoleKey()}`,
    apikey: env.supabase.serviceRoleKey(),
    // Supabase validates this header against the bucket's allowed_mime_types,
    // so it must be the actual image type, never a generic octet-stream.
    "Content-Type": contentType,
    "x-upsert": "true",
  };
}

function restBase(): string {
  return `${env.supabase.url().replace(/\/+$/, "")}/storage/v1`;
}

export interface StoredAsset {
  storageUrl: string;
  bytes: number;
  contentType: string;
}

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Download bytes from a (short-lived) KIE URL and persist to Supabase Storage.
 * KIE result URLs expire in as little as 20 minutes — never treat them as
 * durable storage.
 */
export async function persistImage(
  sourceUrl: string,
  sceneId: string,
  imageVersion: number,
): Promise<StoredAsset> {
  const imageRes = await fetch(sourceUrl, { cache: "no-store" });
  if (!imageRes.ok) {
    throw new Error(`failed to download image (HTTP ${imageRes.status})`);
  }
  let contentType = imageRes.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    // Some CDNs serve images as octet-stream; the bucket only allows image/*.
    contentType = "image/jpeg";
  }
  const bytes = new Uint8Array(await imageRes.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("downloaded image is empty");

  const objectPath = `scenes/${sceneId}/v${imageVersion}.${extensionFor(contentType)}`;

  const uploadRes = await fetch(
    `${restBase()}/object/${BUCKET}/${objectPath}`,
    {
      method: "POST",
      headers: storageHeaders(contentType),
      body: bytes,
    },
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(`supabase upload failed (HTTP ${uploadRes.status}): ${text.slice(0, 200)}`);
  }

  return {
    storageUrl: `${restBase()}/object/public/${BUCKET}/${objectPath}`,
    bytes: bytes.byteLength,
    contentType,
  };
}
