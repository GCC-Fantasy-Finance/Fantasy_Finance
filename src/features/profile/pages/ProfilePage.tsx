import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, User2, Lock, Eye, EyeOff } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

function Profile() {
  const { profile, updateAvatar, removeAvatar, updatePassword } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setUploading(true);
    await updateAvatar(file);
    setUploading(false);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setRemoving(true);
    await removeAvatar();
    setRemoving(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setUpdatingPassword(true);
    const { error } = await updatePassword(newPassword);
    setUpdatingPassword(false);

    if (!error) {
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-medium mb-6">Account Settings</h1>

      <div className="space-y-6">
        {/* Profile Picture Section */}
        <div className="space-y-3">
          <div className="relative w-40 h-40 group">
            <div className="w-full h-full rounded bg-gray-200 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <>
                  <img
                    src={profile.avatar_url}
                    alt="Profile"
                    className="w-full h-full object-cover transition-all group-hover:brightness-50"
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={handleAvatarClick}
                      disabled={uploading || removing}
                      className="w-12 h-12 rounded bg-transparent border border-white/50 hover:bg-white/20 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      aria-label="Upload new profile picture"
                    >
                      <Pencil className="w-5 h-5 text-white" />
                    </button>
                    <button
                      onClick={handleRemoveAvatar}
                      disabled={uploading || removing}
                      className="w-12 h-12 rounded bg-transparent border border-white/50 hover:bg-white/20 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      aria-label="Remove profile picture"
                    >
                      <Trash2 className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleAvatarClick}
                  disabled={uploading || removing}
                  className="w-full h-full flex items-center justify-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Upload profile picture"
                >
                  <User2 className="w-12 h-12 text-gray-500 group-hover:hidden" />
                  <Pencil className="w-11 h-11 text-gray-600 hidden group-hover:block" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Profile picture file input"
            />
          </div>
        </div>

        {/* Username Field */}
        <div className="space-y-2">
          <label
            htmlFor="username"
            className="text-sm font-medium text-gray-700"
          >
            Username
          </label>
          <Input
            id="username"
            type="text"
            value={profile?.username || ""}
            disabled
          />
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={profile?.email || ""}
            disabled
          />
        </div>

        {/* Password Change Section */}
        <div className="mt-10 bg-gray-100 rounded-md p-6 border border-gray-200">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Change Password
          </h2>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="newPassword"
                className="text-sm font-medium text-gray-700"
              >
                New Password
              </label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  disabled={updatingPassword}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="cursor-pointer absolute right-0 top-1/2 -translate-y-1/2 px-3 py-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-gray-700"
              >
                Confirm New Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={updatingPassword}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={updatingPassword || !newPassword}>
                {updatingPassword ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Profile;
