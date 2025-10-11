import express, { Request, Response } from "express";
import { conn } from "../dbconnect";
import { ResultSetHeader } from "mysql2"; // สำหรับ insert result type
export const router = express.Router();

// เพิ่มเกมลงตะกร้า
router.post("/gametocart", async (req: Request, res: Response) => {
  try {
    const { user_id, game_id } = req.body;

    if (!user_id || !game_id) {
      return res.status(400).json({ message: "กรุณาระบุ user_id และ game_id" });
    }

    // ตรวจสอบว่าเกมนี้เคยถูกซื้อแล้วหรือยัง
    const [boughtRows] = await conn.query<any[]>(
      `
      SELECT G_buy_item.game_id 
      FROM G_buy_item 
      INNER JOIN G_buy ON G_buy_item.buy_id = G_buy.buy_id 
      WHERE G_buy.user_id = ? AND G_buy_item.game_id = ?
      `,
      [user_id, game_id]
    );

    if (boughtRows.length > 0) {
      return res.status(201).json({ message: "คุณได้ซื้อเกมนี้ไปแล้ว" });
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


// สั่งซื้อเกม + หักเงิน + บันทึกประวัติธุรกรรม
router.post("/buyGame", async (req: Request, res: Response) => {
  const connection = await conn.getConnection();
  await connection.beginTransaction();

  try {
    const { user_id, cart_id, promotion_id = null, items, total_price } = req.body;

    /**
     * ตัวอย่าง ข้อมูลที่ส่งมา:
     * {
     *   "user_id": 1,
     *   "cart_id": 2,
     *   "promotion_id": null,
     *   "total_price": 599.00,
     *   "items": [
     *     { "game_id": 1, "game_price": 299.00 },
     *     { "game_id": 3, "game_price": 300.00 }
     *   ]
     * }
     */

    if (!user_id || !cart_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    }

    // 1. ตรวจสอบยอดเงินใน wallet ของ user
    const [userRows] = await connection.query<any[]>(
      `SELECT wallet FROM G_users WHERE user_id = ?`,
      [user_id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    const currentBalance = parseFloat(userRows[0].wallet);

    if (currentBalance < total_price) {
      return res.status(400).json({ message: "ยอดเงินใน Wallet ไม่เพียงพอ" });
    }

    // 2. เพิ่มข้อมูลการสั่งซื้อใน G_buy
    const [buyResult] = await connection.query<ResultSetHeader>(
      `
      INSERT INTO G_buy (user_id, promotion_id, total_price)
      VALUES (?, ?, ?)
      `,
      [user_id, promotion_id, total_price]
    );

    const buyId = buyResult.insertId;

    // 3. เพิ่มข้อมูลแต่ละเกมใน G_buy_item
    for (const item of items) {
      await connection.query(
        `
        INSERT INTO G_buy_item (buy_id, game_id, game_price)
        VALUES (?, ?, ?)
        `,
        [buyId, item.game_id, item.game_price]
      );

      // 4. อัปเดตยอดขายของเกม
      await connection.query(
        `UPDATE G_game SET purchase_count = purchase_count + 1 WHERE game_id = ?`,
        [item.game_id]
      );
    }

    // 5. หักเงินออกจาก wallet ของ user
    const newBalance = currentBalance - parseFloat(total_price);
    await connection.query(
      `UPDATE G_users SET wallet = ? WHERE user_id = ?`,
      [newBalance, user_id]
    );

    // 6. บันทึกประวัติธุรกรรมใน G_wallet_transactions
    await connection.query(
      `
      INSERT INTO G_wallet_transactions (user_id, amount, type, transaction_date)
      VALUES (?, ?, 'purchase', NOW())
      `,
      [user_id, -total_price] // เป็นลบเพราะเป็นการจ่ายเงิน
    );

    // 7. ลบเกมที่ซื้อแล้วออกจากตะกร้า
    for (const item of items) {
      await connection.query(
        `DELETE FROM G_cart_item WHERE cart_id = ? AND game_id = ?`,
        [cart_id, item.game_id]
      );
    }

     // 8. หัก limit_promotion ถ้ามีการใช้ promotion
    if (promotion_id !== null) {
      await connection.query(
        `
        UPDATE G_promotion
        SET limit_promotion = limit_promotion - 1
        WHERE promotion_id = ? AND limit_promotion > 0
        `,
        [promotion_id]
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: "สั่งซื้อสำเร็จ",
      buy_id: buyId,
      remaining_balance: newBalance,
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
router.delete("/delectCart/:cart_id/:game_id", async (req: Request, res: Response) => {
  try {
    const { cart_id, game_id } = req.params;

    const [result] = await conn.query<any>(
      "DELETE FROM G_cart_item WHERE cart_id = ? AND game_id = ?",
      [cart_id, game_id]
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


// โหลดโปรโมชั่นที่ผู้ใช้ยังไม่เคยใช้
router.get("/loadpromotion/:user_id", async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({ message: "กรุณาระบุ user_id" });
    }

    const [rows] = await conn.query<any[]>(
      `
      SELECT p.promotion_id, p.promotion_name, p.limit_promotion, 
             p.discount_value, p.promotion_date,discount_type 
      FROM G_promotion p
      WHERE p.promotion_id NOT IN (
        SELECT b.promotion_id 
        FROM G_buy b 
        WHERE b.user_id = ? AND b.promotion_id IS NOT NULL
      )
      AND (p.limit_promotion > 0 OR p.limit_promotion IS NULL)
      ORDER BY p.promotion_date DESC
      `,
      [user_id]
    );

    return res.status(200).json(rows);
  } catch (err) {
    console.error("Load promotion error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});
