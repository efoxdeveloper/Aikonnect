import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "@/routes/AppRoutes";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { PlanAccessNotice } from "@/components/billing/PlanAccessNotice";

export default function App() { return <BrowserRouter><AuthProvider><AppRoutes /><PlanAccessNotice /><Toaster /></AuthProvider></BrowserRouter>; }
