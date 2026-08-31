import { NextResponse } from "next/server";
import { getCid } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await context.params;
  const found = await getCid(decodeURIComponent(id), decodeURIComponent(cid));
  if (!found) {
    return NextResponse.json({ error: "CID part not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.meta.contentType,
      "Content-Length": String(found.bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
