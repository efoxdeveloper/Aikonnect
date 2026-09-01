import type { LucideIcon } from "lucide-react";
import { MessageCircle, UserRound, MessagesSquare, Workflow, Webhook, Clock3, StickyNote } from "lucide-react";
import type { AutomationActionType } from "@/types/automation";
export type AutomationActionDefinition = { type: AutomationActionType; label: string; description: string; category: string; icon: LucideIcon };
export const automationActions: AutomationActionDefinition[] = [
  { type: "SEND_MESSAGE", label: "Send WhatsApp message", description: "Send a free-form WhatsApp message.", category: "Messaging", icon: MessageCircle },
  { type: "SEND_TEMPLATE", label: "Send WhatsApp template", description: "Send an approved WhatsApp template.", category: "Messaging", icon: MessageCircle },
  { type: "SEND_MEDIA", label: "Send media", description: "Send an image, video, audio, or document.", category: "Messaging", icon: MessageCircle },
  { type: "ADD_TAG", label: "Add tag", description: "Add a tag to the contact.", category: "Contact", icon: UserRound },
  { type: "REMOVE_TAG", label: "Remove tag", description: "Remove a tag from the contact.", category: "Contact", icon: UserRound },
  { type: "UPDATE_CONTACT_FIELD", label: "Update contact field", description: "Update a standard contact field.", category: "Contact", icon: UserRound },
  { type: "UPDATE_CUSTOM_FIELD", label: "Update custom field", description: "Update a custom contact field.", category: "Contact", icon: UserRound },
  { type: "ASSIGN_AGENT", label: "Assign agent", description: "Assign the conversation to a teammate.", category: "Conversation", icon: MessagesSquare },
  { type: "ASSIGN_TEAM", label: "Assign team", description: "Assign the conversation to a team.", category: "Conversation", icon: MessagesSquare },
  { type: "CLOSE_CONVERSATION", label: "Close conversation", description: "Close the current conversation.", category: "Conversation", icon: MessagesSquare },
  { type: "REOPEN_CONVERSATION", label: "Reopen conversation", description: "Reopen the current conversation.", category: "Conversation", icon: MessagesSquare },
  { type: "CHANGE_CONVERSATION_STATUS", label: "Change conversation status", description: "Set the conversation status.", category: "Conversation", icon: MessagesSquare },
  { type: "START_WORKFLOW", label: "Start workflow", description: "Start a multi-step workflow.", category: "Automation", icon: Workflow },
  { type: "START_SEQUENCE", label: "Start sequence", description: "Start a timed follow-up sequence.", category: "Automation", icon: Workflow },
  { type: "STOP_SEQUENCE", label: "Stop sequence", description: "Stop an active sequence.", category: "Automation", icon: Workflow },
  { type: "SEND_WEBHOOK", label: "Send webhook", description: "Notify an external service.", category: "Integration", icon: Webhook },
  { type: "CALL_API", label: "Call API", description: "Call an external API endpoint.", category: "Integration", icon: Webhook },
  { type: "WAIT", label: "Wait / delay", description: "Wait before the next action.", category: "Utility", icon: Clock3 },
  { type: "ADD_INTERNAL_NOTE", label: "Add internal note", description: "Add a note for your team.", category: "Utility", icon: StickyNote },
];
export function getActionDefinition(type: AutomationActionType) { return automationActions.find((action) => action.type === type); }
