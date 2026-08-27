export type WorkspaceSetupData = {
  workspace: {
    id: string;
    name: string;
  };
  progress: {
    workspaceCreated: boolean;
    whatsappConnected: boolean;
    phoneNumberConnected: boolean;
    testMessageSent: boolean;
    completedSteps: number;
    totalSteps: number;
    percentage: number;
    completedAt: string | null;
  };
  whatsapp: {
    status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
    accountCount: number;
    phoneNumberCount: number;
    accounts: Array<{
      id: string;
      metaBusinessId: string | null;
      metaWabaId: string | null;
      displayName: string | null;
      status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
      connectedAt: string | null;
      lastSyncedAt: string | null;
      lastError: string | null;
      phoneNumbers: Array<{
        id: string;
        metaPhoneNumberId: string;
        displayPhoneNumber: string;
        verifiedName: string | null;
        status: "PENDING" | "ACTIVE" | "DISCONNECTED" | "ERROR";
        qualityRating: string | null;
        messagingLimit: string | null;
        connectedAt: string | null;
        lastSyncedAt: string | null;
      }>;
    }>;
  };
  team: {
    memberCount: number;
    pendingInvitationCount: number;
  };
};
