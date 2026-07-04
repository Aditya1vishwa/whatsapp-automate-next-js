"use client";

import { useState, useEffect } from "react";
import {
  Plus, Pencil, Trash2, Search, Users,
  Phone, Mail, X, Loader2, Check, AlertCircle,
} from "lucide-react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { formatDate, formatPhone } from "@/lib/utils";

interface User {
  _id: string;
  name: string;
  email?: string;
  phone: string;
  notes?: string;
  createdAt: string;
}

interface UserForm {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

const EMPTY: UserForm = { name: "", email: "", phone: "", notes: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const openAdd = () => {
    setEditUser(null);
    setForm(EMPTY);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email || "", phone: u.phone, notes: u.notes || "" });
    setError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const url = editUser ? `/api/users/${editUser._id}` : "/api/users";
      const method = editUser ? "PUT" : "POST";
      const payload = {
        name: form.name,
        phone: form.phone,
        notes: form.notes,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setModalOpen(false);
      await fetchUsers();
      showToast(editUser ? "User updated!" : "User added!");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    setDeleteId(id);
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    await fetchUsers();
    setDeleteId(null);
    showToast("User deleted.");
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search)
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Users
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Contacts used as WhatsApp message recipients
          </p>
        </div>
        <button id="add-user-btn" onClick={openAdd} className="btn-primary">
          <Plus size={15} /> Add User
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm border animate-fade-in"
          style={{ background: "var(--success-subtle)", borderColor: "var(--success)", color: "var(--success)" }}
        >
          <Check size={14} /> {toast}
        </div>
      )}

      {/* Table card */}
      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
            <input
              id="user-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="input-field"
              style={{ paddingLeft: "2.1rem", height: "36px", width: "200px" }}
            />
          </div>
          <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <Users size={12} /> {filtered.length} user{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--bg-tertiary)" }}>
              <Users size={26} style={{ color: "var(--text-muted)" }} />
            </div>
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              {search ? "No users match" : "No users yet"}
            </p>
            {!search && (
              <button onClick={openAdd} className="btn-primary text-xs">
                <Plus size={13} /> Add your first user
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Notes</th>
                  <th>Added</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, idx) => (
                  <tr key={user._id}>
                    <td><span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{idx + 1}</span></td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                        >
                          {user.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{user.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Phone size={11} style={{ color: "var(--text-muted)" }} />
                        {formatPhone(user.phone)}
                      </div>
                    </td>
                    <td>
                      {user.email ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Mail size={11} style={{ color: "var(--text-muted)" }} />
                          {user.email}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td><span className="text-sm" style={{ color: "var(--text-muted)" }}>{user.notes || "—"}</span></td>
                    <td><span className="text-xs" style={{ color: "var(--text-muted)" }}>{formatDate(user.createdAt)}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(user)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                          title="Edit"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(user._id)}
                          disabled={deleteId === user._id}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}
                          title="Delete"
                        >
                          {deleteId === user._id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
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
            className="relative w-full max-w-md rounded-2xl border animate-fade-in"
            style={{ background: "var(--card)", borderColor: "var(--border)", boxShadow: "0 30px 60px rgba(0,0,0,0.35)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div>
                <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                  {editUser ? "Edit User" : "Add New User"}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Name &amp; phone required · email optional
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

            <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm border" style={{ background: "var(--danger-subtle)", borderColor: "var(--danger)", color: "var(--danger)" }}>
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <div>
                <label className="label" htmlFor="u-name">Full Name *</label>
                <input
                  id="u-name" type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field" placeholder="John Doe" required
                />
              </div>

              <div>
                <label className="label">Phone Number *</label>
                <div className="phone-input-dark">
                  <PhoneInput
                    country="in" value={form.phone}
                    onChange={(phone) => setForm({ ...form, phone })}
                    inputProps={{ id: "u-phone", required: true }}
                    containerStyle={{ width: "100%" }}
                    enableSearch searchPlaceholder="Search country…"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="u-email">
                  Email <span className="font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span>
                </label>
                <input
                  id="u-email" type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field" placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="label" htmlFor="u-notes">
                  Notes <span className="font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span>
                </label>
                <textarea
                  id="u-notes" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input-field" style={{ resize: "none" }}
                  rows={2} placeholder="Any additional notes…"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">
                  {submitting && <Loader2 size={13} className="animate-spin" />}
                  {submitting ? "Saving…" : editUser ? "Update" : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
