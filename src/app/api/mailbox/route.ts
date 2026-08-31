import { NextResponse } from "next/server";
import { getMailboxPayload } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getMailboxPayload();
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load mailbox";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
