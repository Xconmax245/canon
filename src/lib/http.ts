import { NextResponse } from "next/server";

/**
 * Standard API error type. Provider payloads are never surfaced raw —
 * only sanitized messages the frontend can display.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[api] unhandled error:", err);
  return NextResponse.json({ error: { code: "internal_error", message } }, { status: 500 });
}

export async function readJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "invalid_body", "Request body must be valid JSON");
  }
}
