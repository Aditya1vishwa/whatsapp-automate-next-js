"use client";

import { useSession, signOut } from "next-auth/react";
import { Sun, Moon, ChevronDown, LogOut, User as UserIcon, Settings, Menu } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { triggerMobileSidebar } from "@/components/layout/Sidebar";
import { useState } from "react";

export function Header() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "A";

  return (
    <header
      className="fixed top-0 right-0 h-16 z-20 flex items-center justify-between px-4 sm:px-6 border-b"
      style={{
        left: 0,
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      {/* Left — hamburger (mobile) + logo offset (desktop) */}
      <div className="flex items-center gap-3">
        {/* Hamburger — visible only on mobile */}
        <button
          id="mobile-menu-btn"
          onClick={triggerMobileSidebar}
          className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center border"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-muted)",
            borderColor: "var(--border)",
          }}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        {/* Desktop spacer to clear sidebar */}
        <div className="hidden md:block" style={{ width: "256px" }} />

        {/* Page breadcrumb */}
        <div className="hidden sm:block">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest leading-none"
            style={{ color: "var(--text-muted)" }}
          >
            WhatsApp Dashboard
          </p>
        </div>
      </div>

      {/* Right — theme + user */}
      <div className="flex items-center gap-2">
        {/* Dark mode toggle */}
        <button
          id="theme-toggle"
          onClick={toggleTheme}
          className="w-9 h-9 rounded-xl flex items-center justify-center border transition-colors"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-muted)",
            borderColor: "var(--border)",
          }}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            id="user-menu-btn"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors"
            style={{
              background: "var(--bg-tertiary)",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #25d366, #128c7e)",
                color: "white",
              }}
            >
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p
                className="text-xs font-semibold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {session?.user?.name?.split(" ")[0] || "Admin"}
              </p>
              <p
                className="text-[10px] leading-tight"
                style={{ color: "var(--text-muted)" }}
              >
                @{session?.user?.username || "admin"}
              </p>
            </div>
            <ChevronDown
              size={13}
              className="flex-shrink-0"
              style={{
                color: "var(--text-muted)",
                transform: dropdownOpen ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.15s",
              }}
            />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div
                className="absolute right-0 top-full mt-2 w-56 rounded-2xl border z-50 overflow-hidden animate-fade-in"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow-elevated)",
                }}
              >
                {/* Profile header */}
                <div
                  className="px-4 py-3.5 border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{
                        background: "linear-gradient(135deg, #25d366, #128c7e)",
                        color: "white",
                      }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-semibold leading-tight"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {session?.user?.name || "Administrator"}
                      </p>
                      <p
                        className="text-xs truncate mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {session?.user?.email || `@${session?.user?.username || "admin"}`}
                      </p>
                    </div>
                  </div>
                  <span
                    className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
                    style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                  >
                    {session?.user?.role || "admin"}
                  </span>
                </div>

                {/* Items */}
                <div className="p-1.5">
                  <DropItem icon={<UserIcon size={14} />} label="Profile" onClick={() => setDropdownOpen(false)} />
                  <DropItem icon={<Settings size={14} />} label="Settings" onClick={() => setDropdownOpen(false)} />
                  <div className="my-1 mx-1 border-t" style={{ borderColor: "var(--border)" }} />
                  <button
                    id="logout-btn"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition-colors"
                    style={{ color: "var(--danger)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-subtle)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function DropItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition-colors"
      style={{ color: "var(--text-secondary)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-tertiary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {icon}
      {label}
    </button>
  );
}
