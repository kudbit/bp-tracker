import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const {
  PORT = 5000,
  MONGO_URI = "mongodb://127.0.0.1:27017/pulseglass",
  JWT_SECRET = "0415e8aebb6de5e8ec12c11927e69db3db63afbbb75efea49e846e9b2d188dfe",
  CLIENT_URL = "http://localhost:5173",
} = process.env;

const app = express();

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(morgan("dev"));



const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6 },
  },
  { timestamps: true },
);

userSchema.pre("save", async function handlePasswordHash(next) {
  if (!this.isModified("password")) {
    next();
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function matchPassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const entrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recordedAt: { type: Date, required: true },
    systolic: { type: Number, required: true, min: 60, max: 250 },
    diastolic: { type: Number, required: true, min: 40, max: 180 },
    pulse: { type: Number, min: 30, max: 220 },
    medicationTaken: { type: Boolean, default: true },
    symptoms: { type: [String], default: [] },
    notes: { type: String, trim: true, maxlength: 450 },
  },
  { timestamps: true },
);

entrySchema.index({ user: 1, recordedAt: -1 });

const User = mongoose.model("User", userSchema);
const Entry = mongoose.model("Entry", entrySchema);

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

function sanitizeUser(user) {
  return { id: user._id, name: user.name, email: user.email };
}

function classifyReading(systolic, diastolic) {
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

function average(numbers) {
  if (!numbers.length) {
    return null;
  }

  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function formatDayLabel(dateValue) {
  return new Date(dateValue).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildSummary(entries) {
  const sortedEntries = [...entries].sort(
    (left, right) => new Date(left.recordedAt) - new Date(right.recordedAt),
  );

  const totalReadings = sortedEntries.length;
  const systolicAverage = average(sortedEntries.map((entry) => entry.systolic));
  const diastolicAverage = average(sortedEntries.map((entry) => entry.diastolic));
  const pulseAverage = average(sortedEntries.map((entry) => entry.pulse).filter(Boolean));
  const missedMedication = sortedEntries.filter((entry) => !entry.medicationTaken).length;
  const medicationAdherence = totalReadings
    ? Math.round(((totalReadings - missedMedication) / totalReadings) * 100)
    : 100;

  const grouped = sortedEntries.reduce((collection, entry) => {
    const dateKey = new Date(entry.recordedAt).toLocaleDateString("en-CA");
    if (!collection[dateKey]) {
      collection[dateKey] = [];
    }
    collection[dateKey].push(entry);
    return collection;
  }, {});

  const trends = Object.entries(grouped).map(([date, dayEntries]) => ({
    date,
    label: formatDayLabel(date),
    avgSystolic: average(dayEntries.map((entry) => entry.systolic)),
    avgDiastolic: average(dayEntries.map((entry) => entry.diastolic)),
    avgPulse: average(dayEntries.map((entry) => entry.pulse).filter(Boolean)),
    count: dayEntries.length,
  }));

  const breakdown = sortedEntries.reduce(
    (collection, entry) => {
      const { label } = classifyReading(entry.systolic, entry.diastolic);
      collection[label] += 1;
      return collection;
    },
    { Optimal: 0, Elevated: 0, "Stage 1": 0, "Stage 2": 0 },
  );

  const latestEntry = sortedEntries.at(-1) || null;
  const latestCategory = latestEntry
    ? classifyReading(latestEntry.systolic, latestEntry.diastolic)
    : null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentWindow = sortedEntries.filter(
    (entry) => new Date(entry.recordedAt) >= sevenDaysAgo,
  );

  return {
    totals: {
      readings: totalReadings,
      avgSystolic: systolicAverage,
      avgDiastolic: diastolicAverage,
      avgPulse: pulseAverage,
      missedMedication,
      medicationAdherence,
      recentCheckIns: recentWindow.length,
    },
    latestEntry,
    latestCategory,
    trends,
    breakdown,
  };
}

async function requireAuth(request, response, next) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.split(" ")[1]
    : null;

  if (!token) {
    response.status(401).json({ message: "Authentication required." });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.userId).select("-password");

    if (!user) {
      response.status(401).json({ message: "Account not found." });
      return;
    }

    request.user = user;
    next();
  } catch (error) {
    response.status(401).json({ message: "Session expired. Please log in again." });
  }
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/api/auth/register", async (request, response) => {
  try {
    const { name, email, password } = request.body;

    if (!name || !email || !password) {
      response.status(400).json({ message: "Name, email, and password are required." });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      response.status(409).json({ message: "An account with that email already exists." });
      return;
    }

    const user = await User.create({ name, email, password });
    response.status(201).json({
      token: createToken(user._id),
      user: sanitizeUser(user),
    });
  } catch (error) {
    response.status(500).json({ message: "Unable to create your account right now." });
  }
});

app.post("/api/auth/login", async (request, response) => {
  try {
    const { email, password } = request.body;

    if (!email || !password) {
      response.status(400).json({ message: "Email and password are required." });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.matchPassword(password))) {
      response.status(401).json({ message: "Invalid email or password." });
      return;
    }

    response.json({
      token: createToken(user._id),
      user: sanitizeUser(user),
    });
  } catch (error) {
    response.status(500).json({ message: "Unable to log you in right now." });
  }
});

