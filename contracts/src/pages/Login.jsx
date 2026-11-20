import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, User, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import PasswordInput from "@/components/PasswordInput";
import { safeReturnTo } from "@/lib/authReturnTo";

const ERRORS = {
  bad_credentials: "שם משתמש או סיסמה שגויים",
  too_many_attempts: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.",
  not_configured: "המערכת לא מוגדרת בשרת הזה",
  network: "אין חיבור לשרת. בדקו את החיבור ונסו שוב.",
};

// Same username and password as /pay-link (PAY_ADMIN_USER / PAY_ADMIN_PASSWORD).
export default function Login() {
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(user, password);
      await checkUserAuth();
      navigate(returnTo, { replace: true });
    } catch (err) {
      setPassword("");
      setError(ERRORS[err.data?.error] || "ההתחברות נכשלה, נסו שוב");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout icon={LogIn} title="ברוכים הבאים" subtitle="התחברו כדי לנהל את החוזים">
      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="user">שם משתמש</Label>
          <div className="relative">
            <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="user"
              type="text"
              dir="ltr"
              autoComplete="username"
              autoFocus
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="h-12 ps-10"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">סיסמה</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="h-12 w-full font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="ms-2 h-4 w-4 animate-spin" />
              מתחבר...
            </>
          ) : (
            "התחברות"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
