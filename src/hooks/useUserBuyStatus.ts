import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const useUserBuyStatus = (portfolioId: number | undefined) => {
  const [userHasBought, setUserHasBought] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!portfolioId) {
      setLoaded(true);
      return;
    }

    let isMounted = true;

    const checkBuyStatus = async () => {
      try {
        const { error, count } = await supabase
          .from("Transactions")
          .select("transaction_id", { count: "exact" })
          .eq("portfolio_id", portfolioId)
          .eq("transaction_type", "buy")
          .limit(1);

        if (!isMounted) return;

        if (error) {
          console.error("Error checking buy status:", error);
          setUserHasBought(false);
        } else {
          const hasBought = (count ?? 0) > 0;
          setUserHasBought(hasBought);
        }
      } catch (err) {
        console.error("Error in checkBuyStatus:", err);
        setUserHasBought(false);
      } finally {
        setLoaded(true);
      }
    };

    checkBuyStatus();

    // Real-time listener
    const channel = supabase
      .channel(`transactions-${portfolioId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Transactions",
          filter: `portfolio_id=eq.${portfolioId}`,
        },
        (payload) => {
          if (isMounted && payload.new.transaction_type === "buy") {
            setUserHasBought(true);
          }
        }
      )
      .subscribe();

    return () => {
      
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [portfolioId]);

  
  return { userHasBought, loaded };
};