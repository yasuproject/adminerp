import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";

dotenv.config();

declare global {
  namespace Express {
    interface Request {
      user?: {
        type: string;
        userId: number;
        username?: string;
        email?: string;
        role?: string;
        name?: string;
      };
    }
  }
}

const sessions = new Map();
const apiKeys = new Map();
const loginAttempts = new Map();
const refreshTokens = new Map();

const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;
const API_KEY_EXPIRY = 90 * 24 * 60 * 60 * 1000;

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateApiKey() {
  return `sk_${crypto.randomBytes(24).toString("hex")}`;
}

function hashApiKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const attempts = loginAttempts.get(identifier);
  
  if (!attempts || now - attempts.firstAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.set(identifier, { count: 1, firstAttempt: now });
    return false;
  }
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    return true;
  }
  
  attempts.count++;
  return false;
}

function resetRateLimit(identifier: string) {
  loginAttempts.delete(identifier);
}

function validateSession(token: string) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_EXPIRY) {
    sessions.delete(token);
    return null;
  }
  sessions.set(token, { ...session, lastActivity: Date.now() });
  return session;
}

function validateApiKey(apiKey: string) {
  const keyHash = hashApiKey(apiKey);
  const keyData = apiKeys.get(keyHash);
  if (!keyData) return null;
  if (Date.now() > keyData.expiresAt) {
    apiKeys.delete(keyHash);
    return null;
  }
  return keyData;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Database connection pool
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // API routes
  app.use(express.json());

  // Enhanced Auth middleware - supports both Bearer token and API Key
  const authMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization header required" });
    }

    // Check for API Key (starts with sk_)
    if (authHeader.startsWith("sk_")) {
      const apiKey = authHeader;
      const keyData = validateApiKey(apiKey);
      if (!keyData) {
        return res.status(401).json({ error: "Invalid or expired API key" });
      }
      req.user = { type: "api", ...keyData };
      return next();
    }

    // Check for Bearer token
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const session = validateSession(token);
      if (!session) {
        return res.status(401).json({ error: "Session expired or invalid" });
      }
      req.user = { type: "session", ...session };
      return next();
    }

    return res.status(401).json({ error: "Invalid authorization format" });
  };

  // API Key management endpoints (admin only)
  app.post("/api/keys", authMiddleware, async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { name, userId } = req.body;
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);

    apiKeys.set(keyHash, {
      name: name || "API Key",
      userId: userId || req.user.userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + API_KEY_EXPIRY
    });

    res.json({
      success: true,
      apiKey,
      expiresIn: API_KEY_EXPIRY,
      message: "Save this API key - it won't be shown again"
    });
  });

  app.get("/api/keys", authMiddleware, async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const keys = Array.from(apiKeys.entries()).map(([hash, data]) => ({
      name: data.name,
      userId: data.userId,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      isExpired: Date.now() > data.expiresAt
    }));

    res.json(keys);
  });

  app.delete("/api/keys/:keyHash", authMiddleware, async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { keyHash } = req.params;
    if (apiKeys.has(keyHash)) {
      apiKeys.delete(keyHash);
      res.json({ success: true, message: "API key revoked" });
    } else {
      res.status(404).json({ error: "API key not found" });
    }
  });

  // Protected routes
  app.get("/api/users", authMiddleware, async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT id, username, email, full_name, role, phone_number, is_active, created_at, last_login FROM users ORDER BY created_at DESC");
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users", authMiddleware, async (req, res) => {
    const { username, email, password, full_name, role, phone_number } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        "INSERT INTO users (username, email, password, full_name, role, phone_number) VALUES (?, ?, ?, ?, ?, ?)",
        [username, email || null, hashedPassword, full_name, role || 'cashier', phone_number]
      );
      res.status(201).json({ message: "User created successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { identifier, password } = req.body;
    
    if (isRateLimited(identifier)) {
      return res.status(429).json({ 
        error: "Too many login attempts. Please try again in 15 minutes." 
      });
    }
    
    try {
      const [rows]: any = await pool.query(
        "SELECT * FROM admins WHERE username = ? OR email = ?",
        [identifier, identifier]
      );
      
      if (rows.length === 0) {
        resetRateLimit(identifier);
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const admin = rows[0];
      const isValidPassword = await bcrypt.compare(password, admin.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      resetRateLimit(identifier);
      await pool.query("UPDATE admins SET last_login = NOW() WHERE id = ?", [admin.id]);
      
      const token = generateToken();
      sessions.set(token, {
        userId: admin.id,
        username: admin.username,
        email: admin.email,
        createdAt: Date.now()
      });
      
      res.json({ 
        success: true, 
        message: "Login successful",
        token,
        expiresIn: SESSION_EXPIRY,
        user: { id: admin.id, username: admin.username, email: admin.email }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/logout", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token && sessions.has(token)) {
      sessions.delete(token);
    }
    res.json({ success: true, message: "Logged out" });
  });

  // Mobile Login API - for Flutter/React Native apps
  const mobileRateLimit = new Map<string, { count: number; firstAttempt: number }>();
  
  const isMobileRateLimited = (identifier: string): boolean => {
    const now = Date.now();
    const attempts = mobileRateLimit.get(identifier);
    
    if (!attempts || now - attempts.firstAttempt > RATE_LIMIT_WINDOW) {
      mobileRateLimit.set(identifier, { count: 1, firstAttempt: now });
      return false;
    }
    
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
      return true;
    }
    
    attempts.count++;
    return false;
  };

  const resetMobileRateLimit = (identifier: string) => {
    mobileRateLimit.delete(identifier);
  };

  app.post("/api/mobile/login", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (isMobileRateLimited(username)) {
      return res.status(429).json({ 
        error: "Too many login attempts. Please try again in 15 minutes." 
      });
    }

    try {
      const [rows]: any = await pool.query(
        "SELECT * FROM users WHERE username = ? AND is_active = 1",
        [username]
      );
      
      if (rows.length === 0) {
        resetMobileRateLimit(username);
        return res.status(401).json({ error: "Invalid credentials or account inactive" });
      }
      
      const user = rows[0];
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      resetMobileRateLimit(username);
      await pool.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);
      
      const token = generateToken();
      sessions.set(token, {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: Date.now()
      });
      
      res.json({ 
        success: true, 
        message: "Login successful",
        token,
        expiresIn: SESSION_EXPIRY,
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          phone_number: user.phone_number
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/verify", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ authenticated: false });
    }
    
    const session = validateSession(token);
    if (!session) {
      return res.status(401).json({ authenticated: false });
    }
    
    res.json({ 
      authenticated: true,
      user: { id: session.userId, username: session.username, email: session.email }
    });
  });

  app.put("/api/users/:id", authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { username, email, password, full_name, role, phone_number, is_active } = req.body;
    try {
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
          "UPDATE users SET username = ?, email = ?, password = ?, full_name = ?, role = ?, phone_number = ?, is_active = ? WHERE id = ?",
          [username, email, hashedPassword, full_name, role, phone_number, is_active, id]
        );
      } else {
        await pool.query(
          "UPDATE users SET username = ?, email = ?, full_name = ?, role = ?, phone_number = ?, is_active = ? WHERE id = ?",
          [username, email, full_name, role, phone_number, is_active, id]
        );
      }
      res.json({ message: "User updated successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/users/:id", authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query("DELETE FROM users WHERE id = ?", [id]);
      res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Recreate admin endpoint
  app.post("/api/admin/reset", async (req, res) => {
    const { username, email, password } = req.body;
    try {
      await pool.query("DELETE FROM admins");
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        "INSERT INTO admins (username, email, password) VALUES (?, ?, ?)",
        [username, email, hashedPassword]
      );
      res.json({ message: "Admin recreated successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/db-status", async (req, res) => {
    try {
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      res.json({ status: "connected", message: "Successfully connected to Sebri MySQL database" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.get("/api/db-verify", async (req, res) => {
    try {
      const [tables]: any = await pool.query("SHOW TABLES LIKE 'admins'");
      if (tables.length > 0) {
        const [users]: any = await pool.query("SELECT username, email FROM admins LIMIT 1");
        res.json({ 
          status: "success", 
          tableExists: true, 
          adminCreated: users.length > 0,
          adminInfo: users.length > 0 ? users[0] : null
        });
      } else {
        res.status(404).json({ status: "error", message: "Table 'admins' not found." });
      }
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: { overlay: false } },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e: any) {
      console.log("Vite not available:", e.message);
    }
  } else {
    app.use(express.static("dist"));

    app.get("*", (req, res) => {
      res.sendFile("dist/index.html");
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
