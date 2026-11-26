import React from "react";
import { t } from "@/i18n";

// חותמת משפטית ויזואלית על גבי המסמך החתום — לפי חוק חתימה אלקטרונית, תשס"א-2001
// מקבלת את נתוני החותם והחתימה מתוך רשומת ה-Submission

const LEGAL_HEADER = t('מסמך זה נחתם בחתימה אלקטרונית מאובטחת בהתאם לחוק חתימה אלקטרונית, תשס"א-2001.');

function formatStampDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export default function LegalStamp({ submission }) {
  if (!submission) return null;

  const signerName = submission.signer_name || "—";
  const signerId = submission.signer_id_number || "—";
  const signedAt = formatStampDate(submission.signed_at);
  const ip = submission.signer_ip || "—";
  const guid = submission.guid || "—";

  const rowStyle = { display: "flex", gap: 6, fontSize: 10, lineHeight: 1.6, color: "#57534e" };
  const labelStyle = { fontWeight: 700, minWidth: 80, color: "#44403c" };

  return (
    <div
      dir="rtl"
      style={{
        marginTop: 28,
        padding: "14px 16px",
        border: "1.5px solid #1f6b54",
        borderRadius: 8,
        background: "#f0faf5",
        fontFamily: "var(--font-body), sans-serif",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#1f6b54", marginBottom: 8 }}>
        {LEGAL_HEADER}
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>{t("פרטי החותם:")}</span>
        <span>{signerName}{signerId !== "—" ? ` | ${t("ח.פ / ת.ז:")} ${signerId}` : ""}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>{t("תאריך ושעת חתימה:")}</span>
        <span>{signedAt}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>{t("כתובת IP:")}</span>
        <span style={{ direction: "ltr", unicodeBidi: "plaintext" }}>{ip}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>{t("מזהה מערכת ייחודי:")}</span>
        <span style={{ direction: "ltr", unicodeBidi: "plaintext", fontSize: 9 }}>{guid}</span>
      </div>
    </div>
  );
}