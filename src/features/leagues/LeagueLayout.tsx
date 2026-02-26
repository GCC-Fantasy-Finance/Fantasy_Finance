import { Outlet, useParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import SubNav from "@/layouts/components/SubNav";

export default function LeagueLayout() {
  const { leagueId } = useParams<{ leagueId: string }>();

  usePageTitle("League");

  const subNavItems = [
    { name: "Leaderboard", path: `/league/${leagueId}` },
    { name: "Portfolio", path: `/league/${leagueId}/portfolio` },
  ];

  return (
    <>
      <SubNav items={subNavItems} />
      <Outlet />
    </>
  );
}
