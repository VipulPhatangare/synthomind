import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { verdictsRouter } from "./routes/verdicts.js";
import { recommendationsRouter } from "./routes/recommendations.js";
import { disputesRouter } from "./routes/disputes.js";
import { exportRouter } from "./routes/exportRoutes.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { metaRouter } from "./routes/meta.js";
import { chatRouter } from "./routes/chat.js";
import { evaluationRouter } from "./routes/evaluation.js";

export const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "talentiq-server" });
});

app.use("/api/auth", authRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/verdicts", verdictsRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/disputes", disputesRouter);
app.use("/api/export", exportRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/meta", metaRouter);
app.use("/api/chat", chatRouter);
app.use("/api/evaluation", evaluationRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
