import { usePageTitle } from "@/hooks/usePageTitle";
import PageContent from "@/layouts/components/PageContent";

export default function LeagueLeaderboardPage() {
  usePageTitle("League Portfolio");

  return (
    <PageContent>
      <p className="text-gray-600">League portfolio tab is ready.</p>
    </PageContent>
  );
}
