import express from "express";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Database connection pool
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '9qijjp.h.filess.io',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'sebrierp_sciencefor',
    password: process.env.DB_PASSWORD || 'df0df3f7e161c4a5a6598a3be1148dccfbe6e147',
    database: process.env.DB_NAME || 'sebrierp_sciencefor',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Initialize Database Tables
  const initDb = async () => {
    try {
      const connection = await pool.getConnection();
      console.log("Initializing database tables...");
      
      // Create table with all required fields
      await connection.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          full_name VARCHAR(100),
          username VARCHAR(50) UNIQUE,
          phone_number VARCHAR(20),
          email VARCHAR(100),
          password VARCHAR(255) NOT NULL,
          role ENUM('cashier', 'admin', 'manager', 'sales', 'inventory') DEFAULT 'cashier',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Ensure columns exist (in case table was created previously with fewer columns)
      const [columns]: any = await connection.query("SHOW COLUMNS FROM admins");
      const columnNames = columns.map((c: any) => c.Field);
      
      if (!columnNames.includes('full_name')) {
        await connection.query("ALTER TABLE admins ADD COLUMN full_name VARCHAR(100) AFTER id");
      } else {
        // Update existing column to be nullable
        await connection.query("ALTER TABLE admins MODIFY COLUMN full_name VARCHAR(100) NULL");
      }

      if (!columnNames.includes('username')) {
        await connection.query("ALTER TABLE admins ADD COLUMN username VARCHAR(50) UNIQUE AFTER full_name");
      } else {
        // Update existing column to be nullable
        await connection.query("ALTER TABLE admins MODIFY COLUMN username VARCHAR(50) NULL");
      }
      if (!columnNames.includes('role')) {
        await connection.query("ALTER TABLE admins ADD COLUMN role ENUM('cashier', 'admin', 'manager', 'sales', 'inventory') DEFAULT 'cashier' AFTER password");
      }
      
      // Seed default admin if none exists
      const [rows]: any = await connection.query("SELECT COUNT(*) as count FROM admins");
      if (rows[0].count === 0) {
        console.log("Seeding default admin user...");
        await connection.query(
          "INSERT INTO admins (full_name, username, email, password, role) VALUES (?, ?, ?, ?, ?)",
          ['System Administrator', 'admin', 'admin@sebri.com', 'admin_password_2026', 'admin']
        );
      }

      console.log("Admins table verified and seeded.");
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
      const [rows] = await pool.query("SELECT id, full_name, username, phone_number, email, role, created_at FROM admins ORDER BY created_at DESC");
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    const { full_name, username, phone_number, email, password, role } = req.body;
    try {
      await pool.query(
        "INSERT INTO admins (full_name, username, phone_number, email, password, role) VALUES (?, ?, ?, ?, ?, ?)",
        [full_name, username, phone_number, email, password, role || 'cashier']
      );
      res.status(201).json({ message: "User created successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    const { full_name, username, phone_number, email, role } = req.body;
    try {
      await pool.query(
        "UPDATE admins SET full_name = ?, username = ?, phone_number = ?, email = ?, role = ? WHERE id = ?",
        [full_name, username, phone_number, email, role, id]
      );
      res.json({ message: "User updated successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query("DELETE FROM admins WHERE id = ?", [id]);
      res.json({ message: "User deleted successfully" });
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
