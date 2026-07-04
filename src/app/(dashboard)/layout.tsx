import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-secondary)" }}>
      <Sidebar />
      <Header />
      {/*
        Desktop: offset left by sidebar width (256px), header is 64px tall
        Mobile:  no left offset (sidebar is an overlay), header still 64px
      */}
      <main
        style={{
          paddingTop: "64px",
          marginLeft: 0,
        }}
      >
        {/* on md+ we push content right of sidebar */}
        <div
          className="md:ml-64"
        >
          <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
