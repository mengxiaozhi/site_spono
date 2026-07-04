import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { nowIso, publicUser } from "./database.mjs";

export const AUTH_COOKIE = "site_spono_session";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

export function createUser(db, email, password) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const error = new Error("請輸入有效的 Email");
    error.status = 400;
    throw error;
  }
  if (!validatePassword(password)) {
    const error = new Error("密碼至少需要 8 個字元");
    error.status = 400;
    throw error;
  }

  const user = {
    id: randomUUID(),
    email: normalized,
    passwordHash: bcrypt.hashSync(password, 12),
    createdAt: nowIso()
  };

  try {
    db.prepare(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
    ).run(user.id, user.email, user.passwordHash, user.createdAt);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      const duplicate = new Error("此 Email 已經註冊");
      duplicate.status = 409;
      throw duplicate;
    }
    throw error;
  }

  return publicUser({
    id: user.id,
    email: user.email,
    created_at: user.createdAt
  });
}

export function authenticateUser(db, email, password) {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email));
  if (!row || !bcrypt.compareSync(String(password || ""), row.password_hash)) {
    const error = new Error("Email 或密碼不正確");
    error.status = 401;
    throw error;
  }
  return publicUser(row);
}

export function signSession(user, config) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: "7d",
    issuer: "site-spono"
  });
}

export function setSessionCookie(res, token, config) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(res, config) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/"
  });
}

export function getSessionUser(req, db, config) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, { issuer: "site-spono" });
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
    return publicUser(row);
  } catch {
    return null;
  }
}

export function requireAuth(db, config) {
  return (req, res, next) => {
    const user = getSessionUser(req, db, config);
    if (!user) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    req.user = user;
    next();
  };
}
