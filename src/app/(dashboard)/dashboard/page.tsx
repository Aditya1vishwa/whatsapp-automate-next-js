"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Building2,
  Phone,
  MessageCircle,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Clock,
  Send,
  ArrowUpRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface Stats {
  totalUsers: number;
  totalClients: number;
  totalNumbers: number;
}

interface Server {
  id: string;
  name: string;
  status: "connected" | "not_configured";
  description: string;
}

interface RecentUser {
  _id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}

interface RecentClient {
  _id: string;
  clientName: string;
  contactPerson: string;
  status: string;
  createdAt: string;
}

interface DashboardData {
  stats: Stats;
  servers: Server[];
  recentUsers: RecentUser[];
  recentClients: RecentClient[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  accentColor,
  href,
  subtitle,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accentColor: string;
  href: string;
  subtitle: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        className="card p-5 flex items-start gap-4 transition-all duration-200 cursor-pointer group"
        style={{ "--hover-shadow": "var(--shadow-elevated)" } as React.CSSProperties}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-elevated)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-card)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accentColor}18` }}
        >
          <Icon size={22} style={{ color: accentColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {label}
          </p>
          <p className="text-3xl font-bold mt-1 tabular-nums" style={{ color: "var(--text-primary)" }}>
            {value}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        </div>
        <ArrowUpRight
          size={15}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: accentColor }}
        />
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div
      className="card p-5 h-28 animate-pulse"
      style={{ background: "var(--bg-tertiary)" }}
    />
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-7 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Welcome back — here&apos;s your platform overview
          </p>
        </div>
        <Link href="/send">
          <button className="btn-primary">
            <Send size={15} />
            Send Message
          </button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              icon={Users}
              label="Total Users"
              value={data?.stats.totalUsers ?? 0}
              accentColor="#25d366"
              href="/users"
              subtitle="Registered contacts"
            />
            <StatCard
              icon={Building2}
              label="Clients"
              value={data?.stats.totalClients ?? 0}
              accentColor="#3b82f6"
              href="/clients"
              subtitle="Business clients"
            />
            <StatCard
              icon={Phone}
              label="Phone Numbers"
              value={data?.stats.totalNumbers ?? 0}
              accentColor="#8b5cf6"
              href="/send"
              subtitle="Ready for messaging"
            />
          </>
        )}
      </div>

      {/* Servers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Messaging Servers
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div
              className="card h-20 animate-pulse"
              style={{ background: "var(--bg-tertiary)" }}
            />
          ) : (
            data?.servers.map((server) => (
              <div key={server.id} className="card p-5 flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}
                >
                  <MessageCircle size={22} color="white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                      {server.name}
                    </p>
                    {server.status === "connected" ? (
                      <span className="badge badge-success">
                        <CheckCircle size={9} /> Live
                      </span>
                    ) : (
                      <span className="badge badge-warning">
                        <AlertCircle size={9} /> Setup Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                    {server.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="card overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={15} style={{ color: "var(--accent)" }} />
              <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                Recent Users
              </h3>
            </div>
            <Link
              href="/users"
              className="text-xs font-medium transition-colors"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0"
                    style={{ background: "var(--bg-tertiary)" }}
                  />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded" style={{ background: "var(--bg-tertiary)", width: "60%" }} />
                    <div className="h-2.5 rounded" style={{ background: "var(--bg-tertiary)", width: "40%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : data?.recentUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Users size={28} style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No users yet
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {data?.recentUsers.map((user) => (
                <div key={user._id} className="flex items-center gap-3 px-5 py-3.5">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                  >
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {user.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {user.phone ? `+${user.phone}` : user.email}
                    </p>
                  </div>
                  <div
                    className="flex-shrink-0 flex items-center gap-1 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Clock size={11} />
                    {formatDate(user.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Clients */}
        <div className="card overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <Building2 size={15} style={{ color: "#3b82f6" }} />
              <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                Recent Clients
              </h3>
            </div>
            <Link
              href="/clients"
              className="text-xs font-medium transition-colors"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0"
                    style={{ background: "var(--bg-tertiary)" }}
                  />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded" style={{ background: "var(--bg-tertiary)", width: "60%" }} />
                    <div className="h-2.5 rounded" style={{ background: "var(--bg-tertiary)", width: "40%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : data?.recentClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Building2 size={28} style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No clients yet
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {data?.recentClients.map((client) => (
                <div key={client._id} className="flex items-center gap-3 px-5 py-3.5">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}
                  >
                    {client.clientName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {client.clientName}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {client.contactPerson}
                    </p>
                  </div>
                  <span
                    className={`badge flex-shrink-0 ${
                      client.status === "active"
                        ? "badge-success"
                        : client.status === "inactive"
                        ? "badge-danger"
                        : "badge-warning"
                    }`}
                  >
                    {client.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