app.get("/api/auth/me", requireAuth, async (request, response) => {
  response.json({ user: sanitizeUser(request.user) });
});

app.get("/api/entries/summary", requireAuth, async (request, response) => {
  try {
    const entries = await Entry.find({ user: request.user._id }).lean();
    response.json(buildSummary(entries));
  } catch (error) {
    response.status(500).json({ message: "Could not load your health summary." });
  }
});

app.get("/api/entries/all", requireAuth, async (request, response) => {
  try {
    const entries = await Entry.find({ user: request.user._id })
      .sort({ recordedAt: -1 })
      .lean();

    response.json({ entries });
  } catch (error) {
    response.status(500).json({ message: "Could not load all your readings." });
  }
});

app.get("/api/entries", requireAuth, async (request, response) => {
  try {
    const limit = Math.min(Number(request.query.limit) || 18, 100);
    const entries = await Entry.find({ user: request.user._id })
      .sort({ recordedAt: -1 })
      .limit(limit)
      .lean();

    response.json({ entries });
  } catch (error) {
    response.status(500).json({ message: "Could not load your readings." });
  }
});

app.post("/api/entries", requireAuth, async (request, response) => {
  try {
    const {
      recordedAt,
      systolic,
      diastolic,
      pulse,
      medicationTaken,
      symptoms,
      notes,
    } = request.body;

    if (!recordedAt || !systolic || !diastolic) {
      response
        .status(400)
        .json({ message: "Recorded time, systolic, and diastolic values are required." });
      return;
    }

    const parsedSymptoms = Array.isArray(symptoms)
      ? symptoms.filter(Boolean).map((value) => String(value).trim())
      : [];

    const entry = await Entry.create({
      user: request.user._id,
      recordedAt,
      systolic,
      diastolic,
      pulse: pulse || undefined,
      medicationTaken: Boolean(medicationTaken),
      symptoms: parsedSymptoms,
      notes,
    });

    response.status(201).json({
      entry,
      category: classifyReading(entry.systolic, entry.diastolic),
    });
  } catch (error) {
    response.status(500).json({ message: "Could not save that reading." });
  }
});

app.delete("/api/entries/:entryId", requireAuth, async (request, response) => {
  try {
    const deletedEntry = await Entry.findOneAndDelete({
      _id: request.params.entryId,
      user: request.user._id,
    });

    if (!deletedEntry) {
      response.status(404).json({ message: "Reading not found." });
      return;
    }

    response.json({ message: "Reading removed." });
  } catch (error) {
    response.status(500).json({ message: "Could not delete that reading." });
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({ message: "API route not found." });
});

// Serve frontend static files in production
app.use(express.static(path.join(__dirname, "../../client/dist")));

// Catch-all route to serve the React app for any unmatched routes 
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    app.listen(PORT, () => {
      console.log(`PulseGlass API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
