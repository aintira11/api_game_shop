"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("../dbconnect");
const bcrypt_1 = __importDefault(require("bcrypt"));
exports.router = express_1.default.Router();
// test
exports.router.get("/", (req, res) => {
    res.send("Hello GameShop");
});
// Register
exports.router.post("/register", async (req, res) => {
    try {
        const { username, email, password, profile, user_type } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
        }
        const tUsername = String(username).trim();
        const tEmail = String(email).trim().toLowerCase();
        const tPassword = String(password);
        // ตรวจสอบว่า email ซ้ำหรือยัง
        const [existingRows] = await dbconnect_1.conn.query("SELECT user_id FROM G_users WHERE email = ? LIMIT 1", [tEmail]);
        if (existingRows.length > 0) {
            return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
        }
        // เข้ารหัสรหัสผ่าน
        const hashedPassword = await bcrypt_1.default.hash(tPassword, 10);
        // INSERT
        const [result] = await dbconnect_1.conn.query(`INSERT INTO G_users (username, email, password, profile, user_type)
       VALUES (?, ?, ?, ?, ?)`, [tUsername, tEmail, hashedPassword, profile ?? null, user_type ?? "normal"]);
        const insertId = result.insertId;
        return res.status(201).json({
            message: "สมัครสมาชิกสำเร็จ",
            user_id: insertId,
        });
    }
    catch (err) {
        console.error("Register error:", err);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
    }
});
// Login
exports.router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json([{ message: "กรุณากรอกข้อมูลให้ครบ" }]);
        }
        const tEmail = String(email).trim().toLowerCase();
        const tPassword = String(password);
        const [rows] = await dbconnect_1.conn.query("SELECT * FROM G_users WHERE email = ? LIMIT 1", [tEmail]);
        if (rows.length === 0) {
            return res.status(400).json([{ message: "ไม่พบบัญชีนี้" }]);
        }
        const user = rows[0];
        const isMatch = await bcrypt_1.default.compare(tPassword, user.password);
        if (!isMatch) {
            return res.status(400).json([{ message: "รหัสผ่านไม่ถูกต้อง" }]);
        }
        // ลบ password ก่อนส่งกลับ
        delete user.password;
        return res.json([
            user, // object ของ user
        ]);
    }
    catch (err) {
        console.error("Login error:", err);
        return res.status(500).json([{ message: "เกิดข้อผิดพลาดในระบบ" }]);
    }
});
// แก้ไขข้อมูลสมาชิก
exports.router.put("/update/:id", async (req, res) => {
    try {
        const user_id = Number(req.params.id);
        const { username, email, profile } = req.body;
        if (!user_id) {
            return res.status(400).json({ message: "ไม่พบ user_id" });
        }
        // ตรวจสอบว่าผู้ใช้นี้มีอยู่หรือไม่
        const [existingRows] = await dbconnect_1.conn.query("SELECT * FROM G_users WHERE user_id = ?", [user_id]);
        if (existingRows.length === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้" });
        }
        // เตรียมข้อมูลที่จะอัปเดต
        let updateFields = [];
        let params = [];
        if (username) {
            updateFields.push("username = ?");
            params.push(username);
        }
        if (email) {
            // ตรวจสอบว่าอีเมลซ้ำไหม (ยกเว้นของตัวเอง)
            const [dupCheck] = await dbconnect_1.conn.query("SELECT user_id FROM G_users WHERE email = ? AND user_id != ? LIMIT 1", [email, user_id]);
            if (dupCheck.length > 0) {
                return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
            }
            updateFields.push("email = ?");
            params.push(email);
        }
        if (profile) {
            updateFields.push("profile = ?");
            params.push(profile);
        }
        // ถ้าไม่มี field ที่อัปเดต
        if (updateFields.length === 0) {
            return res.status(400).json({ message: "ไม่มีข้อมูลที่ต้องการอัปเดต" });
        }
        params.push(user_id);
        // อัปเดตข้อมูล
        const [result] = await dbconnect_1.conn.query(`UPDATE G_users SET ${updateFields.join(", ")} WHERE user_id = ?`, params);
        return res.status(200).json({
            message: "อัปเดตข้อมูลสำเร็จ",
            affectedRows: result.affectedRows,
        });
    }
    catch (err) {
        console.error("Update user error:", err);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
    }
});
