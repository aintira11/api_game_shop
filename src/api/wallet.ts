import express, { Request, Response } from "express";
import { conn } from "../dbconnect";
import bcrypt from "bcrypt";
import { ResultSetHeader } from "mysql2"; // สำหรับ insert result type
export const router = express.Router();

// แสดงประวัติการเงินเข้า-ออก และ ประวัติการซื้อเกมของผู้ใช้
router.get("/user/transactions/:user_id", async (req: Request, res: Response) => {
  const { user_id } = req.params;

  try {
    // 1. ดึงธุรกรรมทั้งหมดของผู้ใช้
    const [transactions] = await conn.query<any[]>(`
      SELECT 
        t.transaction_id,
        t.amount,
        t.type,
        t.transaction_date
      FROM G_wallet_transactions t
      WHERE t.user_id = ?
      ORDER BY t.transaction_date DESC
    `, [user_id]);

    if (transactions.length === 0) {
      return res.status(200).json({ message: "ไม่มีประวัติธุรกรรม", transactions: [] });
    }

    // 2. ดึงเฉพาะธุรกรรมที่เป็นการซื้อเกม
    const purchaseTransactions = transactions.filter(t => t.type === "purchase");

    if (purchaseTransactions.length > 0) {
      //  ดึงข้อมูลบิลการซื้อพร้อมโปรโมชั่น (เชื่อมกับ G_promotion)
      const [buyData] = await conn.query<any[]>(`
        SELECT 
          b.buy_id,
          b.user_id,
          b.total_price,
          b.buy_date,
          b.promotion_id,
          p.promotion_name,
          p.discount_value
        FROM G_buy b
        LEFT JOIN G_promotion p ON b.promotion_id = p.promotion_id
        WHERE b.user_id = ?
        ORDER BY b.buy_date DESC
      `, [user_id]);

      //  ดึงรายการเกมในแต่ละบิล
      const buyIds = buyData.map(b => b.buy_id);
      let gameDetails: any[] = [];

      if (buyIds.length > 0) {
        const [rows] = await conn.query<any[]>(`
          SELECT 
            i.buy_id,
            g.game_id,
            g.game_name,
            i.game_price
          FROM G_buy_item i
          JOIN G_game g ON i.game_id = g.game_id
          WHERE i.buy_id IN (?)
        `, [buyIds]);
        gameDetails = rows;
      }

      //  รวมข้อมูลเข้าใน transaction แต่ละอัน
      for (const tx of transactions) {
        if (tx.type === "purchase") {
          // จับคู่กับบิลซื้อที่ใกล้เคียงที่สุดตามเวลา
          const relatedBuy = buyData.find(
            b => new Date(b.buy_date).getTime() <= new Date(tx.transaction_date).getTime()
          );

          if (relatedBuy) {
            tx.total_price = relatedBuy.total_price;
            tx.buy_date = relatedBuy.buy_date;
            tx.promotion = relatedBuy.promotion_name
              ? {
                  name: relatedBuy.promotion_name,
                  discount_value: relatedBuy.discount_value,
                }
              : null;

            tx.games = gameDetails.filter(g => g.buy_id === relatedBuy.buy_id);
          } else {
            tx.promotion = null;
            tx.games = [];
          }
        } else {
          tx.promotion = null;
          tx.games = [];
        }
      }
    }

    return res.status(200).json({ transactions });

  } catch (err) {
    console.error("Transaction fetch error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});


// เติมเงิน (ป้องกัน race condition)
router.post("/wallet/deposit", async (req: Request, res: Response) => {
  //“ขอ connection ส่วนตัว” จาก connection pool ของ MySQL (ไม่ใช่ connection ร่วมกับ request อื่น)
  const connection = await conn.getConnection();
  await connection.beginTransaction();

  try {
    const { user_id, amount } = req.body;

    if (!user_id || !amount || amount <= 0) {
      return res.status(400).json({ message: "กรุณาระบุ user_id และจำนวนเงินที่ถูกต้อง" });
    }

    //  1. ดึงข้อมูลพร้อมล็อกแถว
    //ใช้ SELECT ... FOR UPDATE Database จะ “ล็อก row” ของ user_id นั้นไว้ จนกว่า commit หรือ rollback จะเสร็จ
    const [userRows] = await connection.query<any[]>(
      "SELECT wallet FROM G_users WHERE user_id = ? FOR UPDATE",
      [user_id]
    );

    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบผู้ใช้นี้" });
    }

    const currentBalance = parseFloat(userRows[0].wallet || 0);
    const newBalance = currentBalance + parseFloat(amount);

    //  2. อัปเดตยอดเงิน
    await connection.query(
      "UPDATE G_users SET wallet = ? WHERE user_id = ?",
      [newBalance, user_id]
    );

    //  3. บันทึกประวัติการทำธุรกรรม
    await connection.query(
      `
      INSERT INTO G_wallet_transactions (user_id, amount, type, transaction_date)
      VALUES (?, ?, 'deposit', NOW())
      `,
      [user_id, amount]
    );

    await connection.commit();

    return res.status(201).json({
      message: "เติมเงินสำเร็จ",
      wallet_balance: newBalance,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Deposit error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  } finally {
    connection.release();
  }
});



// ดึงข้อมูลผู้ใช้ (ไม่รวมรหัสผ่าน)
router.get("/user/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // ตรวจสอบว่ามี id ไหม
    if (!id) {
      return res.status(400).json({ message: "กรุณาระบุ user_id" });
    }

    // ดึงข้อมูลผู้ใช้
    const [rows] = await conn.query<any[]>(
      `
      SELECT 
        user_id,
        username,
        email,
        wallet,
        profile,
        user_type
      FROM G_users
      WHERE user_id = ?
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    // ส่งข้อมูลกลับ
    return res.status(200).json(rows[0]);

  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// แสดงข้อมูลสมาชิกทั้งหมด
router.get("/allusers", async (req: Request, res: Response) => {
  try {
    const [rows] = await conn.query<any[]>(
      `
      SELECT 
        user_id,
        username,
        email,
        wallet,
        profile,
        user_type
      FROM G_users
      WHERE user_type = 'normal'
      `
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    // ส่งข้อมูลผู้ใช้ทั้งหมดกลับ
    return res.status(200).json(rows);

  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
});
