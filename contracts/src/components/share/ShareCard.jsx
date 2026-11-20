import React from "react";

export default function ShareCard({ icon: Icon, title, children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-border/70 bg-card p-6 ${className}`}>
      <div className="mb-4 flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
}