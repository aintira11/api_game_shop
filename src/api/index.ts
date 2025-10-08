import express, { Request, Response } from "express";
import { conn } from "../dbconnect";
import bcrypt from "bcrypt";
import { ResultSetHeader } from "mysql2"; // สำหรับ insert result type

export const router = express.Router();
// GET all games
router.get("/games", async (req: Request, res: Response) => {
  try {
    const [games] = await conn.query<any[]>(
      `SELECT 
         g.game_id, 
         g.game_name, 
         g.price, 
         g.category_id,
         c.category_name,
         g.game_image, 
         g.description, 
         g.release_date, 
         g.purchase_count
       FROM G_game g
       LEFT JOIN G_category c ON g.category_id = c.category_id
       ORDER BY g.release_date DESC`
    );

    return res.status(200).json({ games });
  } catch (err) {
    console.error("Get games error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// GET single game by ID
router.get("/games/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [games] = await conn.query<any[]>(
      `SELECT 
         g.game_id, g.game_name, g.price, g.category_id, c.category_name,
         g.game_image, g.description, g.release_date, g.purchase_count
       FROM G_game g
       LEFT JOIN G_category c ON g.category_id = c.category_id
       WHERE g.game_id = ?`,
      [id]
    );

    if (games.length === 0) {
      return res.status(404).json({ message: "ไม่พบเกม" });
    }

    return res.status(200).json({ game: games[0] });
  } catch (err) {
    console.error("Get game error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// CREATE new game
router.post("/newgame", async (req: Request, res: Response) => {
  try {
    const { game_name, price, category_id, game_image, description, release_date } = req.body;

    if (!game_name || price == null) {
      return res.status(400).json({ message: "กรุณากรอกชื่อเกมและราคา" });
    }

    if (price < 0) {
      return res.status(400).json({ message: "ราคาต้องมากกว่าหรือเท่ากับ 0" });
    }

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO G_game (game_name, price, category_id, game_image, description, release_date, purchase_count)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [game_name, price, category_id || null, game_image || null, description || null, release_date || null]
    );

    return res.status(201).json({
      message: "เพิ่มเกมสำเร็จ",
      game_id: result.insertId
    });
  } catch (err) {
    console.error("Create game error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});


// UPDATE game
router.put("/gameUpdate/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { game_name, price, category_id, game_image, description } = req.body;

    const [existingGames] = await conn.query<any[]>(
      "SELECT game_id FROM G_game WHERE game_id = ?",
      [id]
    );

    if (existingGames.length === 0) {
      return res.status(404).json({ message: "ไม่พบเกม" });
    }

    if (price !== undefined && price < 0) {
      return res.status(400).json({ message: "ราคาต้องมากกว่าหรือเท่ากับ 0" });
    }

    await conn.query(
      `UPDATE G_game 
       SET 
         game_name = COALESCE(?, game_name),
         price = COALESCE(?, price),
         category_id = COALESCE(?, category_id),
         game_image = COALESCE(?, game_image),
         description = COALESCE(?, description)
       WHERE game_id = ?`,
      [game_name, price, category_id, game_image, description, id]
    );

    return res.status(200).json({ message: "อัพเดทเกมสำเร็จ" });
  } catch (err) {
    console.error("Update game error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});


// DELETE game
router.delete("/delete/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if game exists
    const [existingGames] = await conn.query<any[]>(
      "SELECT game_id FROM G_game WHERE game_id = ?",
      [id]
    );

    if (existingGames.length === 0) {
      return res.status(404).json({ message: "ไม่พบเกม" });
    }

    // DELETE game
    await conn.query("DELETE FROM G_game WHERE game_id = ?", [id]);

    return res.status(200).json({ message: "ลบเกมสำเร็จ" });
  } catch (err) {
    console.error("Delete game error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// Search games
router.get("/games/search", async (req: Request, res: Response) => {
  try {
    const { query, category_id } = req.query;

    let sql = `
      SELECT 
        g.game_id, g.game_name, g.price, g.category_id, c.category_name,
        g.game_image, g.description, g.release_date, g.purchase_count
      FROM G_game g
      LEFT JOIN G_category c ON g.category_id = c.category_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (query) {
      sql += ` AND (g.game_name LIKE ? OR g.description LIKE ?)`;
      params.push(`%${query}%`, `%${query}%`);
    }

    if (category_id && category_id !== 'all') {
      sql += ` AND g.category_id = ?`;
      params.push(category_id);
    }

    sql += ` ORDER BY g.release_date DESC`;

    const [games] = await conn.query<any[]>(sql, params);

    return res.status(200).json({ games });
  } catch (err) {
    console.error("Search games error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// Increment purchase count อัปเดตยอดซื้อเกม
router.post("/games/:id/purchase", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await conn.query(
      "UPDATE G_game SET purchase_count = purchase_count + 1 WHERE game_id = ?",
      [id]
    );

    return res.status(200).json({ message: "อัพเดทจำนวนการซื้อสำเร็จ" });
  } catch (err) {
    console.error("Update purchase count error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// 🔹 GET: ดึงหมวดหมู่ทั้งหมด
router.get("/categories", async (req: Request, res: Response) => {
  try {
    const [categories] = await conn.query<any[]>(
      `SELECT category_id, category_name, created_at 
       FROM G_category `
    );

    return res.status(200).json({ categories });
  } catch (err) {
    console.error("Get categories error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

