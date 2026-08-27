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

const paths = ["dashboard/analytics", "dashboard/activity", "contacts", "campaigns", "templates", "createtemplate", "automations", "leads", "pipelines", "catalog", "orders", "reports", "integrations", "settings", "account-settings", "tasks", "payments", "click-to-whatsapp-ads", "conversation-analytics", "campaign-analytics", "api-webhooks", "webhook-events", "whatsapp-account", "team-members", "team-members/roles", "billing"];
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
          {paths.map((path) => <Route key={path} path={`/${path}`} element={<Dashboard />} />)}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
