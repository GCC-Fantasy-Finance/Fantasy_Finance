import { useEffect } from "react";
import { useLayout } from "../context/LayoutContext";

export function usePageTitle(title?: string | null) {
  const { setPageTitle } = useLayout();

  useEffect(() => {
    const normalizedTitle = title?.trim();
    if (!normalizedTitle) return;

    setPageTitle(normalizedTitle);
  }, [title, setPageTitle]);
}
