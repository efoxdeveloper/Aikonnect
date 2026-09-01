import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { ProtectedRoute, PublicOnlyRoute } from "@/routes/AuthGuards";
import { VerifyEmail } from "@/pages/VerifyEmail";
import { InvitationAccept } from "@/pages/InvitationAccept";
import { ContactDetails } from "@/pages/ContactDetails";
import { CampaignDetails } from "@/pages/CampaignDetails";
import { Inbox } from "@/pages/Inbox";
import { Automations } from "@/pages/Automations";
import { AutomationBuilder } from "@/pages/AutomationBuilder";
import { AutomationPlaceholder } from "@/pages/AutomationPlaceholder";
import { Workflows } from "@/pages/Workflows";
import { WorkflowBuilder } from "@/pages/WorkflowBuilder";
import { Tasks } from "@/pages/Tasks";

const paths = ["dashboard/analytics", "dashboard/activity", "contacts", "campaigns", "templates", "createtemplate", "pipelines", "catalog", "orders", "reports", "integrations", "settings", "account-settings", "payments", "click-to-whatsapp-ads", "conversation-analytics", "campaign-analytics", "api-webhooks", "webhook-events", "whatsapp-account", "team-members", "team-members/roles", "billing"];
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/invitations/accept" element={<InvitationAccept />} />
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/contacts/:contactId" element={<ContactDetails />} />
          <Route path="/campaigns/:campaignId" element={<CampaignDetails />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/automations/create" element={<AutomationBuilder />} />
          <Route path="/automations/:automationId" element={<AutomationBuilder />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/workflows/create" element={<WorkflowBuilder />} />
          <Route path="/workflows/:workflowId" element={<WorkflowBuilder />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/sequences" element={<AutomationPlaceholder kind="sequences" />} />
          <Route path="/automation-settings" element={<AutomationPlaceholder kind="settings" />} />
          {paths.map((path) => <Route key={path} path={`/${path}`} element={<Dashboard />} />)}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
