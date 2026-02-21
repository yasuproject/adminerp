import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

async function initDb() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
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

  try {
    const connection = await pool.getConnection();
    console.log("Connected to database. Creating tables...");
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL
      )
    `);
    console.log("Created 'admins' table");

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL
      )
    `);
    console.log("Created 'users' table");

    const [adminRows]: any = await connection.query("SELECT COUNT(*) as count FROM admins");
    if (adminRows[0].count === 0) {
      console.log("Seeding default admin user...");
      const hashedPassword = await bcrypt.hash('sebri2026', 10);
      await connection.query(
        "INSERT INTO admins (username, email, password) VALUES (?, ?, ?)",
        ['sebri_admin', 'admin@sebri.com', hashedPassword]
      );
      console.log("Default admin created: sebri_admin / sebri2026");
    }

    console.log("Database tables created successfully!");
    connection.release();
    process.exit(0);
  } catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  }
}

initDb();
