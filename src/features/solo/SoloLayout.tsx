import { Outlet } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";
import SubNav from "../../layouts/components/SubNav";

export default function SoloLayout() {
  usePageTitle("Solo");

  const subNavItems = [
    { name: "Portfolio", path: "/solo" },
    { name: "Global Leaderboard", path: "/solo/global-leaderboard" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <SubNav items={subNavItems} />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full max-w-6xl p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
