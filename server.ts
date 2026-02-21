import express from "express";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

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

  // Initialize Database Tables
  const initDb = async () => {
    try {
      const connection = await pool.getConnection();
      console.log("Initializing database tables...");
      
      // Create admins table (for website login only)
      await connection.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME NULL
        )
      `);

      // Create users table (for mobile Flutter API)
      await connection.query(`DROP TABLE IF EXISTS users`);
      await connection.query(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          email VARCHAR(255) NULL,
          password VARCHAR(255) NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'cashier',
          phone_number VARCHAR(50) NOT NULL,
          is_active TINYINT(1) DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME NULL
        )
      `);
      
      // Seed default admin if none exists (for website)
      const [adminRows]: any = await connection.query("SELECT COUNT(*) as count FROM admins");
      if (adminRows[0].count === 0) {
        console.log("Seeding default admin user...");
        const hashedPassword = await bcrypt.hash('sebri2026', 10);
        await connection.query(
          "INSERT INTO admins (username, email, password) VALUES (?, ?, ?)",
          ['sebri_admin', 'admin@sebri.com', hashedPassword]
        );
      }

      console.log("Database tables verified and seeded.");
      connection.release();
    } catch (error) {
      console.error("Failed to initialize database:", error);
    }
  };

  await initDb();

  // API routes
  app.use(express.json());

  app.get("/api/users", async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT id, username, email, full_name, role, phone_number, is_active, created_at, last_login FROM users ORDER BY created_at DESC");
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users", async (req, res) => {
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
    try {
      const [rows]: any = await pool.query(
        "SELECT * FROM admins WHERE username = ? OR email = ?",
        [identifier, identifier]
      );
      
      if (rows.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const admin = rows[0];
      const isValidPassword = await bcrypt.compare(password, admin.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await pool.query("UPDATE admins SET last_login = NOW() WHERE id = ?", [admin.id]);
      
      res.json({ 
        success: true, 
        message: "Login successful",
        user: { id: admin.id, username: admin.username, email: admin.email }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
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

  app.delete("/api/users/:id", async (req, res) => {
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
