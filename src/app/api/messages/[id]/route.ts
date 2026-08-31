import { NextResponse } from "next/server";
import { getParsedMessage } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const decoded = decodeURIComponent(id);
  const url = new URL(request.url);
  const loadRemote = url.searchParams.get("remote") === "1";
  const message = await getParsedMessage(decoded, loadRemote);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  return NextResponse.json(message);
}
