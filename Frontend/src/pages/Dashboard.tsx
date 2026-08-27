import { useLocation } from "react-router-dom";
import { WhatsAppAccountSetup } from "@/pages/WhatsAppAccountSetup";
import { WorkspaceSetupDashboard } from "@/pages/WorkspaceSetupDashboard";
import { RoleManagement } from "@/pages/RoleManagement";
import { TeamMembers } from "@/pages/TeamMembers";
import { WorkspaceSettings } from "@/pages/WorkspaceSettings";
import { AccountSettings } from "@/pages/AccountSettings";
import { ContactHub } from "@/pages/ContactHub";
import { Campaigns } from "@/pages/Campaigns";
import { TemplateBuilder } from "@/pages/TemplateBuilder";
import { Templates } from "@/pages/Templates";

export function Dashboard() {
  const { pathname } = useLocation();
  if (pathname === "/dashboard") return <WorkspaceSetupDashboard />;
  if (pathname === "/whatsapp-account") return <WhatsAppAccountSetup />;
  if (pathname === "/team-members") return <TeamMembers />;
  if (pathname === "/team-members/roles") return <RoleManagement />;
  if (pathname === "/settings") return <WorkspaceSettings />;
  if (pathname === "/account-settings") return <AccountSettings />;
  if (pathname === "/contacts") return <ContactHub />;
  if (pathname === "/campaigns") return <Campaigns />;
  if (pathname === "/templates") return <Templates />;
  if (pathname === "/createtemplate") return <TemplateBuilder />;
  return <div className="min-h-[calc(100vh-68px)]" />;
}
