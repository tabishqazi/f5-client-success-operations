import { describe, expect, it } from "vitest";
import { DomainError, toErrorEnvelope } from "../../src/domain/errors";

describe("public error contract", () => {
  it("never leaks raw infrastructure exceptions", () => {
    const result = toErrorEnvelope(new Error("postgres://secret:password@private-host/db"));
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(result)).not.toMatch(/password|postgres|private-host/);
    expect(result.error.retryable).toBe(false);
  });
  it("preserves a conflict code with an actionable safe message", () => {
    const result = toErrorEnvelope(new DomainError("VERSION_CONFLICT", "private record version: 29"));
    expect(result.error.code).toBe("VERSION_CONFLICT");
    expect(result.error.message).toContain("Refresh");
    expect(result.error.message).not.toContain("29");
    expect(result.error.retryable).toBe(false);
  });
  it("allows retry for transient unavailability without confirming a save", () => {
    expect(toErrorEnvelope(new DomainError("UNAVAILABLE", "socket failure"))).toEqual({ error: { code: "UNAVAILABLE", message: "We could not complete the request. Your changes have not been confirmed. Please retry.", retryable: true } });
  });
});
