"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  LayoutDashboard,
  Users,
  Building2,
  Send,
  MessageCircle,
  X,
  Menu,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users",     label: "Users",      icon: Users },
  { href: "/clients",   label: "Clients",    icon: Building2 },
  { href: "/send",      label: "Send Message", icon: Send },
];

/* ─── shared inner content ─────────────────────────── */
function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className="flex items-center justify-between px-5 py-5 border-b flex-shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}
          >
            <MessageSquare size={20} color="white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight" style={{ color: "rgba(255,255,255,0.95)" }}>
              WA Dashboard
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Admin Panel
            </p>
          </div>
        </div>
        {/* Close btn — only on mobile overlay */}
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 md:hidden"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p
          className="text-xs font-semibold uppercase tracking-widest px-2 mb-3"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          Menu
        </p>
        <div className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative"
                style={{
                  background: active ? "rgba(37,211,102,0.15)" : "transparent",
                  color: active ? "#25d366" : "rgba(255,255,255,0.48)",
                  textDecoration: "none",
                }}
              >
                {active && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                    style={{ background: "#25d366" }}
                  />
                )}
                <Icon size={17} className="flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && (
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#25d366" }} />
                )}
              </Link>
            );
          })}
        </div>

        {/* Servers */}
        <div className="mt-6 pt-5 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <p
            className="text-xs font-semibold uppercase tracking-widest px-2 mb-3"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            Servers
          </p>
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "rgba(37,211,102,0.1)", color: "#25d366" }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: "#25d366", boxShadow: "0 0 6px #25d366" }}
            />
            <MessageCircle size={16} className="flex-shrink-0" />
            <span className="flex-1">WhatsApp</span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(37,211,102,0.2)", color: "#25d366" }}
            >
              Active
            </span>
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div
        className="px-5 py-4 border-t flex-shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          © 2025 WA Dashboard v1.0
        </p>
      </div>
    </div>
  );
}

/* ─── Desktop fixed sidebar ────────────────────────────── */
function DesktopSidebar() {
  return (
    <aside
      className="hidden md:flex fixed left-0 top-0 h-screen w-64 z-30 flex-col border-r"
      style={{
        background: "var(--sidebar)",
        borderColor: "rgba(255,255,255,0.05)",
      }}
    >
      <SidebarContent />
    </aside>
  );
}

/* ─── Mobile overlay sidebar ───────────────────────────── */
function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // trap scroll on body when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="absolute left-0 top-0 h-full w-72 flex flex-col border-r"
        style={{
          background: "var(--sidebar)",
          borderColor: "rgba(255,255,255,0.05)",
          animation: "slideIn 0.22s ease-out",
        }}
      >
        <SidebarContent onClose={onClose} />
      </aside>
    </div>
  );
}

/* ─── Exported hook + components ───────────────────────── */
export function useSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return { mobileOpen, openMobile: () => setMobileOpen(true), closeMobile: () => setMobileOpen(false) };
}

// We need a context to share state between Sidebar and Header's hamburger button.
// Simplest: export a global event-based toggle.
let _toggleMobileSidebar: (() => void) | null = null;
export function triggerMobileSidebar() { _toggleMobileSidebar?.(); }

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const ref = useRef({ toggle: () => setMobileOpen((v) => !v) });
  useEffect(() => {
    _toggleMobileSidebar = ref.current.toggle;
    return () => { _toggleMobileSidebar = null; };
  }, []);

  return (
    <>
      <DesktopSidebar />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
