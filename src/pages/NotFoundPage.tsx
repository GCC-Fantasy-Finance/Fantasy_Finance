import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md space-y-10">
        <div className="space-y-2">
          <h1 className="text-8xl font-bold text-green-700">404</h1>
          <p className="text-green-700">Page Not Found</p>
        </div>

        <h2 className="text-2xl font-medium text-slate-800 ">
          Even the best investors make wrong turns sometimes
        </h2>

        <div className="flex flex-col gap-3 justify-center">
          <Button
            size="lg"
            className="w-auto self-center"
            onClick={() => navigate("/")}
          >
            Go Home
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-auto self-center"
            onClick={() => navigate("/discover")}
          >
            🔍 Discover Stocks
          </Button>
        </div>
      </div>
    </div>
  );
}
