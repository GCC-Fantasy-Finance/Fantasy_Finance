import { Outlet } from "react-router-dom";

const DraftLayout = () => {
  return (
    <div style={{ minHeight: "100vh" }}>
      <Outlet />
    </div>
  );
};

export default DraftLayout;