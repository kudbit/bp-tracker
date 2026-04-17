import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const TOKEN_KEY = "pulseglass_token";
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const AuthContext = createContext(null);

function getInitialReading() {
  const localDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);

  return {
    recordedAt: localDate.toISOString().slice(0, 16),
    systolic: "",
    diastolic: "",
    pulse: "",
    weight: "",
    medicationTaken: "true",
    mood: "Balanced",
    symptoms: "",
    notes: "",
  };
}

function classifyReading(systolic, diastolic) {
  if (!systolic || !diastolic) {
    return { label: "No reading", tone: "muted" };
  }

  if (systolic < 120 && diastolic < 80) {
    return { label: "Optimal", tone: "optimal" };
  }

  if (systolic < 130 && diastolic < 80) {
    return { label: "Elevated", tone: "elevated" };
  }

  if (systolic < 140 || diastolic < 90) {
    return { label: "Stage 1", tone: "watch" };
  }

  return { label: "Stage 2", tone: "alert" };
}

function formatDate(dateValue, options = { dateStyle: "medium", timeStyle: "short" }) {
  if (!dateValue) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", options).format(new Date(dateValue));
}

function toNumberOrUndefined(value) {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function buildInsights(summary) {
  if (!summary?.totals?.readings) {
    return [
      "Add your first reading to unlock trend analysis, adherence stats, and daily averages.",
      "You can track blood pressure, pulse, medication intake, weight, mood, and symptoms in one place.",
    ];
  }

  const insights = [];
  const { latestEntry, totals } = summary;
  const latestCategory = classifyReading(latestEntry?.systolic, latestEntry?.diastolic);

  if (latestCategory.label === "Stage 2") {
    insights.push(
      "Your latest reading is in Stage 2. If this keeps repeating, it is worth checking in with a clinician.",
    );
  } else if (latestCategory.label === "Stage 1") {
    insights.push("Your latest reading is slightly elevated. Keep logging for a clearer trend line.");
  } else {
    insights.push("Your latest reading sits in a steadier range. Consistency is helping the story stay clear.");
  }

  if (totals.medicationAdherence < 80) {
    insights.push(
      `Medication adherence is ${totals.medicationAdherence}%. A reminder flow would be a strong next upgrade.`,
    );
  } else {
    insights.push(
      `Medication adherence is ${totals.medicationAdherence}%, which is a strong foundation for trend tracking.`,
    );
  }

  insights.push(
    totals.recentCheckIns >= 3
      ? `You logged ${totals.recentCheckIns} check-ins in the last 7 days, which gives your chart better signal.`
      : "Logging a few more readings this week will make your chart and averages much more useful.",
  );

  return insights;
}

function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        setIsBooting(false);
        return;
      }

      try {
        const { data } = await api.get("/auth/me");
        setUser(data.user);
      } catch (error) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setIsBooting(false);
      }
    }

    restoreSession();
  }, [token]);

  async function authenticate(endpoint, payload) {
    const { data } = await api.post(endpoint, payload);
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isBooting,
        login: (payload) => authenticate("/auth/login", payload),
        register: (payload) => authenticate("/auth/register", payload),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}

