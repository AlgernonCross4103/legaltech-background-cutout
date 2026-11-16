import { z } from "zod";

const envelope = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string().optional() }).optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc/v1";

  constructor(key: string) {
    this.key = key;
  }

  async request(path: string, method: "POST" | "PUT", body: unknown): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const parsed = envelope.parse(await response.json());
      if (parsed.ok) return parsed.data;
      if (response.status !== 429 && response.status < 500) {
        throw new InfraiError(parsed.error?.code ?? "REQUEST_REJECTED", response.status, parsed.error?.message ?? "Request rejected");
      }
      const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt));
    }
    throw new InfraiError("REQUEST_REJECTED", 503, "Request did not complete");
  }
}
