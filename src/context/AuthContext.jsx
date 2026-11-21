import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInAnonymously, 
  updateProfile, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  isFirebaseConfigured
} from "../firebase";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      localStorage.removeItem("karaoke_guest_name");
      if (currentUser?.isAnonymous && currentUser.displayName) {
        try {
          await updateProfile(currentUser, { displayName: null });
        } catch (e) {
          console.warn("Failed to clear saved guest name:", e);
        }
      }
      setUser(currentUser?.isAnonymous ? { ...currentUser, displayName: null } : currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    if (!auth) throw new Error("Firebase chưa được cấu hình!");
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      try {
        await fbSignOut(auth);
      } catch (e) {
        console.warn("Sign out anonymous user error:", e);
      }
    }
    const result = await signInWithPopup(auth, googleProvider);
    setUser(result.user);
    localStorage.removeItem("karaoke_guest_name");
    return result.user;
  };

  const loginAsGuest = async (displayName) => {
    const trimmedName = displayName?.trim() || null;
    if (!auth) throw new Error("Firebase chưa được cấu hình!");
    
    // If already authenticated and not anonymous, do not downgrade to guest!
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      return auth.currentUser;
    }

    localStorage.removeItem("karaoke_guest_name");

    // Guest names are room-only data; never persist them in Firebase Auth.
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      if (auth.currentUser.displayName) {
        await updateProfile(auth.currentUser, { displayName: null });
      }
      setUser({ ...auth.currentUser, displayName: trimmedName });
      return auth.currentUser;
    }

    const result = await signInAnonymously(auth);
    setUser({ ...result.user, displayName: trimmedName });
    return result.user;
  };

  const logout = async () => {
    localStorage.removeItem("karaoke_guest_name");
    if (auth) {
      await fbSignOut(auth);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isConfigured: isFirebaseConfigured,
        loginWithGoogle,
        loginAsGuest,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
