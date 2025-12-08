import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { toast } from "sonner";

interface Profile {
  id: string;
  email: string;
  username: string;
  avatar_url?: string;
  badge?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ error: AuthError | null }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateAvatar: (file: File) => Promise<{ error: Error | null }>;
  removeAvatar: () => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("Profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }

    return data as Profile | null;
  };

  useEffect(() => {
    let isMounted = true;
    let loadingTimeout: ReturnType<typeof setTimeout> | undefined;

    const finishLoading = () => {
      if (isMounted) {
        setLoading(false);
      }
    };

    const init = async () => {
      try {
        // Safety timeout to avoid being stuck in loading forever
        loadingTimeout = setTimeout(finishLoading, 5000);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          fetchProfile(session.user.id)
            .then((profileData) => {
              if (isMounted) setProfile(profileData);
            })
            .catch((error) => {
              console.error("Error fetching profile:", error);
            });
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Error during auth init:", error);
      } finally {
        finishLoading();
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id)
          .then((profileData) => {
            if (isMounted) setProfile(profileData);
          })
          .catch((error) => {
            console.error("Error fetching profile:", error);
          });
      } else {
        // SIGNED_OUT, USER_DELETED, TOKEN_REFRESHED with null session, etc.
        setProfile(null);
      }

      finishLoading();
    });

    return () => {
      isMounted = false;
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: username,
        },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error during sign out:", error);
      toast.error("Could not sign out. Please try again.");
      return;
    }
    // Local state cleanup in case the event listener lags / fails
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const deleteOldAvatar = async (avatarUrl: string) => {
    try {
      // Extract the file path from the URL
      // Handle both formats: full URL and just the path
      let filePath = "";

      if (avatarUrl.includes("/avatars/")) {
        const urlParts = avatarUrl.split("/avatars/");
        filePath = urlParts[1];
      } else {
        filePath = avatarUrl;
      }

      // Remove query parameters if present
      filePath = filePath.split("?")[0];

      if (!filePath) {
        console.error(
          "Could not extract file path from avatar URL:",
          avatarUrl
        );
        return;
      }

      console.log("Attempting to delete avatar at path:", filePath);

      // Delete the old file from storage
      const { data, error } = await supabase.storage
        .from("avatars")
        .remove([filePath]);

      if (error) {
        console.error("Error deleting old avatar:", error);
        console.error("Failed to delete file path:", filePath);
      } else {
        console.log("Successfully deleted old avatar:", data);
      }
    } catch (error) {
      console.error("Error in deleteOldAvatar:", error);
      console.error("Avatar URL was:", avatarUrl);
    }
  };

  const updateAvatar = async (file: File) => {
    if (!user) {
      return { error: new Error("No user logged in") };
    }

    try {
      // Delete old avatar if it exists
      if (profile?.avatar_url) {
        await deleteOldAvatar(profile.avatar_url);
      }

      // Create a unique file path
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, {
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Update profile with avatar_url
      const { error: updateError } = await supabase
        .from("Profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }

      // Refresh profile to get the updated avatar_url
      await refreshProfile();

      toast.success("Profile picture updated successfully!");
      return { error: null };
    } catch (error) {
      console.error("Error updating avatar:", error);
      toast.error("Failed to update profile picture");
      return { error: error as Error };
    }
  };

  const removeAvatar = async () => {
    if (!user) {
      return { error: new Error("No user logged in") };
    }

    if (!profile?.avatar_url) {
      return { error: new Error("No avatar to remove") };
    }

    try {
      // Delete the avatar file from storage
      await deleteOldAvatar(profile.avatar_url);

      // Update profile to remove avatar_url
      const { error: updateError } = await supabase
        .from("Profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }

      // Refresh profile
      await refreshProfile();

      toast.success("Profile picture removed successfully!");
      return { error: null };
    } catch (error) {
      console.error("Error removing avatar:", error);
      toast.error("Failed to remove profile picture");
      return { error: error as Error };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    updateAvatar,
    removeAvatar,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
