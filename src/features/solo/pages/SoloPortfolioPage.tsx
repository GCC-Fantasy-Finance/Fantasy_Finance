import PortfolioPage from "@/features/portfolio/pages/PortfolioPage";
import { usePageTitle } from "@/hooks/usePageTitle";

function SoloPortfolioPage() {
  usePageTitle("Solo Portfolio");
  return <PortfolioPage mode="solo" />;
}

export default SoloPortfolioPage;
