import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { PenLine, LogOut } from "lucide-react";
import { isEn, t } from "@/i18n";
import LangSwitch from "@/components/LangSwitch";

const NAV = [
  { to: "/", label: t("חוזים וטפסים"), end: true },
  { to: "/sales/discovery", label: t("בקשות איפיון") },
  { to: "/sales/deals", label: t("עסקאות") },
  { to: "/sales/billing", label: t("הוראות קבע") },
  { to: "/collections", label: t("גבייה") },
  { to: "/sales/settings", label: t("הגדרות") },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <PenLine className="h-4 w-4" />
            </span>
            <span className="font-heading text-2xl font-semibold tracking-tight">{isEn ? "Hotem" : "חותם"}</span>
          </Link>
          <div className="flex items-center gap-2">
            <LangSwitch />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => base44.auth.logout()}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4 ltr:-scale-x-100" />
              {t("יציאה")}
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6" aria-label={t("ניווט")}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
