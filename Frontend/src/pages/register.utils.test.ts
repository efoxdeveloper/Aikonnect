import { describe, expect, it } from "vitest";
import { getPasswordValidationError, toRegistrationRequest } from "@/pages/register.utils";

describe("registration password validation", () => {
  it("rejects short, weak, and mismatched passwords", () => {
    expect(getPasswordValidationError("Pass1", "Pass1")).toContain("8 characters");
    expect(getPasswordValidationError("password", "password")).toContain("letter and one number");
    expect(getPasswordValidationError("Password123", "Password456")).toContain("do not match");
  });

  it("accepts a matching password that follows the backend rules", () => {
    expect(getPasswordValidationError("Password123", "Password123")).toBeNull();
  });
});

describe("registration request mapping", () => {
  it("maps the form email and password to the backend registration contract", () => {
    const request = toRegistrationRequest({
      workEmail: "  USER@Example.com ",
      password: "Password123",
      confirmPassword: "Password123",
      firstName: " Test ",
      lastName: " User ",
      phone: " +910000000000 ",
      companyName: " Example Ltd ",
      industry: "technology",
      companyWebsite: "",
      companyLocation: " Delhi ",
      annualRevenue: "under-50-lakh",
    });

    expect(request.email).toBe("user@example.com");
    expect(request.password).toBe("Password123");
    expect(request.companyWebsite).toBeUndefined();
    expect(request.industry).toBe("technology");
    expect(request).not.toHaveProperty("confirmPassword");
  });
});
