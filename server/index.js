import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import flights from "./flights.json" assert { type: "json" };

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/api/flights", (req, res) => {
  res.json(flights);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
