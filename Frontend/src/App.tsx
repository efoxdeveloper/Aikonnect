import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "@/routes/AppRoutes";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";

export default function App() { return <BrowserRouter><AuthProvider><AppRoutes /><Toaster /></AuthProvider></BrowserRouter>; }