function ProtectedRoute({ children }) {
  const { user, isBooting } = useAuth();

  if (isBooting) {
    return (
      <div className="app-stage">
        <div className="floating-orb floating-orb--left" />
        <div className="floating-orb floating-orb--right" />
        <div className="glass-panel loading-panel">Warming up your dashboard...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AuthPage({ mode }) {
  const navigate = useNavigate();
  const { login, register, user } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        await register(form);
      } else {
        await login({ email: form.email, password: form.password });
      }

      navigate("/", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-stage">
      <div className="floating-orb floating-orb--left" />
      <div className="floating-orb floating-orb--right" />

      <div className="auth-layout">
        <section className="glass-panel auth-showcase">
          <span className="eyebrow">PulseGlass</span>
          <h1>Track blood pressure with a softer, calmer daily ritual.</h1>
          <p className="auth-copy">
            Built from your original tracker concept, now reimagined as a multi-user MERN
            application with secure accounts, trend visuals, adherence insights, and a liquid-glass
            interface.
          </p>

          <div className="showcase-features">
            <div className="feature-item">
              <div className="feature-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                  <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                </svg>
              </div>
              <div className="feature-text">
                <strong>Anxiety-free logging</strong>
                <p>Designed to be a calming daily habit, not a clinical chore.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <div className="feature-text">
                <strong>Clear, gentle trends</strong>
                <p>We smooth out the daily noise to show you the bigger picture.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="feature-text">
                <strong>Private & secure</strong>
                <p>Your health data is encrypted and kept entirely personal.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel auth-card">
          <div className="auth-card__header">
            <span className="eyebrow">{mode === "register" ? "Create account" : "Welcome back"}</span>
            <h2>{mode === "register" ? "Start your health space" : "Sign in to your dashboard"}</h2>
            <p>
              {mode === "register"
                ? "Create a private profile for your readings, medication check-ins, and notes."
                : "Pick up where you left off and keep your trend history tidy."}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <label className="field">
                <span>Name</span>
                <input
                  required
                  placeholder="Aarav Singh"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
            ) : null}

            <label className="field">
              <span>Email</span>
              <input
                required
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                required
                minLength={6}
                type="password"
                placeholder="Minimum 6 characters"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>

            <div className="toast-container">
              {error ? <p className="form-error">{error}</p> : null}
            </div>

            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "Please wait..."
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "register" ? "Already have an account?" : "Need a new account?"}{" "}
            <Link to={mode === "register" ? "/login" : "/register"}>
              {mode === "register" ? "Sign in" : "Register"}
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(getInitialReading);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (error || feedback) {
      const timer = setTimeout(() => {
        setError("");
        setFeedback("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, feedback]);

  async function loadDashboard() {
    setIsLoading(true);
    setError("");

    try {
      const [summaryResponse, entriesResponse] = await Promise.all([
        api.get("/entries/summary"),
        api.get("/entries?limit=16"),
      ]);

      setSummary(summaryResponse.data);
      setEntries(entriesResponse.data.entries);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load your dashboard.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleCreateEntry(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setFeedback("");

    try {
      await api.post("/entries", {
        recordedAt: new Date(form.recordedAt).toISOString(),
        systolic: Number(form.systolic),
        diastolic: Number(form.diastolic),
        pulse: toNumberOrUndefined(form.pulse),
        weight: toNumberOrUndefined(form.weight),
        medicationTaken: form.medicationTaken === "true",
        mood: form.mood,
        symptoms: form.symptoms
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        notes: form.notes.trim(),
      });

      setForm(getInitialReading());
      setFeedback("Reading added to your timeline.");
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not save your reading.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteEntry(entryId) {
    try {
      await api.delete(`/entries/${entryId}`);
      setFeedback("Reading removed.");
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not remove that reading.");
    }
  }

  async function handleExportPDF() {
    setIsExporting(true);
    setError("");

    try {
      const response = await api.get("/entries/all");
      const { entries } = response.data;

      const doc = new jsPDF();

      doc.setFontSize(20);
      doc.text("PulseGlass Summary", 14, 22);

      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30);

      const dailyAverages = entries.reduce((acc, entry) => {
        const dateKey = new Date(entry.recordedAt).toLocaleDateString();
        if (!acc[dateKey]) {
          acc[dateKey] = { sysSum: 0, diaSum: 0, count: 0 };
        }
        acc[dateKey].sysSum += entry.systolic;
        acc[dateKey].diaSum += entry.diastolic;
        acc[dateKey].count += 1;
        return acc;
      }, {});

      const tableData = entries.map((entry) => {
        const dateKey = new Date(entry.recordedAt).toLocaleDateString();
        const dailyAvg = dailyAverages[dateKey];
        const avgDisplay = `${Math.round(dailyAvg.sysSum / dailyAvg.count)}/${Math.round(
          dailyAvg.diaSum / dailyAvg.count
        )}`;

        return [
          formatDate(entry.recordedAt, { dateStyle: "short", timeStyle: "short" }),
          `${entry.systolic}/${entry.diastolic}`,
          entry.pulse || "--",
          entry.medicationTaken ? "Taken" : "Missed",
          avgDisplay,
        ];
      });

      const tableHeaders = ["Date", "BP (mmHg)", "Pulse", "Meds", "Daily Avg (mmHg)"];

      autoTable(doc, {
        startY: 38,
        head: [tableHeaders],
        body: tableData,
        headStyles: { fillColor: [181, 130, 140] },
        alternateRowStyles: { fillColor: [250, 246, 246] },
        margin: { top: 38 },
      });

      doc.save("blood-pressure-export.pdf");
      setFeedback("PDF exported successfully.");
    } catch (requestError) {
      console.error(requestError);
      setError(`Export Error: ${requestError.message || requestError}`);
    } finally {
      setIsExporting(false);
    }
  }

  const latestCategory = classifyReading(
    summary?.latestEntry?.systolic,
    summary?.latestEntry?.diastolic,
  );
  const insights = buildInsights(summary);

  return (
    <div className="app-stage app-stage--dashboard">
      <div className="floating-orb floating-orb--left" />
      <div className="floating-orb floating-orb--right" />

      <main className="dashboard-shell">
        <div className="mobile-floating-nav">
          <div className="profile-badge">
            <span>{user?.name?.slice(0, 1) || "U"}</span>
          </div>
          <button className="ghost-button" onClick={logout} type="button">
            Log out
          </button>
        </div>

        <header className="glass-panel topbar">
          <div>
            <span className="eyebrow">Personal dashboard</span>
            <h1>Hi {user?.name?.split(" ")[0]}, hope you are doing great.</h1>
          </div>

          <div className="topbar-actions desktop-only">
            <div className="profile-badge">
              <span>{user?.name?.slice(0, 1) || "U"}</span>
            </div>
            <button className="ghost-button" onClick={logout} type="button">
              Log out
            </button>
          </div>
        </header>

        <section className="glass-panel hero-panel">
          <div className="hero-copy">
            <span className={`status-pill status-pill--${latestCategory.tone}`}>
              {summary?.latestEntry ? latestCategory.label : "Waiting for first reading"}
            </span>
            <h2>
              {summary?.latestEntry
                ? `${summary.latestEntry.systolic}/${summary.latestEntry.diastolic} mmHg`
                : "Start logging to unlock your trend line"}
            </h2>
            <p>
              {summary?.latestEntry
                ? `Last check-in on ${formatDate(summary.latestEntry.recordedAt)}`
                : "Your dashboard will begin surfacing averages, adherence, and gentle insights as soon as readings arrive."}
            </p>
          </div>

          <div className="hero-side">
            <div className="spotlight-card">
              <span className="mini-label">Average blood pressure</span>
              <strong>
                {summary?.totals?.avgSystolic && summary?.totals?.avgDiastolic
                  ? `${summary.totals.avgSystolic}/${summary.totals.avgDiastolic}`
                  : "--"}
              </strong>
              <small>Across all recorded entries</small>
            </div>

            <div className="spotlight-card">
              <span className="mini-label">Recent cadence</span>
              <strong>{summary?.totals?.recentCheckIns ?? 0}</strong>
              <small>Check-ins over the last 7 days</small>
            </div>
          </div>
        </section>

        <section className="stats-grid">
          <article className="glass-panel stat-card">
            <span className="mini-label">Readings logged</span>
            <strong>{summary?.totals?.readings ?? 0}</strong>
            <small>Total timeline entries</small>
          </article>

          <article className="glass-panel stat-card">
            <span className="mini-label">Avg pulse</span>
            <strong>{summary?.totals?.avgPulse ?? "--"}</strong>
            <small>Beats per minute</small>
          </article>

          <article className="glass-panel stat-card">
            <span className="mini-label">Adherence</span>
            <strong>{summary?.totals?.medicationAdherence ?? 100}%</strong>
            <small>Medication taken as logged</small>
          </article>

        </section>

        <div className="toast-container">
          {error ? <div className="glass-panel banner banner--error">{error}</div> : null}
          {feedback ? <div className="glass-panel banner banner--success">{feedback}</div> : null}
        </div>

        <section className="content-grid">
          <article className="glass-panel form-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Quick entry</span>
                <h3>Log a new reading</h3>
              </div>
            </div>

            <form className="reading-form" onSubmit={handleCreateEntry}>
              <label className="field">
                <span>Date & time</span>
                <input
                  required
                  type="datetime-local"
                  value={form.recordedAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, recordedAt: event.target.value }))
                  }
                />
              </label>

              <div className="field-row">
                <label className="field">
                  <span>Systolic</span>
                  <input
                    required
                    min="60"
                    max="250"
                    type="number"
                    placeholder="126"
                    value={form.systolic}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, systolic: event.target.value }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Diastolic</span>
                  <input
                    required
                    min="40"
                    max="180"
                    type="number"
                    placeholder="82"
                    value={form.diastolic}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, diastolic: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>Pulse</span>
                  <input
                    min="30"
                    max="220"
                    type="number"
                    placeholder="68"
                    value={form.pulse}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, pulse: event.target.value }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Medication</span>
                  <select
                    value={form.medicationTaken}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        medicationTaken: event.target.value,
                      }))
                    }
                  >
                    <option value="true">Taken</option>
                    <option value="false">Missed</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Symptoms</span>
                <input
                  placeholder="Headache, dizziness, fatigue"
                  value={form.symptoms}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, symptoms: event.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span>Notes</span>
                <textarea
                  placeholder="Optional context like sleep, workout, stress, or hydration."
                  rows="4"
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>

              <button
                className={`primary-button ${
                  form.recordedAt && form.systolic && form.diastolic ? "primary-button--dark" : ""
                }`}
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Saving..." : "Add reading"}
              </button>
            </form>
          </article>

          <article className="glass-panel chart-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Trend view</span>
                <h3>Blood pressure over time</h3>
              </div>
            </div>

            <div className="chart-wrap">
              {summary?.trends?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.trends}>
                    <defs>
                      <linearGradient id="sysGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#FFB4A2" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#FFB4A2" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="diaGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#B5828C" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#B5828C" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(94, 78, 82, 0.12)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} domain={["dataMin - 10", "dataMax + 10"]} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 18,
                        border: "1px solid rgba(255,255,255,0.55)",
                        background: "rgba(255,255,255,0.92)",
                        boxShadow: "0 20px 40px rgba(80, 52, 62, 0.16)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="avgSystolic"
                      stroke="#FF9B86"
                      strokeWidth={3}
                      fill="url(#sysGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="avgDiastolic"
                      stroke="#8B6471"
                      strokeWidth={3}
                      fill="url(#diaGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">
                  <strong>No trend line yet.</strong>
                  <p>Your chart will appear after your first saved reading.</p>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="content-grid content-grid--secondary">
          <article className="glass-panel insights-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Health insights</span>
                <h3>What your data is saying</h3>
              </div>
            </div>

            <div className="insight-list">
              {insights.map((item) => (
                <div className="insight-item" key={item}>
                  <span className="insight-dot" />
                  <p>{item}</p>
                </div>
              ))}
            </div>

            <div className="breakdown-grid">
              {Object.entries(summary?.breakdown || {}).map(([label, value]) => (
                <div className="breakdown-tile" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-panel history-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">History</span>
                <h3>Recent readings</h3>
              </div>
            </div>

            {isLoading ? (
              <div className="empty-state">
                <strong>Loading your readings...</strong>
              </div>
            ) : entries.length ? (
              <div className="history-list">
                {entries.map((entry) => {
                  const category = classifyReading(entry.systolic, entry.diastolic);

                  return (
                    <article className="history-item" key={entry._id}>
                      <div className="history-main">
                        <div className="history-topline">
                          <strong>{entry.systolic}/{entry.diastolic} mmHg</strong>
                          <span className={`status-pill status-pill--${category.tone}`}>
                            {category.label}
                          </span>
                        </div>

                        <p className="history-meta">{formatDate(entry.recordedAt)}</p>

                        <div className="history-chips">
                          <span className="chip">Pulse {entry.pulse ?? "--"}</span>
                          <span className="chip">
                            Medication {entry.medicationTaken ? "taken" : "missed"}
                          </span>
                        </div>

                        {entry.symptoms?.length ? (
                          <p className="history-notes">Symptoms: {entry.symptoms.join(", ")}</p>
                        ) : null}

                        {entry.notes ? <p className="history-notes">{entry.notes}</p> : null}
                      </div>

                      <button
                        className="ghost-button ghost-button--danger"
                        onClick={() => handleDeleteEntry(entry._id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No readings yet.</strong>
                <p>Add one from the quick-entry card to start building your history.</p>
              </div>
            )}
          </article>
        </section>

        <button
          className="export-fab"
          onClick={handleExportPDF}
          disabled={isExporting}
          title="Export all readings to PDF"
        >
          {isExporting ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.4" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
          )}
        </button>
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
