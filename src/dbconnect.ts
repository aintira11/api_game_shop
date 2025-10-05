import mysql from "mysql2/promise";

export const conn = mysql.createPool(
    {
        connectionLimit: 10,
        host: "202.28.34.203",
        user: "mb68_65011212063",
        password: "Z9eeE4q&!ax#",
        database: "mb68_65011212063",
         waitForConnections: true,
    }
);
