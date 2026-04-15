"use client";

import { useState, useEffect } from "react";
import {
  Plus, Pencil, Trash2, Search, Building2,
  Phone, Mail, X, Loader2, Check, AlertCircle,
} from "lucide-react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { formatDate, formatPhone } from "@/lib/utils";

interface Client {
  _id: string;
  clientName: string;
  contactPerson: string;
  email: string;
  phone: string;
  details?: string;
  status: "active" | "inactive" | "pending";
  createdAt: string;
}

interface ClientForm {
  clientName: string;
  contactPerson: string;
  email: string;
  phone: string;
  details: string;
  status: "active" | "inactive" | "pending";
}

const EMPTY: ClientForm = {
  clientName: "", contactPerson: "", email: "", phone: "", details: "", status: "active",
};

const STATUS_OPTIONS = ["active", "inactive", "pending"] as const;

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const fetchClients = async () => {
    setLoading(true);
    const res = await fetch("/api/clients");
    const data = await res.json();
    setClients(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const openAdd = () => {
    setEditClient(null);
    setForm(EMPTY);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditClient(c);
    setForm({
      clientName: c.clientName,
      contactPerson: c.contactPerson,
      email: c.email,
      phone: c.phone,
      details: c.details || "",
      status: c.status,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const url = editClient ? `/api/clients/${editClient._id}` : "/api/clients";
      const method = editClient ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setModalOpen(false);
      await fetchClients();
      showToast(editClient ? "Client updated!" : "Client added!");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this client?")) return;
    setDeleteId(id);
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    await fetchClients();
    setDeleteId(null);
    showToast("Client deleted.");
  };

  const filtered = clients.filter(
    (c) =>
      c.clientName.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const statusClass = (s: string) =>
    s === "active" ? "badge-success" : s === "inactive" ? "badge-danger" : "badge-warning";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Clients
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Manage your business clients and their details
          </p>
        </div>
        <button id="add-client-btn" onClick={openAdd} className="btn-primary">
          <Plus size={16} /> Add Client
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border animate-fade-in"
          style={{
            background: "var(--success-subtle)",
            borderColor: "var(--success)",
            color: "var(--success)",
          }}
        >
          <Check size={15} /> {toast}
        </div>
      )}

      {/* Table card */}
      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              id="client-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="input-field"
              style={{ paddingLeft: "2.25rem", height: "38px", width: "240px" }}
            />
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <Building2 size={13} />
            <span>{filtered.length} client{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={26} className="animate-spin" style={{ color: "var(--accent)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <Building2 size={28} style={{ color: "var(--text-muted)" }} />
            </div>
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              {search ? "No clients match your search" : "No clients yet"}
            </p>
            {!search && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Click &ldquo;Add Client&rdquo; to get started
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Client Name</th>
                  <th>Contact Person</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client, idx) => (
                  <tr key={client._id}>
                    <td>
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {idx + 1}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}
                        >
                          {client.clientName.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{client.clientName}</span>
                      </div>
                    </td>
                    <td className="text-sm">{client.contactPerson}</td>
                    <td>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Mail size={12} style={{ color: "var(--text-muted)" }} />
                        {client.email}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Phone size={12} style={{ color: "var(--text-muted)" }} />
                        {formatPhone(client.phone)}
                      </div>
                    </td>
                    <td
                      className="text-sm max-w-[180px] truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {client.details || "—"}
                    </td>
                    <td>
                      <span className={`badge ${statusClass(client.status)}`}>
                        {client.status}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatDate(client.createdAt)}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(client)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(client._id)}
                          disabled={deleteId === client._id}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}
                          title="Delete"
                        >
                          {deleteId === client._id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setModalOpen(false)}
          />
          <div
            className="relative w-full max-w-lg rounded-2xl border animate-fade-in overflow-hidden"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              boxShadow: "0 30px 60px rgba(0,0,0,0.35)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-6 py-5 border-b flex-shrink-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                  {editClient ? "Edit Client" : "Add New Client"}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Fill in client information below
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
              >
                <X size={15} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="px-6 py-5 space-y-4 overflow-y-auto"
              style={{ flex: 1 }}
            >
              {error && (
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm border"
                  style={{
                    background: "var(--danger-subtle)",
                    borderColor: "var(--danger)",
                    color: "var(--danger)",
                  }}
                >
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="c-name">Client Name *</label>
                  <input
                    id="c-name"
                    type="text"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    className="input-field"
                    placeholder="Acme Corp"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="c-contact">Contact Person *</label>
                  <input
                    id="c-contact"
                    type="text"
                    value={form.contactPerson}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                    className="input-field"
                    placeholder="Jane Smith"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="c-email">Email *</label>
                <input
                  id="c-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field"
                  placeholder="contact@acme.com"
                  required
                />
              </div>

              <div>
                <label className="label">Phone Number *</label>
                <div className="phone-input-dark">
                  <PhoneInput
                    country="in"
                    value={form.phone}
                    onChange={(phone) => setForm({ ...form, phone })}
                    inputProps={{ id: "c-phone", required: true }}
                    containerStyle={{ width: "100%" }}
                    enableSearch
                    searchPlaceholder="Search country…"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="c-status">Status</label>
                  <select
                    id="c-status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ClientForm["status"] })}
                    className="input-field"
                    style={{ appearance: "none", cursor: "pointer" }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s} style={{ background: "var(--card)", color: "var(--text-primary)" }}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="c-details">Details</label>
                  <input
                    id="c-details-short"
                    type="text"
                    value={form.details}
                    onChange={(e) => setForm({ ...form, details: e.target.value })}
                    className="input-field"
                    placeholder="Brief description…"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1 justify-center"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {submitting ? "Saving…" : editClient ? "Update Client" : "Add Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
