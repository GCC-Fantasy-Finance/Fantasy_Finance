import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import { useLayout } from "../context/LayoutContext";

export default function MainLayout() {
  const { pageTitle } = useLayout();

  return (
    <div className="flex h-screen overflow-x-hidden bg-white">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with title and search */}
        <Header title={pageTitle} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-white">
          <div className="w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
