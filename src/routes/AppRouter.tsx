import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import DraftLayout from "../layouts/DraftLayout";
import AppLayout from "../layouts/AppLayout";
import AuthLayout from "../layouts/AuthLayout";
import ProtectedRoute from "./ProtectedRoute";
import LeagueGuardRoute from "./LeagueGuardRoute";

import Home from "../features/home/pages/HomePage";
import DiscoverPage from "../features/discover/pages/DiscoverPage";
import SectorPage from "../features/discover/pages/SectorPage";
import ProfileLayout from "../features/profile/ProfileLayout";
import ProfilePage from "../features/profile/pages/ProfilePage";
import BadgesPage from "../features/profile/pages/BadgesPage";
import LoginPage from "../features/auth/pages/LoginPage";
import ResetPasswordPage from "../features/auth/pages/ResetPasswordPage";
import SignupPage from "../features/auth/pages/SignupPage";
import NotFoundPage from "../pages/NotFoundPage";
import LeagueDetailPage from "@/features/leagues/pages/LeagueDetailPage";
import LeagueSummaryPage from "@/features/leagues/pages/LeagueSummaryPage";
import LeagueLayout from "@/features/leagues/LeagueLayout";
import LeaguePortfolioPage from "@/features/leagues/pages/LeaguePortfolioPage";
import LeagueLeaderboardPage from "@/features/leagues/pages/LeagueLeaderboardPage";

import { LayoutProvider } from "../context/LayoutContext";
import { AuthProvider } from "../context/AuthContext";
import { ChatbotProvider } from "../context/ChatbotContext";
import { NotificationsProvider } from "../context/NotificationsContext";
import { TradeModalProvider } from "@/context/TradeModalContext";

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
            <NotificationsProvider>
              <TradeModalProvider>
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              </TradeModalProvider>
            </NotificationsProvider>
          </ChatbotProvider>
        </LayoutProvider>
      ),
      children: [
        {
          element: <MainLayout />,
          children: [
            { path: "/", element: <Home /> },
            { path: "/discover", element: <DiscoverPage /> },
            { path: "/discover/sector/:sector", element: <SectorPage /> },
            {
              path: "/solo",
              element: <SoloLayout />,
              children: [
                { index: true, element: <SoloPortfolioPage /> },
                {
                  path: "global-leaderboard",
                  element: <SoloLeaderboardPage />,
                },
              ],
            },
            {
              path: "/league/:leagueId",
              element: (
                <LeagueGuardRoute>
                  <LeagueLayout />
                </LeagueGuardRoute>
              ),
              children: [
                { index: true, element: <Navigate to="portfolio" replace /> },
                { path: "portfolio", element: <LeaguePortfolioPage /> },
                { path: "leaderboard", element: <LeagueLeaderboardPage /> },
                { path: "details", element: <LeagueDetailPage /> },
              ],
            },
            {
              path: "/league/:leagueId/results",
              element: (
                <LeagueGuardRoute>
                  <LeagueSummaryPage />
                </LeagueGuardRoute>
              ),
            },
            {
              path: "/profile",
              element: <ProfileLayout />,
              children: [
                { index: true, element: <ProfilePage /> },
                { path: "badges", element: <BadgesPage /> },
              ],
            },
          ],
        },

        {
          element: (
            <LeagueGuardRoute>
              <DraftLayout />
            </LeagueGuardRoute>
          ),
          children: [{ path: "/draft/:leagueId", element: <DraftPage /> }],
        },
      ],
    },

    {
      element: <AuthLayout />,
      children: [
        { path: "/login", element: <LoginPage /> },
        { path: "/reset-password", element: <ResetPasswordPage /> },
        { path: "/signup", element: <SignupPage /> },
      ],
    },

    { path: "*", element: <NotFoundPage /> },
  ]);

  return (
    <>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster />
    </>
  );
}
