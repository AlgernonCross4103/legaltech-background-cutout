import { z } from "zod";
import { InfraiClient } from "./infrai-client.ts";

export const intakeRequest = z.object({
  matterId: z.string().min(1),
  documentName: z.string().min(1),
  imageBase64: z.string().min(1),
  deadline: z.string().datetime()
});

export type IntakeRequest = z.infer<typeof intakeRequest>;

export function deadlineState(deadline: string, now = new Date()): "follow-up" | "scheduled" {
  return new Date(deadline).getTime() <= now.getTime() ? "follow-up" : "scheduled";
}

export async function deliverSignedDocument(input: IntakeRequest, client: InfraiClient, now = new Date()) {
  const request = intakeRequest.parse(input);
  const cutout = await client.request("/image/background_remove", "POST", {
    image: { base64: request.imageBase64 },
    format: "png"
  });
  await client.request("/storage/bucket/create", "POST", { name: "legal-matter-documents" });
  const signed = await client.request(
    `/storage/object/presign/legal-matter-documents/${encodeURIComponent(request.matterId)}.png`,
    "POST",
    { op: "put", expires_seconds: 900, content_type: "image/png", idempotency_key: request.matterId }
  ) as { url: string };
  const upload = await fetch(signed.url, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "Idempotency-Key": request.matterId },
    body: JSON.stringify(cutout)
  });
  if (!upload.ok) {
    throw new Error(`Presigned upload failed with status ${upload.status}`);
  }
  return {
    matterId: request.matterId,
    documentName: request.documentName,
    imageKey: `${request.matterId}.png`,
    deadline: request.deadline,
    nextAction: deadlineState(request.deadline, now)
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const input = intakeRequest.parse(JSON.parse(process.env.MATTER_INTAKE_JSON ?? "{}"));
  const result = await deliverSignedDocument(input, new InfraiClient(key));
  console.log(JSON.stringify(result, null, 2));
}
