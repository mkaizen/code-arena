import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./ctx/AuthContext.js";
import { LandingPage } from "./pages/LandingPage.js";
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
import { AdminProblemsPage } from "./pages/AdminProblemsPage.js";
import { AdminProblemEditPage } from "./pages/AdminProblemEditPage.js";
import { AdminContestNewPage } from "./pages/AdminContestNewPage.js";
import { AdminContestFinalizePage } from "./pages/AdminContestFinalizePage.js";
import { AdminPlagiarismPage } from "./pages/AdminPlagiarismPage.js";
import { BattlePage } from "./pages/BattlePage.js";
import { BattleMatchPage } from "./pages/BattleMatchPage.js";
import { MatchResultPage } from "./pages/MatchResultPage.js";
import { MatchReplayPage } from "./pages/MatchReplayPage.js";
import { BlogPage } from "./pages/BlogPage.js";
import { BlogPostPage } from "./pages/BlogPostPage.js";
import { DailyPage } from "./pages/DailyPage.js";
import { RacePage } from "./pages/RacePage.js";
import { PageViewTracker } from "./components/PageViewTracker.js";
import "./styles.css";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PageViewTracker />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
          <Route path="/contests" element={<ContestsPage />} />
          <Route path="/contests/:id" element={<ContestPage />} />
          <Route path="/daily" element={<DailyPage />} />
          <Route path="/race/:slug" element={<RacePage />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/:slug" element={<ProblemPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/u/:handle" element={<UserProfilePage />} />
          <Route path="/leaderboard" element={<GlobalLBPage />} />
          <Route path="/battle" element={<BattlePage />} />
          <Route path="/battle/:id" element={<BattleMatchPage />} />
          <Route path="/share/:id" element={<MatchResultPage />} />
          <Route path="/replay/:id" element={<MatchReplayPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/problems" element={<AdminProblemsPage />} />
          <Route path="/admin/problems/new" element={<AdminProblemNewPage />} />
          <Route path="/admin/problems/:id/edit" element={<AdminProblemEditPage />} />
          <Route path="/admin/contests/new" element={<AdminContestNewPage />} />
          <Route path="/admin/contests/finalize" element={<AdminContestFinalizePage />} />
          <Route path="/admin/plagiarism" element={<AdminPlagiarismPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
