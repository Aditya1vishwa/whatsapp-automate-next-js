"use client";

import { useState, useEffect, useCallback } from "react";
import Select, { MultiValue } from "react-select";
import {
  Send, MessageSquare, Phone, Variable,
  CheckCircle, XCircle, Loader2, RefreshCw, Check, Users, ArrowRight,
} from "lucide-react";
import { extractVariables } from "@/lib/templateUtils";
import Link from "next/link";

/* ─── Types ───────────────────────────────────────────── */
interface PhoneOption {
  value: string;   // phone digits
  label: string;
  name: string;
}

interface UserRecord {
  _id: string;
  name: string;
  phone: string;
  email?: string;
}

interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
}

interface Template {
  id: string;
  name: string;
  language: string;
  category: string;
  components: TemplateComponent[];
}

interface SendResult {
  phone: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

/* ─── Step indicator ──────────────────────────────────── */
function Step({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
        style={{
          background: done ? "var(--success)" : active ? "var(--accent)" : "var(--bg-tertiary)",
          color: done || active ? "white" : "var(--text-muted)",
        }}
      >
        {done ? <Check size={13} /> : num}
      </div>
      <span
        className="text-sm font-medium hidden sm:block"
        style={{ color: done ? "var(--success)" : active ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        {label}
      </span>
    </div>
  );
}

function Divider({ done }: { done: boolean }) {
  return <div className="flex-1 h-px" style={{ background: done ? "var(--success)" : "var(--border)", maxWidth: "3rem" }} />;
}

/* ─── Main page ───────────────────────────────────────── */
export default function SendPage() {
  /* numbers from User collection */
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<MultiValue<PhoneOption>>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  /* templates */
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState("");

  /* variables */
  const [variables, setVariables] = useState<string[]>([]);
  const [variableCount, setVariableCount] = useState(0);

  /* send */
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; success: number; failed: number } | null>(null);

  /* fetch users (used as phone source) */
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data.filter((u: UserRecord) => !!u.phone) : []);
    setLoadingUsers(false);
  }, []);

  /* fetch WhatsApp templates */
  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    setTemplateError("");
    try {
      const res = await fetch("/api/whatsapp/templates");
      const data = await res.json();
      if (data.error) { setTemplateError(data.error); setTemplates([]); }
      else setTemplates(Array.isArray(data) ? data : []);
    } catch {
      setTemplateError("Failed to fetch templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); fetchTemplates(); }, [fetchUsers, fetchTemplates]);

  /* Build react-select options */
  const options: PhoneOption[] = users.map((u) => ({
    value: u.phone,
    label: `${u.name}  ·  +${u.phone}`,
    name: u.name,
  }));

  const selectAllOpt: PhoneOption = {
    value: "__all__",
    label: `✓  Select All  (${options.length})`,
    name: "",
  };

  const allOptions = options.length > 0 ? [selectAllOpt, ...options] : options;

  const handleNumberChange = (sel: MultiValue<PhoneOption>) => {
    if (sel.some((o) => o.value === "__all__")) {
      setSelectedPhones(selectedPhones.length === options.length ? [] : options);
    } else {
      setSelectedPhones(sel);
    }
  };

  /* template selection */
  const handleTemplateSelect = (t: Template) => {
    setSelectedTemplate(t);
    const body = t.components.find((c) => c.type === "BODY");
    const count = body?.text ? extractVariables(body.text) : 0;
    setVariableCount(count);
    setVariables(Array(count).fill(""));
    setResults(null);
    setSummary(null);
  };

  /* send */
  const handleSend = async () => {
    if (!selectedTemplate || selectedPhones.length === 0) return;
    setSending(true);
    setResults(null);
    setSummary(null);
    try {
      const phones = selectedPhones.map((p) => p.value);
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phones,
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language,
          variables: variables.filter((v) => v.trim() !== ""),
        }),
      });
      const data = await res.json();
      setResults(data.results);
      setSummary(data.summary);
    } catch {
      setResults([]);
    } finally {
      setSending(false);
    }
  };

  /* step guards */
  const step1Done = selectedPhones.length > 0;
  const step2Done = !!selectedTemplate;
  const step3Done = variableCount === 0 || variables.every((v) => v.trim() !== "");
  const canSend = step1Done && step2Done && step3Done;

  const bodyText = selectedTemplate?.components.find((c) => c.type === "BODY")?.text || "";

  const previewHtml = bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const val = variables[parseInt(n) - 1];
    return val
      ? `<span style="color:var(--accent);font-weight:600">${val}</span>`
      : `<span style="color:var(--warning);background:var(--warning-subtle);padding:1px 5px;border-radius:4px">{{${n}}}</span>`;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Send Message
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Send WhatsApp template messages to your users
        </p>
      </div>

      {/* Step tracker */}
      <div className="card px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Step num={1} label="Select Recipients" active={!step1Done} done={step1Done} />
          <Divider done={step1Done} />
          <Step num={2} label="Pick Template" active={step1Done && !step2Done} done={step2Done} />
          <Divider done={step2Done} />
          <Step num={3} label="Fill Variables" active={step1Done && step2Done && variableCount > 0 && !step3Done} done={step2Done && step3Done} />
          <Divider done={step2Done && step3Done} />
          <Step num={4} label="Send" active={canSend && !summary} done={!!summary} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── Left column ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Step 1 — Recipients */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
                  <Phone size={15} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    Step 1 — Select Recipients
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Choose users to receive the message
                  </p>
                </div>
              </div>
              <Link href="/users">
                <button className="btn-secondary" style={{ fontSize: "12px", padding: "5px 10px" }}>
                  <Users size={12} /> Manage Users
                </button>
              </Link>
            </div>

            {loadingUsers ? (
              <div className="flex items-center gap-2 text-sm py-2" style={{ color: "var(--text-muted)" }}>
                <Loader2 size={14} className="animate-spin" /> Loading users…
              </div>
            ) : users.length === 0 ? (
              <div
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl border text-sm"
                style={{ background: "var(--warning-subtle)", borderColor: "var(--warning)", color: "var(--warning)" }}
              >
                <span>⚠</span>
                <span>No users with phone numbers found. <Link href="/users" style={{ color: "var(--warning)", fontWeight: 600 }}>Add users →</Link></span>
              </div>
            ) : (
              <Select
                isMulti
                options={allOptions}
                value={selectedPhones}
                onChange={handleNumberChange}
                classNamePrefix="react-select"
                className="react-select-dark"
                placeholder={`Search from ${users.length} user${users.length !== 1 ? "s" : ""}…`}
                noOptionsMessage={() => "No users found"}
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
                isSearchable
                instanceId="phone-select"
              />
            )}

            {selectedPhones.length > 0 && (
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{selectedPhones.length}</span>{" "}
                recipient{selectedPhones.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>

          {/* Step 2 — Template */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
                  <MessageSquare size={15} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    Step 2 — Select Template
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Choose an approved WhatsApp template
                  </p>
                </div>
              </div>
              <button
                onClick={fetchTemplates}
                disabled={loadingTemplates}
                className="btn-secondary"
                style={{ fontSize: "12px", padding: "5px 10px" }}
              >
                <RefreshCw size={12} className={loadingTemplates ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            {templateError && (
              <div
                className="flex items-start gap-2 px-4 py-3 rounded-xl border text-sm mb-4"
                style={{ background: "var(--warning-subtle)", borderColor: "var(--warning)", color: "var(--warning)" }}
              >
                <span className="flex-shrink-0">⚠</span>
                <span>{templateError} — configure <code style={{ fontSize: "11px" }}>META_ACCESS_TOKEN</code> in <code style={{ fontSize: "11px" }}>.env.local</code></span>
              </div>
            )}

            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm py-2" style={{ color: "var(--text-muted)" }}>
                <Loader2 size={14} className="animate-spin" /> Fetching templates from Meta…
              </div>
            ) : templates.length === 0 && !templateError ? (
              <div className="py-8 text-center space-y-1">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  No approved templates
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Add your WhatsApp Cloud API credentials to load templates
                </p>
              </div>
            ) : (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto"
                style={{ maxHeight: "260px", paddingRight: "2px" }}
              >
                {templates.map((t) => {
                  const isSelected = selectedTemplate?.id === t.id;
                  const bodyComp = t.components.find((c) => c.type === "BODY");
                  const varCount = bodyComp?.text ? extractVariables(bodyComp.text) : 0;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleTemplateSelect(t)}
                      className="text-left p-4 rounded-xl border transition-all"
                      style={{
                        borderColor: isSelected ? "var(--accent)" : "var(--border)",
                        background: isSelected ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                        outline: isSelected ? "2px solid var(--accent)" : "none",
                        outlineOffset: "1px",
                      }}
                    >
                      <div className="flex items-start gap-2 mb-1.5">
                        <p className="text-sm font-semibold flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                          {t.name}
                        </p>
                        <span className="badge badge-accent flex-shrink-0">{t.category}</span>
                      </div>
                      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                        Lang: <span style={{ color: "var(--text-secondary)" }}>{t.language}</span>
                        {varCount > 0 && (
                          <> · <span style={{ color: "var(--accent)" }}>{varCount} variable{varCount > 1 ? "s" : ""}</span></>
                        )}
                      </p>
                      {bodyComp?.text && (
                        <p
                          className="text-xs leading-relaxed"
                          style={{
                            color: "var(--text-secondary)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {bodyComp.text}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3 — Variables (only if template has vars) */}
          {selectedTemplate && variableCount > 0 && (
            <div className="card p-5 animate-fade-in">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
                  <Variable size={15} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    Step 3 — Fill Variables
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Values replace <code style={{ color: "var(--accent)" }}>{"{{n}}"}</code> placeholders in the template
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: variableCount }).map((_, i) => (
                  <div key={i}>
                    <label className="label" htmlFor={`var-${i + 1}`}>
                      Variable{" "}
                      <code
                        className="text-xs px-1.5 py-0.5 rounded ml-1"
                        style={{ background: "var(--bg-tertiary)", color: "var(--accent)" }}
                      >
                        {`{{${i + 1}}}`}
                      </code>
                    </label>
                    <input
                      id={`var-${i + 1}`}
                      type="text"
                      value={variables[i] || ""}
                      onChange={(e) => {
                        const v = [...variables];
                        v[i] = e.target.value;
                        setVariables(v);
                      }}
                      className="input-field"
                      placeholder={`Value for {{${i + 1}}}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Send button */}
          <button
            id="send-message-btn"
            onClick={handleSend}
            disabled={!canSend || sending}
            className="btn-primary w-full justify-center"
            style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem", fontSize: "0.9375rem" }}
          >
            {sending ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                Sending to {selectedPhones.length} recipient{selectedPhones.length !== 1 ? "s" : ""}…
              </>
            ) : (
              <>
                <Send size={17} />
                Send Message{selectedPhones.length > 1 ? "s" : ""}
                {selectedPhones.length > 0 && (
                  <span
                    className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ background: "rgba(0,0,0,0.2)", color: "white" }}
                  >
                    {selectedPhones.length}
                  </span>
                )}
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {/* Template preview */}
          {selectedTemplate && (
            <div className="card p-5 animate-fade-in">
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                📱 Message Preview
              </h3>
              {/* Phone mockup */}
              <div className="rounded-xl p-4" style={{ background: "var(--bg-tertiary)" }}>
                <div
                  className="rounded-2xl rounded-tl-none overflow-hidden shadow max-w-xs"
                  style={{ background: "#dcf8c6" }}
                >
                  <div className="px-3.5 py-2.5 space-y-1">
                    {selectedTemplate.components.find((c) => c.type === "HEADER")?.text && (
                      <p className="font-bold text-sm" style={{ color: "#111" }}>
                        {selectedTemplate.components.find((c) => c.type === "HEADER")?.text}
                      </p>
                    )}
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "#111", wordBreak: "break-word" }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                    {selectedTemplate.components.find((c) => c.type === "FOOTER")?.text && (
                      <p className="text-xs pt-1" style={{ color: "#777" }}>
                        {selectedTemplate.components.find((c) => c.type === "FOOTER")?.text}
                      </p>
                    )}
                    <p className="text-right text-[10px]" style={{ color: "#999" }}>
                      {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} ✓✓
                    </p>
                  </div>
                </div>
              </div>

              {/* Meta info */}
              <div
                className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {[
                  ["Template", selectedTemplate.name],
                  ["Language", selectedTemplate.language],
                  ["Category", selectedTemplate.category],
                  ["Variables", variableCount.toString()],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span>{k}</span>
                    <span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {summary && (
            <div className="card p-5 animate-fade-in">
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                📊 Send Results
              </h3>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "Total", val: summary.total, bg: "var(--bg-tertiary)", color: "var(--text-primary)" },
                  { label: "Sent", val: summary.success, bg: "var(--success-subtle)", color: "var(--success)" },
                  { label: "Failed", val: summary.failed, bg: "var(--danger-subtle)", color: "var(--danger)" },
                ].map(({ label, val, bg, color }) => (
                  <div key={label} className="text-center py-2 rounded-xl" style={{ background: bg }}>
                    <p className="text-lg font-bold tabular-nums" style={{ color }}>{val}</p>
                    <p className="text-xs" style={{ color }}>{label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "220px" }}>
                {results?.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2.5 rounded-xl text-xs"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    {r.success
                      ? <CheckCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: "var(--success)" }} />
                      : <XCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        +{r.phone}
                      </p>
                      {r.success && r.messageId && (
                        <p className="truncate" style={{ color: "var(--text-muted)" }}>
                          ID: {r.messageId}
                        </p>
                      )}
                      {!r.success && r.error && (
                        <p style={{ color: "var(--danger)" }}>{r.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
