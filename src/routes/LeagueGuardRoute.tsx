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

  const [checkResult, setCheckResult] = useState<{
    leagueId: string;
    allowed: boolean;
    isEnded: boolean;
  } | null>(null);

  // checking is derived synchronously: if the result isn't for the current leagueId,
  // we're still loading — this prevents stale state from a previous league being applied.
  const checking = !checkResult || checkResult.leagueId !== leagueId;

  useEffect(() => {
    const checkLeagueAccess = async () => {
      if (!user || !leagueId) {
        setCheckResult(null);
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

      setCheckResult({
        leagueId,
        allowed: !portfolioResult.error && !!portfolioResult.data,
        isEnded: !leagueResult.error && !!leagueResult.data?.is_ended,
      });
    };

    checkLeagueAccess();
  }, [user, leagueId]);

  if (loading || checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        {/* <p className="text-gray-600">Checking league access...</p> */}
        {/* <Spinner /> */}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!checkResult?.allowed) {
    return <Navigate to="/" replace />;
  }

  const resultsPath = `/league/${leagueId}/results`;
  if (checkResult.isEnded && location.pathname !== resultsPath) {
    return <Navigate to={resultsPath} replace />;
  }

  if (!checkResult.isEnded && location.pathname === resultsPath) {
    return <Navigate to={`/league/${leagueId}`} replace />;
  }

  return <>{children}</>;
}
