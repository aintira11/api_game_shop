import express, { Request, Response } from "express";
import { conn } from "../dbconnect";
import bcrypt from "bcrypt";
import { ResultSetHeader } from "mysql2"; // สำหรับ insert result type

export const router = express.Router();

// test
router.get("/", (req: Request, res: Response) => {
  res.send("Auth router is working");
});

// Register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, email, password, profile, user_type } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const tUsername = String(username).trim();
    const tEmail = String(email).trim().toLowerCase();
    const tPassword = String(password);

    // ตรวจสอบว่า email ซ้ำหรือยัง
    const [existingRows] = await conn.query<any[]>(
      "SELECT user_id FROM G_users WHERE email = ? LIMIT 1",
      [tEmail]
    );
    if (existingRows.length > 0) {
      return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
    }

    // เข้ารหัสรหัสผ่าน
    const hashedPassword = await bcrypt.hash(tPassword, 10);

    // INSERT
    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO G_users (username, email, password, profile, user_type)
       VALUES (?, ?, ?, ?, ?)`,
      [tUsername, tEmail, hashedPassword, profile ?? null, user_type ?? "normal"]
    );

    const insertId = result.insertId;

    return res.status(201).json({
      message: "สมัครสมาชิกสำเร็จ",
      user_id: insertId,
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// Login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json([{ message: "กรุณากรอกข้อมูลให้ครบ" }]);
    }

    const tEmail = String(email).trim().toLowerCase();
    const tPassword = String(password);

    const [rows] = await conn.query<any[]>(
      "SELECT * FROM G_users WHERE email = ? LIMIT 1",
      [tEmail]
    );

    if (rows.length === 0) {
      return res.status(400).json([{ message: "ไม่พบบัญชีนี้" }]);
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(tPassword, user.password);
    if (!isMatch) {
      return res.status(400).json([{ message: "รหัสผ่านไม่ถูกต้อง" }]);
    }

    // ลบ password ก่อนส่งกลับ
    delete user.password;

    return res.json([
      user, // object ของ user
    ]);
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json([{ message: "เกิดข้อผิดพลาดในระบบ" }]);
  }
});

// 🧩 แก้ไขข้อมูลสมาชิก
router.put("/update/:id", async (req: Request, res: Response) => {
  try {
    const user_id = Number(req.params.id);
    const { username, email, password, profile, user_type } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "ไม่พบ user_id" });
    }

    // ตรวจสอบว่าผู้ใช้นี้มีอยู่หรือไม่
    const [existingRows] = await conn.query<any[]>(
      "SELECT * FROM G_users WHERE user_id = ?",
      [user_id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    // เตรียมข้อมูลที่จะอัปเดต
    let updateFields: string[] = [];
    let params: any[] = [];

    if (username) {
      updateFields.push("username = ?");
      params.push(username);
    }

    if (email) {
      // ตรวจสอบว่าอีเมลซ้ำไหม (ยกเว้นของตัวเอง)
      const [dupCheck] = await conn.query<any[]>(
        "SELECT user_id FROM G_users WHERE email = ? AND user_id != ? LIMIT 1",
        [email, user_id]
      );
      if (dupCheck.length > 0) {
        return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
      }
      updateFields.push("email = ?");
      params.push(email);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push("password = ?");
      params.push(hashedPassword);
    }

    if (profile) {
      updateFields.push("profile = ?");
      params.push(profile);
    }

    if (user_type) {
      updateFields.push("user_type = ?");
      params.push(user_type);
    }

    // ถ้าไม่มี field ที่อัปเดต
    if (updateFields.length === 0) {
      return res.status(400).json({ message: "ไม่มีข้อมูลที่ต้องการอัปเดต" });
    }

    params.push(user_id);

    // อัปเดตข้อมูล
    const [result] = await conn.query<ResultSetHeader>(
      `UPDATE G_users SET ${updateFields.join(", ")} WHERE user_id = ?`,
      params
    );

    return res.status(200).json({
      message: "อัปเดตข้อมูลสำเร็จ",
      affectedRows: result.affectedRows,
    });
  } catch (err) {
    console.error("Update user error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});
