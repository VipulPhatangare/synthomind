import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = Router();

function signToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, env.JWT_SECRET, {
    expiresIn: `${env.JWT_EXPIRE_DAYS}d`,
  });
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: env.JWT_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
};

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const db = mongoose.connection.db;
  const user = await db.collection("users").findOne({ email: email.toLowerCase().trim() });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  res.cookie("token", token, COOKIE_OPTS);
  res.json({ email: user.email, role: user.role });
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ email: req.user.email, role: req.user.role });
});
