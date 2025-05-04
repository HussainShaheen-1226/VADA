app.get('/api/flights', async (req, res) => {
  try {
    const client = new Actor({ token: process.env.APIFY_API_TOKEN });
    console.log("Initialized Apify client");

    const run = await client.actor('hussainshaheen-1226~vada-fis-scraping').call();
    console.log("Actor run result:", run);

    const { defaultDatasetId } = run;
    const dataset = await client.dataset(defaultDatasetId).listItems();
    console.log("Dataset items:", dataset);

    res.json(dataset.items);
  } catch (error) {
    console.error("Error fetching flight data:", error);
    res.status(500).json({ error: "Failed to fetch flight data" });
  }
});
