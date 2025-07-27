const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const flights = JSON.parse(fs.readFileSync(path.join(__dirname, "flights.json")));

app.get("/flights", (req, res) => {
  res.json(flights);
});

app.post("/flights/update", (req, res) => {
  const { id, type, time, user } = req.body;

  const flight = flights.find((f) => f.id === id);
  if (!flight) {
    return res.status(404).json({ error: "Flight not found" });
  }

  if (type === "ss") {
    flight.ssTime = time;
    flight.ssUser = user;
  } else if (type === "bus") {
    flight.busTime = time;
    flight.busUser = user;
  } else {
    return res.status(400).json({ error: "Invalid update type" });
  }

  fs.writeFileSync(path.join(__dirname, "flights.json"), JSON.stringify(flights, null, 2));
  res.json({ message: "Flight updated successfully" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
