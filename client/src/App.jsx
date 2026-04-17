import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
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
    <div className="app-stage app-stage--auth">
      <div className="floating-orb floating-orb--left" />
      <div className="floating-orb floating-orb--right" />

      <div className="auth-layout">
        <section className="glass-panel auth-showcase">
          <span className="eyebrow">PulseGlass</span>
          <h1>Track blood pressure with a softer, calmer daily ritual.</h1>

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

            <button
              className={`primary-button ${
                (mode === "register" ? form.name && form.email && form.password.length >= 6 : form.email && form.password.length >= 6)
                  ? "primary-button--ready"
                  : ""
              }`}
              disabled={isSubmitting}
              type="submit"
            >
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

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 14;
      const brandRose   = [181, 130, 140];   // #B5828C
      const brandPeach  = [255, 180, 162];   // #FFB4A2
      const brandDeep   = [96, 48, 60];      // deep rose text
      const brandLight  = [254, 248, 248];   // near-white tint
      const grayText    = [110, 90, 95];

      // ── Helper: add footer to every page ────────────────────────────────
      function addFooter(pageNum, totalPages) {
        doc.setFontSize(8);
        doc.setTextColor(...grayText);
        doc.text(
          `PulseGlass Health Report  •  Page ${pageNum} of ${totalPages}  •  Confidential`,
          pageW / 2, pageH - 8, { align: "center" }
        );
        // thin footer rule
        doc.setDrawColor(...brandPeach);
        doc.setLineWidth(0.4);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
      }

      // ── 1. Header band ───────────────────────────────────────────────────
      doc.setFillColor(...brandRose);
      doc.rect(0, 0, pageW, 36, "F");

      // Accent stripe at top
      doc.setFillColor(...brandPeach);
      doc.rect(0, 0, pageW, 4, "F");

      // Logo mark — heartbeat waveform icon drawn with lines
      const lx = margin;
      const ly = 18;
      doc.setDrawColor(255, 247, 243);
      doc.setLineWidth(2);
      // simplified ECG waveform
      const wave = [
        [lx, ly], [lx + 5, ly], [lx + 8, ly - 6], [lx + 11, ly + 8],
        [lx + 14, ly - 4], [lx + 17, ly], [lx + 22, ly],
      ];
      for (let i = 0; i < wave.length - 1; i++) {
        doc.line(wave[i][0], wave[i][1], wave[i + 1][0], wave[i + 1][1]);
      }

      // App name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(255, 247, 243);
      doc.text("PulseGlass", lx + 27, ly + 2);

      // Tagline
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(255, 220, 210);
      doc.text("Personal Blood Pressure Health Report", lx + 27, ly + 8);

      // Generated date — top right
      const now = new Date();
      doc.setFontSize(8);
      doc.setTextColor(255, 240, 235);
      doc.text(
        `Generated: ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
        pageW - margin, ly + 2, { align: "right" }
      );

      // ── 2. Patient info row ──────────────────────────────────────────────
      let cursorY = 48;
      doc.setFillColor(...brandLight);
      doc.roundedRect(margin, cursorY, pageW - margin * 2, 18, 3, 3, "F");
      doc.setDrawColor(...brandRose);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, cursorY, pageW - margin * 2, 18, 3, 3, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...brandDeep);
      doc.text("Patient", margin + 4, cursorY + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...grayText);
      doc.text(user?.name || "—", margin + 4, cursorY + 13);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...brandDeep);
      doc.text("Total Entries", pageW / 2 - 20, cursorY + 7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grayText);
      doc.text(String(entries.length), pageW / 2 - 20, cursorY + 13);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...brandDeep);
      doc.text("Report Range", pageW - margin - 55, cursorY + 7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grayText);
      if (entries.length) {
        const oldest = formatDate(entries[entries.length - 1].recordedAt, { dateStyle: "short" });
        const newest = formatDate(entries[0].recordedAt, { dateStyle: "short" });
        doc.text(`${oldest} – ${newest}`, pageW - margin - 55, cursorY + 13);
      } else {
        doc.text("No entries", pageW - margin - 55, cursorY + 13);
      }

      cursorY += 26;

      // ── 3. Summary stats boxes ───────────────────────────────────────────
      if (summary?.totals) {
        const t = summary.totals;
        const boxes = [
          { label: "Avg Blood Pressure", value: t.avgSystolic && t.avgDiastolic ? `${t.avgSystolic}/${t.avgDiastolic}` : "—", unit: "mmHg" },
          { label: "Avg Pulse",          value: t.avgPulse ?? "—",             unit: "bpm" },
          { label: "Medication Adherence", value: t.medicationAdherence != null ? `${t.medicationAdherence}%` : "—", unit: "" },
          { label: "Check-ins (7 Days)", value: t.recentCheckIns ?? 0,         unit: "readings" },
        ];

        const bw = (pageW - margin * 2 - 9) / 4;
        boxes.forEach((box, i) => {
          const bx = margin + i * (bw + 3);
          doc.setFillColor(255, 245, 243);
          doc.roundedRect(bx, cursorY, bw, 22, 3, 3, "F");
          doc.setDrawColor(...brandPeach);
          doc.setLineWidth(0.3);
          doc.roundedRect(bx, cursorY, bw, 22, 3, 3, "S");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.setTextColor(...brandDeep);
          doc.text(String(box.value), bx + bw / 2, cursorY + 10, { align: "center" });

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...grayText);
          doc.text(box.label, bx + bw / 2, cursorY + 16, { align: "center" });
        });

        cursorY += 30;
      }

      // ── 4. Readings table ────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...brandDeep);
      doc.text("Reading History", margin, cursorY);
      cursorY += 4;

      const dailyAverages = entries.reduce((acc, entry) => {
        const dateKey = new Date(entry.recordedAt).toLocaleDateString();
        if (!acc[dateKey]) acc[dateKey] = { sysSum: 0, diaSum: 0, count: 0 };
        acc[dateKey].sysSum += entry.systolic;
        acc[dateKey].diaSum += entry.diastolic;
        acc[dateKey].count += 1;
        return acc;
      }, {});

      const tableData = entries.map((entry) => {
        const dateKey = new Date(entry.recordedAt).toLocaleDateString();
        const da = dailyAverages[dateKey];
        const avgDisplay = `${Math.round(da.sysSum / da.count)}/${Math.round(da.diaSum / da.count)}`;
        const cat = classifyReading(entry.systolic, entry.diastolic);
        return [
          formatDate(entry.recordedAt, { dateStyle: "short", timeStyle: "short" }),
          `${entry.systolic}/${entry.diastolic}`,
          entry.pulse || "—",
          entry.medicationTaken ? "Taken" : "Missed",
          avgDisplay,
          cat.label,
        ];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [["Date & Time", "BP (mmHg)", "Pulse", "Medication", "Daily Avg", "Classification"]],
        body: tableData,
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
          textColor: [60, 40, 50],
          lineColor: [230, 210, 215],
          lineWidth: 0.25,
        },
        headStyles: {
          fillColor: brandDeep,
          textColor: [255, 247, 243],
          fontStyle: "bold",
          fontSize: 9,
          halign: "center",
        },
        alternateRowStyles: { fillColor: [255, 249, 248] },
        columnStyles: {
          0: { cellWidth: 36 },
          1: { halign: "center", fontStyle: "bold" },
          2: { halign: "center" },
          3: { halign: "center" },
          4: { halign: "center" },
          5: {
            halign: "center",
            fontStyle: "italic",
            textColor: brandRose,
          },
        },
        margin: { left: margin, right: margin },
        didParseCell(data) {
          // colour-code the classification column
          if (data.section === "body" && data.column.index === 5) {
            const val = data.cell.raw;
            if (val === "Hypertensive Crisis") {
              data.cell.styles.textColor = [180, 40, 40];
              data.cell.styles.fontStyle = "bold";
            } else if (val === "High BP Stage 2" || val === "High BP Stage 1") {
              data.cell.styles.textColor = [190, 80, 40];
            } else if (val === "Elevated") {
              data.cell.styles.textColor = [160, 120, 40];
            } else {
              data.cell.styles.textColor = [40, 120, 70];
            }
          }
          // colour-code medication column
          if (data.section === "body" && data.column.index === 3) {
            data.cell.styles.textColor =
              data.cell.raw === "Taken" ? [40, 120, 70] : [180, 60, 60];
          }
        },
      });

      // ── 5. BP Classification legend ──────────────────────────────────────
      const legendY = doc.lastAutoTable.finalY + 10;
      const legendItems = [
        { label: "Normal", color: [40, 120, 70] },
        { label: "Elevated", color: [160, 120, 40] },
        { label: "High BP Stage 1", color: [190, 80, 40] },
        { label: "High BP Stage 2", color: [190, 80, 40] },
        { label: "Hypertensive Crisis", color: [180, 40, 40] },
      ];

      // Only draw legend if it fits on the current page
      if (legendY + 20 < pageH - 20) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...grayText);
        doc.text("BP Classification Reference:", margin, legendY);

        let lx2 = margin;
        legendItems.forEach((item) => {
          doc.setFillColor(...item.color);
          doc.circle(lx2 + 2, legendY + 6, 2, "F");
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...item.color);
          doc.text(item.label, lx2 + 6, legendY + 7.5);
          lx2 += doc.getTextWidth(item.label) + 14;
        });
      }

      // ── 6. Add footer to all pages ───────────────────────────────────────
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        addFooter(p, totalPages);
      }

      const fileName = `pulseglass-report-${now.toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
      setFeedback("PDF report exported successfully.");
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
        <nav className="floating-nav">
          <div className="profile-badge">
            <span>{user?.name?.slice(0, 1) || "U"}</span>
          </div>
          <button className="ghost-button" onClick={logout} type="button">
            Log out
          </button>
        </nav>

        <header className="glass-panel topbar">
          <div>
            <span className="eyebrow">Personal dashboard</span>
            <h1>Hi {user?.name?.split(" ")[0]}, hope you are doing great.</h1>
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
                  form.recordedAt && form.systolic && form.diastolic ? "primary-button--ready" : ""
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
              {summary?.trends?.length ? (
                <div className="chart-legend">
                  <span className="chart-legend__item chart-legend__item--sys">
                    <span className="chart-legend__dot" />
                    Systolic
                  </span>
                  <span className="chart-legend__item chart-legend__item--dia">
                    <span className="chart-legend__dot" />
                    Diastolic
                  </span>
                </div>
              ) : null}
            </div>

            <div className="chart-wrap">
              {summary?.trends?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={summary.trends}
                    margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
                  >
                    <defs>
                      {/* Systolic gradient — warm coral */}
                      <linearGradient id="sysGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%"   stopColor="#FF9B86" stopOpacity={0.55} />
                        <stop offset="50%"  stopColor="#FFB4A2" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#FFB4A2" stopOpacity={0}    />
                      </linearGradient>
                      {/* Diastolic gradient — deep mauve */}
                      <linearGradient id="diaGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%"   stopColor="#8B6471" stopOpacity={0.4}  />
                        <stop offset="55%"  stopColor="#B5828C" stopOpacity={0.14} />
                        <stop offset="100%" stopColor="#B5828C" stopOpacity={0}    />
                      </linearGradient>
                      {/* Glow filter for active dots */}
                      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* ── Clinical reference zones ─────────────────────── */}
                    {/* Normal systolic zone (below 120) */}
                    <ReferenceArea
                      y1={60}  y2={120}
                      fill="rgba(93, 135, 99, 0.045)"
                      strokeOpacity={0}
                    />
                    {/* Elevated systolic zone (120–130) */}
                    <ReferenceArea
                      y1={120} y2={130}
                      fill="rgba(185, 122, 88, 0.055)"
                      strokeOpacity={0}
                    />
                    {/* High systolic zone (130+) */}
                    <ReferenceArea
                      y1={130} y2={200}
                      fill="rgba(166, 76, 93, 0.04)"
                      strokeOpacity={0}
                    />

                    <CartesianGrid
                      stroke="rgba(181, 130, 140, 0.12)"
                      strokeDasharray="6 4"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={16}
                      tick={{ fill: "#9A7480", fontSize: 11.5, fontWeight: 700, fontFamily: "Manrope, sans-serif" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      width={52}
                      domain={["dataMin - 12", "dataMax + 12"]}
                      tick={{ fill: "#9A7480", fontSize: 11.5, fontWeight: 700, fontFamily: "Manrope, sans-serif" }}
                    />

                    {/* ── Clinical reference lines ─────────────────────── */}
                    <ReferenceLine
                      y={120}
                      stroke="rgba(185, 122, 88, 0.45)"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      label={{ value: "120", position: "insideTopRight", fill: "#B97A58", fontSize: 10, fontWeight: 700, dy: -4 }}
                    />
                    <ReferenceLine
                      y={80}
                      stroke="rgba(93, 135, 99, 0.45)"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      label={{ value: "80", position: "insideTopRight", fill: "#5d8763", fontSize: 10, fontWeight: 700, dy: -4 }}
                    />

                    {/* ── Custom Tooltip ───────────────────────────────── */}
                    <Tooltip
                      cursor={{ stroke: "rgba(181,130,140,0.25)", strokeWidth: 1.5, strokeDasharray: "4 3" }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const sys = payload.find(p => p.dataKey === "avgSystolic")?.value;
                        const dia = payload.find(p => p.dataKey === "avgDiastolic")?.value;
                        const cat = sys && dia ? classifyReading(Math.round(sys), Math.round(dia)) : null;
                        return (
                          <div className="chart-tooltip">
                            <p className="chart-tooltip__label">{label}</p>
                            <div className="chart-tooltip__rows">
                              <div className="chart-tooltip__row">
                                <span className="chart-tooltip__swatch chart-tooltip__swatch--sys" />
                                <span className="chart-tooltip__key">Systolic</span>
                                <strong className="chart-tooltip__val">{sys ? Math.round(sys) : "--"}</strong>
                                <span className="chart-tooltip__unit">mmHg</span>
                              </div>
                              <div className="chart-tooltip__row">
                                <span className="chart-tooltip__swatch chart-tooltip__swatch--dia" />
                                <span className="chart-tooltip__key">Diastolic</span>
                                <strong className="chart-tooltip__val">{dia ? Math.round(dia) : "--"}</strong>
                                <span className="chart-tooltip__unit">mmHg</span>
                              </div>
                            </div>
                            {cat && (
                              <span className={`status-pill status-pill--${cat.tone} chart-tooltip__pill`}>
                                {cat.label}
                              </span>
                            )}
                          </div>
                        );
                      }}
                    />

                    {/* ── Systolic area ────────────────────────────────── */}
                    <Area
                      type="monotoneX"
                      dataKey="avgSystolic"
                      stroke="#FF9B86"
                      strokeWidth={2.5}
                      fill="url(#sysGradient)"
                      dot={(props) => {
                        const { cx, cy } = props;
                        return (
                          <circle
                            key={`sys-dot-${cx}-${cy}`}
                            cx={cx} cy={cy} r={4}
                            fill="#fff"
                            stroke="#FF9B86"
                            strokeWidth={2.5}
                          />
                        );
                      }}
                      activeDot={(props) => {
                        const { cx, cy } = props;
                        return (
                          <g key={`sys-active-${cx}`}>
                            <circle cx={cx} cy={cy} r={10} fill="rgba(255,155,134,0.18)" />
                            <circle cx={cx} cy={cy} r={6}  fill="#FF9B86" filter="url(#glow)" />
                            <circle cx={cx} cy={cy} r={3}  fill="#fff" />
                          </g>
                        );
                      }}
                    />

                    {/* ── Diastolic area ───────────────────────────────── */}
                    <Area
                      type="monotoneX"
                      dataKey="avgDiastolic"
                      stroke="#8B6471"
                      strokeWidth={2.5}
                      fill="url(#diaGradient)"
                      dot={(props) => {
                        const { cx, cy } = props;
                        return (
                          <circle
                            key={`dia-dot-${cx}-${cy}`}
                            cx={cx} cy={cy} r={4}
                            fill="#fff"
                            stroke="#8B6471"
                            strokeWidth={2.5}
                          />
                        );
                      }}
                      activeDot={(props) => {
                        const { cx, cy } = props;
                        return (
                          <g key={`dia-active-${cx}`}>
                            <circle cx={cx} cy={cy} r={10} fill="rgba(139,100,113,0.18)" />
                            <circle cx={cx} cy={cy} r={6}  fill="#8B6471" filter="url(#glow)" />
                            <circle cx={cx} cy={cy} r={3}  fill="#fff" />
                          </g>
                        );
                      }}
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
