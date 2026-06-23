import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./ctx/AuthContext.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ContestsPage } from "./pages/ContestsPage.js";
import { ContestPage } from "./pages/ContestPage.js";
import { ProblemsPage } from "./pages/ProblemsPage.js";
import { ProblemPage } from "./pages/ProblemPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { GlobalLBPage } from "./pages/GlobalLBPage.js";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage.js";
import "./styles.css";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/contests" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
          <Route path="/contests" element={<ContestsPage />} />
          <Route path="/contests/:id" element={<ContestPage />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/:slug" element={<ProblemPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<GlobalLBPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
