const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

app.get("/flights", async (req, res) => {
  try {
    const url =
      "https://www.fis.com.mv/index.php?Submit=+UPDATE+&webfids_airline=ALL&webfids_domesticinternational=D&webfids_lang=1&webfids_passengercargo=passenger&webfids_type=arrivals&webfids_waypoint=ALL";

    const response = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = cheerio.load(response.data);
    const rows = $("tr.schedulerow, tr.schedulerowtwo");
    const flights = [];

    rows.each((i, row) => {
      const cols = $(row).find("td");
      if (cols.length >= 5) {
        flights.push({
          flight: $(cols[1]).text().trim(),
          origin: $(cols[2]).text().trim(),
          scheduledTime: $(cols[3]).text().trim(),
          estimatedTime: $(cols[4]).text().trim(),
          status: $(cols[5]).text().trim(),
          ss: '+960 3 33 7100',
          bus: '+960 3 33 7253'
        });
      }
    });

    res.json(flights);
  } catch (error) {
    console.error("Failed to fetch flights:", error.message);
    res.status(500).json({ error: "Flight data unavailable." });
  }
});

app.listen(PORT, () => {
  console.log(`VADA backend running at http://localhost:${PORT}`);
});
