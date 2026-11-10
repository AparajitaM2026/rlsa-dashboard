import React from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ArrowLeft } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 relative">
      <div className="absolute top-4 start-4 z-10">
        <a
          href="http://localhost:3001/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors bg-card/80 backdrop-blur-md border border-border/80 px-3.5 py-2 rounded-full shadow-sm hover:border-primary/40"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-primary" />
          <span>Back to RLSA Records</span>
        </a>
      </div>
      <div className="absolute top-4 end-4 z-10">
        <LanguageSwitcher variant="light" placement="down" />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="http://localhost:3001/" className="inline-flex items-center gap-3.5 mb-5 group">
            <img
              src="/rlsa-logo.jpg"
              alt="RLSA Records Group Logo"
              className="w-14 h-14 object-contain rounded-2xl drop-shadow-xl border border-white/10 p-1 bg-black/40 group-hover:scale-105 transition-transform"
            />
            <div className="text-start">
              <span className="block font-display font-extrabold text-2xl tracking-tight leading-none bg-gradient-to-r from-amber-400 via-amber-200 to-yellow-500 bg-clip-text text-transparent">
                RLSA
              </span>
              <span className="block text-[0.72rem] font-bold tracking-[0.25em] text-amber-400/90 uppercase leading-none mt-1.5">
                RECORDS GROUP
              </span>
            </div>
          </a>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-display">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm mt-1.5">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-2xl border border-border/80 p-8 backdrop-blur-md">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
