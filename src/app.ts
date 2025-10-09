import express from "express";
import cors from "cors";
import { router as index } from "./api/index"; 
import { router as user } from "./api/user"; 
import { router as card } from "./api/card";

export const app = express();
app.use(cors());

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.use("/", user);
app.use("/game", index);
app.use("/cart", card);

// app.use("/", (req, res) => {
//   res.send("Hello World!!!");
// });