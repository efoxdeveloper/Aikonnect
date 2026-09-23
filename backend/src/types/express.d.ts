declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        email: string;
        emailVerifiedAt: Date | null;
      };
      platformAccess?: {
        role: "SUPPORT" | "OPERATIONS" | "BILLING" | "ADMIN" | "SUPER_ADMIN";
      };
      workspaceAccess?: {
        workspaceId: string;
        membershipId: string;
        roleId: string;
        permissions: string[];
      };
      validatedQuery?: unknown;
      rawBody?: Buffer;
    }
  }
}

export {};
