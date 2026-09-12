import type { ForwardRefExoticComponent, RefAttributes } from "react";
import {
  ActivityIcon as Activity, BlocksIcon as Blocks, ChartNoAxesCombinedIcon as ChartNoAxesCombined,
  ChartSplineIcon as ChartSpline, CreditCardIcon as CreditCard,
  FileTextIcon as FileText, HouseIcon as House, LayoutDashboardIcon as PanelsTopLeft,
  ListChecksIcon as ListTodo, MegaphoneIcon as Megaphone, MessageCircleIcon as MessageCircle,
  MessageSquareTextIcon as MessageSquareText,
  UserRoundIcon as UserRound,
  UsersIcon as Users, UsersRoundIcon as UsersRound, WalletCardsIcon as WalletCards,
  WaypointsIcon as Workflow, WebhookIcon as Webhook,
} from "@animateicons/react/lucide";

export interface AnimatedIconProps {
  className?: string;
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
}

export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export type AnimatedIcon = ForwardRefExoticComponent<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>;

export interface NavigationItem {
  title: string;
  url?: string;
  icon: AnimatedIcon;
  badge?: { text: string; variant: "danger" | "warning" | "success" };
  children?: NavigationItem[];
}

export interface NavigationGroup { title?: string; items: NavigationItem[]; }

export const navigationGroups: NavigationGroup[] = [
  { items: [
    { title: "Dashboard", url: "/dashboard", icon: House },
    { title: "Inbox", url: "/inbox", icon: MessageSquareText },
  ] },
  { title: "Marketing", items: [
    { title: "Campaigns", url: "/campaigns", icon: Megaphone },
    { title: "Templates", url: "/templates", icon: FileText },
    { title: "Automation", url: "/automations", icon: Workflow },
  ] },
  { title: "Sales & CRM", items: [
    { title: "Contacts", url: "/contacts", icon: Users },
    { title: "Pipelines", url: "/pipelines", icon: PanelsTopLeft },
    { title: "Tasks", url: "/tasks", icon: ListTodo },
  ] },
  { title: "Analytics", items: [
    { title: "Reports", url: "/reports", icon: ChartNoAxesCombined },
    { title: "Conversation Analytics", url: "/conversation-analytics", icon: ChartSpline },
    { title: "Campaign Analytics", url: "/campaign-analytics", icon: ChartSpline },
  ] },
  { title: "Developer", items: [
    { title: "Integrations", url: "/integrations", icon: Blocks },
    { title: "API & Webhooks", url: "/api-webhooks", icon: Webhook },
    { title: "Webhook Events", url: "/webhook-events", icon: Activity },
  ] },
  { title: "Settings", items: [
    { title: "WhatsApp Account", url: "/whatsapp-account", icon: MessageCircle },
    { title: "Team Members", url: "/team-members", icon: UsersRound },
    { title: "Billing & Usage", url: "/billing", icon: WalletCards },
    { title: "Settings", url: "/account-settings", icon: UserRound },
  ] },
];
