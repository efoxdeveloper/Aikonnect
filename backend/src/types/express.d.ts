declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        email: string;
        emailVerifiedAt: Date | null;
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
