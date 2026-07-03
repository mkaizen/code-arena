import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./ctx/AuthContext.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ContestsPage } from "./pages/ContestsPage.js";
import { ContestPage } from "./pages/ContestPage.js";
import { ProblemsPage } from "./pages/ProblemsPage.js";
import { ProblemPage } from "./pages/ProblemPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { UserProfilePage } from "./pages/UserProfilePage.js";
import { GlobalLBPage } from "./pages/GlobalLBPage.js";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage.js";
import { AdminPage } from "./pages/AdminPage.js";
import { AdminProblemNewPage } from "./pages/AdminProblemNewPage.js";
import { AdminContestNewPage } from "./pages/AdminContestNewPage.js";
import { AdminContestFinalizePage } from "./pages/AdminContestFinalizePage.js";
import { BattlePage } from "./pages/BattlePage.js";
import { BattleMatchPage } from "./pages/BattleMatchPage.js";
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
          <Route path="/u/:handle" element={<UserProfilePage />} />
          <Route path="/leaderboard" element={<GlobalLBPage />} />
          <Route path="/battle" element={<BattlePage />} />
          <Route path="/battle/:id" element={<BattleMatchPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/problems/new" element={<AdminProblemNewPage />} />
          <Route path="/admin/contests/new" element={<AdminContestNewPage />} />
          <Route path="/admin/contests/finalize" element={<AdminContestFinalizePage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
