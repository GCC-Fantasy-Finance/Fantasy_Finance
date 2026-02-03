import { Outlet } from "react-router-dom";

const DraftLayout = () => {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <Outlet />
    </div>
  );
};

export default DraftLayout;