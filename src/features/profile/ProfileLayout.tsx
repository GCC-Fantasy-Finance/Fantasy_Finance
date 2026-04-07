import { Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useAuth } from "../../context/AuthContext";
import SubNav from "../../layouts/components/SubNav";
import { Button } from "../../components/ui/button";

export default function ProfileLayout() {
  usePageTitle("Your Profile");
  const { signOut } = useAuth();

  const subNavItems = [
    { name: "Profile", path: "/profile" },
    { name: "Badges", path: "/profile/badges" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <SubNav
        items={subNavItems}
        rightContent={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full max-w-6xl p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
