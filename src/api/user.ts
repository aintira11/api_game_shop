import express, { Request, Response } from "express";
import { conn } from "../dbconnect";
import bcrypt from "bcrypt";
import { ResultSetHeader } from "mysql2"; // สำหรับ insert result type

export const router = express.Router();

// test
router.get("/", (req: Request, res: Response) => {
  res.send("Hello GameShop");
});

// เส้นแสดงเกมขายดี 10 อันดับ
router.get("/games/bestseller", async (req: Request, res: Response) => {
  try {
    // ดึงข้อมูลเกมที่มียอดขายสูงสุด
    const [rows] = await conn.query<any[]>(`
      SELECT 
      *
      FROM G_game
      ORDER BY purchase_count DESC
      LIMIT 10;
    `);

    return res.status(200).json({
      message: "แสดงรายการเกมขายดีสำเร็จ",
      data: rows,
    });
  } catch (err) {
    console.error("Get bestseller error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
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

// แก้ไขข้อมูลสมาชิก
router.put("/update/:id", async (req: Request, res: Response) => {
  try {
    const user_id = Number(req.params.id);
    const { username, email, profile } = req.body;

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

    // ตรวจสอบ username ซ้ำ (ยกเว้นของตัวเอง)
    if (username) {
      const [dupUser] = await conn.query<any[]>(
        "SELECT user_id FROM G_users WHERE username = ? AND user_id != ? LIMIT 1",
        [username, user_id]
      );
      if (dupUser.length > 0) {
        return res.status(400).json({ message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" });
      }
      updateFields.push("username = ?");
      params.push(username);
    }

    // ตรวจสอบ email ซ้ำ
    if (email) {
      const [dupEmail] = await conn.query<any[]>(
        "SELECT user_id FROM G_users WHERE email = ? AND user_id != ? LIMIT 1",
        [email, user_id]
      );
      if (dupEmail.length > 0) {
        return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
      }
      updateFields.push("email = ?");
      params.push(email);
    }

    // อัปเดตรูปโปรไฟล์
    if (profile) {
      updateFields.push("profile = ?");
      params.push(profile);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "ไม่มีข้อมูลที่ต้องการอัปเดต" });
    }

    params.push(user_id);

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


// เปลี่ยนรหัสผ่าน
router.put("/users/:id/change-password", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    // ดึงข้อมูล user
    const [users] = await conn.query<any[]>(
      "SELECT password FROM G_users WHERE user_id = ?",
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    // ตรวจสอบรหัสผ่านเดิม
    const isValid = await bcrypt.compare(currentPassword, users[0].password);
    if (!isValid) {
      return res.status(400).json({ message: "รหัสผ่านเดิมไม่ถูกต้อง" });
    }

    // เข้ารหัสรหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // อัพเดทรหัสผ่าน
    await conn.query(
      "UPDATE G_users SET password = ? WHERE user_id = ?",
      [hashedPassword, id]
    );

    return res.status(200).json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});