import { describe, expect, it } from "vitest";
import { firebaseConfig } from "@/lib/firebase";

describe("Firebase configuration", () => {
  it("initializes the supplied WhatsApp Web Firebase project", () => {
    expect(firebaseConfig.projectId).toBe("whatsappweb-3aa65");
    expect(firebaseConfig.authDomain).toBe("whatsappweb-3aa65.firebaseapp.com");
    expect(firebaseConfig.appId).toBe("1:809999838510:web:702df04109464c12f69ebf");
  });
});
