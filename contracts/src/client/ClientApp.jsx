import React from "react";
import DiscoveryPage from "./DiscoveryPage.jsx";
import DealPage from "./DealPage.jsx";
import CardPage from "./CardPage.jsx";
import { Shell, Notice } from "./ui.jsx";
import { t } from "@/i18n";

// /discovery/<token>, /deal/<token>, /card/<token> (vercel.json rewrites them to this page)
export default function ClientApp() {
  const [, kind, token] = window.location.pathname.split("/");
  if (kind === "discovery" && token) return <DiscoveryPage token={token} />;
  if (kind === "deal" && token) return <DealPage token={token} />;
  if (kind === "card" && token) return <CardPage token={token} />;
  return <Shell><Notice title={t("הקישור אינו פעיל")} text={t("בדקו שהקישור הועתק במלואו, או פנו אלינו לקבלת קישור חדש.")} /></Shell>;
}
