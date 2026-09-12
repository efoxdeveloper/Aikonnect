export type Contact = {
  id: string;
  name: string;
  phone: string;
  whatsappId: string;
  profileName: string;
  profileImageUrl?: string | null;
  email: string;
  createdOn: string;
  source: string;
  status?: string;
  userId?: string | null;
  accountOwnerId?: string | null;
  accountOwner?: { id: string; firstName: string; lastName: string; email: string } | null;
  dealValue?: number | null;
  tags: string[];
};

export type ContactImportRecord = Omit<Contact, "id" | "createdOn" | "whatsappId" | "profileName"> & {
  whatsappId?: string;
  profileName?: string;
  whatsappOpted?: boolean;
  whatsappConsentSource?: string;
  whatsappConsentAt?: string;
  marketingBlocked?: boolean;
  marketingBlockSource?: string;
  marketingBlockReason?: string;
  customAttributes?: Record<string, unknown>;
};

export type ContactCustomFieldType = "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTI_SELECT";

export type ContactCustomFieldDefinition = {
  id: string;
  key: string;
  label: string;
  type: ContactCustomFieldType;
  options: string[];
  required: boolean;
  position: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactApiRecord = {
  id: string;
  name: string;
  phone: string | null;
  hasPhone: boolean;
  whatsappId: string | null;
  hasWhatsappId: boolean;
  profileName: string | null;
  profileImageUrl?: string | null;
  email: string | null;
  source: string;
  status: string;
  userId: string | null;
  accountOwnerId: string | null;
  accountOwner: { id: string; firstName: string; lastName: string; email: string } | null;
  dealValue: number | null;
  whatsappOpted: boolean;
  whatsappOptInSource: string | null;
  whatsappOptedInAt: string | null;
  whatsappOptOutSource: string | null;
  whatsappOptedOutAt: string | null;
  marketingBlocked: boolean;
  marketingBlockedAt: string | null;
  marketingBlockSource: string | null;
  marketingBlockReason: string | null;
  marketingEligible: boolean;
  tags: Array<{ id: string; name: string; color: string | null }>;
  createdAt: string;
  updatedAt: string;
  customAttributes?: Record<string, unknown>;
};

export type ContactListResponse = {
  items: ContactApiRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};

export type ContactImportResult = {
  summary: { total: number; created: number; updated: number; skipped: number };
};
