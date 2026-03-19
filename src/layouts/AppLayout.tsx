import { Outlet } from "react-router-dom";
import { useChatbot } from "../context/ChatbotContext";
import Chatbot from "../components/ui/Chatbot";
import NotificationsPanel from "../components/ui/NotificationsPanel";
import BuyStockModal from "@/components/ui/BuyStockModal";
import SellStockModal from "@/components/ui/SellStockModal";

export default function AppLayout() {
  const { isPinned: isChatbotPinned, setIsPinned, isDisabled } = useChatbot();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Page Layout (MainLayout or DraftLayout) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </div>

      {/* Notifications Panel */}
      <NotificationsPanel />

      {/* Right-side Chatbot panel */}
      <Chatbot
        disabled={isDisabled}
        isPinned={isChatbotPinned}
        onPinnedChange={setIsPinned}
      />

      {/* Global Modals */}
      <BuyStockModal />
      <SellStockModal />
    </div>
  );
}