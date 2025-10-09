import express, { Request, Response } from "express";
import { conn } from "../dbconnect";
import bcrypt from "bcrypt";
import { ResultSetHeader } from "mysql2"; // สำหรับ insert result type
export const router = express.Router();

// เพิ่มเกมลงตะกร้า
router.post("/gametocart", async (req: Request, res: Response) => {
  try {
    const { user_id, game_id } = req.body;

    if (!user_id || !game_id) {
      return res.status(400).json({ message: "กรุณาระบุ user_id และ game_id" });
    }

    // 1 ตรวจสอบว่าผู้ใช้นี้มีตะกร้าอยู่แล้วหรือยัง
    const [cartRows] = await conn.query<any[]>(
      "SELECT cart_id FROM G_cart WHERE user_id = ?",
      [user_id]
    );

    let cart_id: number;

    if (cartRows.length === 0) {
      // ยังไม่มี — ให้สร้างตะกร้าใหม่
      const [result] = await conn.query<any>(
        "INSERT INTO G_cart (user_id) VALUES (?)",
        [user_id]
      );
      cart_id = result.insertId;
    } else {
      // มีอยู่แล้ว
      cart_id = cartRows[0].cart_id;
    }

    // 2 ตรวจสอบว่าเกมนี้อยู่ในตะกร้าแล้วหรือยัง
    const [exist] = await conn.query<any[]>(
      "SELECT * FROM G_cart_item WHERE cart_id = ? AND game_id = ?",
      [cart_id, game_id]
    );

    if (exist.length > 0) {
      return res.status(201).json({ message: "คุณมีเกมนี้ในตะกร้าแล้ว" });
    }

    // 3 เพิ่มเกมลงในตะกร้า
    await conn.query(
      "INSERT INTO G_cart_item (cart_id, game_id) VALUES (?, ?)",
      [cart_id, game_id]
    );

    return res.status(200).json({ message: "เพิ่มเกมลงตะกร้าสำเร็จ" });
  } catch (err) {
    console.error("Cart add error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});


// สั่งซื้อสินค้า
router.post("/purchase", async (req: Request, res: Response) => {
  const connection = await conn.getConnection();
  await connection.beginTransaction();

  try {
    const { user_id, items, total_price } = req.body;

    /**
     * items = [
     *   { game_id: 1, quantity: 1, price: 299.00 },
     *   { game_id: 3, quantity: 2, price: 199.00 }
     * ]
     */

    if (!user_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    }

    // 1. สั่งซื้อ
    const [orderResult] = await connection.query<ResultSetHeader>(
      "INSERT INTO G_buy (user_id, total_price) VALUES (?, ?)",
      [user_id, total_price]
    );

    const orderId = orderResult.insertId;

    // 2. เพิ่มเกมแต่ละรายการ
    for (const item of items) {
      await connection.query(
        `INSERT INTO G_buy_item (order_id, game_id, price)
         VALUES (?, ?, ?)`,
        [orderId, item.game_id, item.price]
      );

      // 3. เพิ่มยอดขายของเกม
      await connection.query(
        "UPDATE G_game SET purchase_count = purchase_count + 1 WHERE game_id = ?",
        [ item.game_id]
      );
    }

    // 4. ล้างตะกร้า
    await connection.query("DELETE FROM G_cart WHERE user_id = ?", [user_id]);

    await connection.commit();

    return res.status(201).json({
      message: "สั่งซื้อสำเร็จ",
      order_id: orderId,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Purchase error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  } finally {
    connection.release();
  }
});


// ดูตะกร้าของผู้ใช้
router.get("/cartUser/:user_id", async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const [rows] = await conn.query<any[]>(
      `
      SELECT 
        ci.cart_item_id,
        ci.cart_id,
        ci.game_id,
        g.game_name,
        g.price,
        g.game_image
      FROM G_cart_item ci
      JOIN G_cart c ON ci.cart_id = c.cart_id
      JOIN G_game g ON ci.game_id = g.game_id
      WHERE c.user_id = ?
      `,
      [user_id]
    );

    return res.status(200).json(rows); // ส่งกลับเป็น array ของรายการเกมในตะกร้า
  } catch (err) {
    console.error("Get cart error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});



// ลบเกมออกจากตะกร้า
router.delete("/cart/:user_id/:game_id", async (req: Request, res: Response) => {
  try {
    const { user_id, game_id } = req.params;

    const [result] = await conn.query<any>(
      "DELETE FROM G_cart WHERE user_id = ? AND game_id = ?",
      [user_id, game_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบเกมในตะกร้า" });
    }

    return res.status(200).json({ message: "ลบเกมออกจากตะกร้าสำเร็จ" });
  } catch (err) {
    console.error("Delete cart item error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});
