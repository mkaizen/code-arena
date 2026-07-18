import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, type ComponentType } from "react";
import { AuthProvider } from "./ctx/AuthContext.js";
import { PageViewTracker } from "./components/PageViewTracker.js";
import "./styles.css";

// Each page is code-split into its own chunk and loaded on demand, so the
// initial download is just the app shell + router. Heavy, route-specific
// dependencies (react-markdown on the blog, the Monaco editor on the solve
// and match screens) no longer sit in the bundle every visitor downloads.
// Named exports are mapped to the default export lazy() expects.
const lazyPage = <K extends string>(
  loader: () => Promise<Record<K, ComponentType>>,
  name: K,
) => lazy(() => loader().then((m) => ({ default: m[name] })));

const LandingPage = lazyPage(() => import("./pages/LandingPage.js"), "LandingPage");
const LoginPage = lazyPage(() => import("./pages/LoginPage.js"), "LoginPage");
const ContestsPage = lazyPage(() => import("./pages/ContestsPage.js"), "ContestsPage");
const ContestPage = lazyPage(() => import("./pages/ContestPage.js"), "ContestPage");
const ProblemsPage = lazyPage(() => import("./pages/ProblemsPage.js"), "ProblemsPage");
const ProblemPage = lazyPage(() => import("./pages/ProblemPage.js"), "ProblemPage");
const ProfilePage = lazyPage(() => import("./pages/ProfilePage.js"), "ProfilePage");
const UserProfilePage = lazyPage(() => import("./pages/UserProfilePage.js"), "UserProfilePage");
const GlobalLBPage = lazyPage(() => import("./pages/GlobalLBPage.js"), "GlobalLBPage");
const VsAiPage = lazyPage(() => import("./pages/VsAiPage.js"), "VsAiPage");
const OAuthCallbackPage = lazyPage(() => import("./pages/OAuthCallbackPage.js"), "OAuthCallbackPage");
const AdminPage = lazyPage(() => import("./pages/AdminPage.js"), "AdminPage");
const AdminProblemNewPage = lazyPage(() => import("./pages/AdminProblemNewPage.js"), "AdminProblemNewPage");
const AdminProblemsPage = lazyPage(() => import("./pages/AdminProblemsPage.js"), "AdminProblemsPage");
const AdminProblemEditPage = lazyPage(() => import("./pages/AdminProblemEditPage.js"), "AdminProblemEditPage");
const AdminContestNewPage = lazyPage(() => import("./pages/AdminContestNewPage.js"), "AdminContestNewPage");
const AdminContestFinalizePage = lazyPage(() => import("./pages/AdminContestFinalizePage.js"), "AdminContestFinalizePage");
const AdminPlagiarismPage = lazyPage(() => import("./pages/AdminPlagiarismPage.js"), "AdminPlagiarismPage");
const BattlePage = lazyPage(() => import("./pages/BattlePage.js"), "BattlePage");
const BattleMatchPage = lazyPage(() => import("./pages/BattleMatchPage.js"), "BattleMatchPage");
const MatchResultPage = lazyPage(() => import("./pages/MatchResultPage.js"), "MatchResultPage");
const SpectatePage = lazyPage(() => import("./pages/SpectatePage.js"), "SpectatePage");
const MatchReplayPage = lazyPage(() => import("./pages/MatchReplayPage.js"), "MatchReplayPage");
const BlogPage = lazyPage(() => import("./pages/BlogPage.js"), "BlogPage");
const BlogPostPage = lazyPage(() => import("./pages/BlogPostPage.js"), "BlogPostPage");
const DailyPage = lazyPage(() => import("./pages/DailyPage.js"), "DailyPage");

// Neutral, full-height dark backdrop while a route chunk loads — matches the
// app/prerender background so there's no white flash on first paint.
function PageFallback() {
  return <div style={{ minHeight: "100dvh", background: "var(--ink)" }} />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PageViewTracker />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
            <Route path="/contests" element={<ContestsPage />} />
            <Route path="/contests/:id" element={<ContestPage />} />
            <Route path="/daily" element={<DailyPage />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/problems/tag/:tag" element={<ProblemsPage />} />
            <Route path="/problems/difficulty/:level" element={<ProblemsPage />} />
            <Route path="/problems/:slug" element={<ProblemPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/u/:handle" element={<UserProfilePage />} />
            <Route path="/leaderboard" element={<GlobalLBPage />} />
            <Route path="/vs-ai" element={<VsAiPage />} />
            <Route path="/battle" element={<BattlePage />} />
            <Route path="/battle/:id" element={<BattleMatchPage />} />
            <Route path="/watch/:id" element={<SpectatePage />} />
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
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
