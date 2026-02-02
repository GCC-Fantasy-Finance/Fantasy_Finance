import { createBrowserRouter, RouterProvider } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import AuthLayout from "../layouts/AuthLayout";
import DraftLayout from "../layouts/DraftLayout";
import ProtectedRoute from "./ProtectedRoute";
import LeagueGuardRoute from "./LeagueGuardRoute";
import Home from "../features/home/pages/HomePage";
import DiscoverPage from "../features/discover/pages/DiscoverPage";
import ProfileLayout from "../features/profile/ProfileLayout";
import ProfilePage from "../features/profile/pages/ProfilePage";
import FriendsPage from "../features/profile/pages/FriendsPage";
import LoginPage from "../features/auth/pages/LoginPage";
import SignupPage from "../features/auth/pages/SignupPage";
import NotFoundPage from "../pages/NotFoundPage";
import LeagueDetailPage from "@/features/leagues/pages/LeagueDetailPage";
import { LayoutProvider } from "../context/LayoutContext";
import { AuthProvider } from "../context/AuthContext";
import { ChatbotProvider } from "../context/ChatbotContext";
import SoloLayout from "@/features/solo/SoloLayout";
import SoloLeaderboardPage from "@/features/solo/pages/SoloLeaderboardPage";
import SoloPortfolioPage from "../features/solo/pages/SoloPortfolioPage";
import DraftPage from "../features/draft/pages/DraftPage";
import { Toaster } from "@/components/ui/sonner";

export default function AppRouter() {
  const router = createBrowserRouter([
    {
      element: (
        <LayoutProvider>
          <ChatbotProvider>
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          </ChatbotProvider>
        </LayoutProvider>
      ),
      children: [
        { path: "/", element: <Home /> },
        { path: "/discover", element: <DiscoverPage /> },
        {
          path: "/solo",
          element: <SoloLayout />,
          children: [
            { index: true, element: <SoloPortfolioPage /> },
            { path: "global-leaderboard", element: <SoloLeaderboardPage /> },
          ],
        },
        // League routes
        { path: "/league/:id", element: <LeagueDetailPage /> },
        {
          path: "/profile",
          element: <ProfileLayout />,
          children: [
            { index: true, element: <ProfilePage /> },
            { path: "friends", element: <FriendsPage /> },
          ],
        },
      ],
    },
    {
      // Draft room route with its own layout (doesnt have main header/sidebar)
      element: (
        <LayoutProvider>
          <ProtectedRoute>
            <LeagueGuardRoute>
              <DraftLayout />
            </LeagueGuardRoute>
          </ProtectedRoute>
        </LayoutProvider>
      ),
      children: [{ path: "/draft/:leagueId", element: <DraftPage /> }],
    },
    {
      element: <AuthLayout />,
      children: [
        { path: "/login", element: <LoginPage /> },
        { path: "/signup", element: <SignupPage /> },
      ],
    },
    {
      path: "*",
      element: <NotFoundPage />,
    },
  ]);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AuthProvider>
  );
}
