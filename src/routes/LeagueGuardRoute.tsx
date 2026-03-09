import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../context/AuthContext";

interface LeagueRouteProps {
  children: ReactNode;
}

export default function LeagueRoute({ children }: LeagueRouteProps) {
  const { user, loading } = useAuth();
  const { leagueId } = useParams<{ leagueId: string }>();
  const location = useLocation();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [isEnded, setIsEnded] = useState(false);

  useEffect(() => {
    const checkLeagueAccess = async () => {
      if (!user || !leagueId) {
        setChecking(false);
        return;
      }

      const [portfolioResult, leagueResult] = await Promise.all([
        supabase
          .from("Portfolios")
          .select("portfolio_id")
          .eq("league_id", leagueId)
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("Leagues")
          .select("is_ended")
          .eq("league_id", leagueId)
          .single(),
      ]);

      if (!portfolioResult.error && portfolioResult.data) {
        setAllowed(true);
      }

      if (!leagueResult.error && leagueResult.data?.is_ended) {
        setIsEnded(true);
      }

      setChecking(false);
    };

    checkLeagueAccess();
  }, [user, leagueId]);

  if (loading || checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Checking league access...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  const resultsPath = `/league/${leagueId}/results`;
  if (isEnded && location.pathname !== resultsPath) {
    return <Navigate to={resultsPath} replace />;
  }

  return <>{children}</>;
}