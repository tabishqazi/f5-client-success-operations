export const DOMAIN_ERROR_CODES = [
  "INVALID_DATE", "INVALID_TIME", "INVALID_TIME_ZONE", "INVALID_INSTANT", "INVALID_RANGE",
  "INVALID_TRANSITION", "EVIDENCE_REQUIRED", "NOT_FOUND", "FORBIDDEN", "VERSION_CONFLICT",
  "RATE_LIMITED", "UNAVAILABLE", "INTERNAL_ERROR",
] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export interface ErrorEnvelope {
  error: { code: DomainErrorCode; message: string; retryable: boolean };
}

const safeMessages: Record<DomainErrorCode, string> = {
  INVALID_DATE: "Enter a valid date in YYYY-MM-DD format.",
  INVALID_TIME: "Choose a valid, unambiguous local time.",
  INVALID_TIME_ZONE: "Choose a supported named time zone.",
  INVALID_INSTANT: "Provide a timestamp with an explicit UTC offset.",
  INVALID_RANGE: "Check the dates and values you entered.",
  INVALID_TRANSITION: "This action is not available in the current state.",
  EVIDENCE_REQUIRED: "Record the required evidence before completing this action.",
  NOT_FOUND: "This record is not available.",
  FORBIDDEN: "This action is not available in your workspace.",
  VERSION_CONFLICT: "This record changed. Refresh it and review your update before saving again.",
  RATE_LIMITED: "Too many requests. Wait a moment and try again.",
  UNAVAILABLE: "We could not complete the request. Your changes have not been confirmed. Please retry.",
  INTERNAL_ERROR: "Something went wrong. Your changes have not been confirmed.",
};

// Whitelisted messages deliberately exclude raw exceptions, SQL, credentials, and user payloads.
export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  const code = error instanceof DomainError ? error.code : "INTERNAL_ERROR";
  return { error: { code, message: safeMessages[code], retryable: code === "RATE_LIMITED" || code === "UNAVAILABLE" } };
}
