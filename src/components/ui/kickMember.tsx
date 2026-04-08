import { supabase } from "@/lib/supabase";

export const kickMember = async (
  userId: string,
  leagueId: string | number,
  isLeagueOwner: boolean,
  leagueOwnerId?: string,
  leagueFinished?: boolean,
  onSuccess?: () => void
): Promise<boolean> => {
  if (!leagueId) return false;
  if (!isLeagueOwner) return false;
  if (leagueOwnerId && userId === leagueOwnerId) return false;
  if (leagueFinished) return false;

  if (!window.confirm("Are you sure you want to kick this member?")) {
    return false;
  }

  try {
    const { error } = await supabase
      .from("Portfolios")
      .delete()
      .eq("league_id", Number(leagueId))
      .eq("user_id", userId);

    if (error) {
      alert(`Failed to kick member: ${error.message}`);
      return false;
    }

    if (onSuccess) {
      onSuccess();
    }

    return true;
  } catch (err) {
    console.error("Failed to kick member:", err);
    alert("Failed to kick member");
    return false;
  }
};