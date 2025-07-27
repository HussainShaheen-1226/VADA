const backendUrl = "https://vada-2db9.onrender.com"; // ✅ Your actual backend URL

async function fetchFlights() {
  const loading = document.getElementById("loading");
  const tableBody = document.getElementById("flight-table-body");
  const noFlights = document.getElementById("no-flights");

  loading.style.display = "block";
  tableBody.innerHTML = "";
  noFlights.style.display = "none";

  try {
    const response = await fetch(`${backendUrl}/flights`);
    const data = await response.json();
    loading.style.display = "none";

    if (!data || data.length === 0) {
      noFlights.style.display = "block";
      return;
    }

    data.forEach((flight, index) => {
      const row = document.createElement("tr");

      const flightCell = document.createElement("td");
      flightCell.textContent = flight.flight;
      row.appendChild(flightCell);

      const fromCell = document.createElement("td");
      fromCell.textContent = flight.from;
      row.appendChild(fromCell);

      const timeCell = document.createElement("td");
      timeCell.textContent = flight.time;
      row.appendChild(timeCell);

      const statusCell = document.createElement("td");
      statusCell.textContent = flight.status;
      row.appendChild(statusCell);

      const ssCell = document.createElement("td");
      const ssButton = document.createElement("button");
      ssButton.textContent = "SS";
      ssButton.className = "ss-button";
      ssButton.onclick = () => handleCallClick("SS", index);
      ssCell.appendChild(ssButton);
      row.appendChild(ssCell);

      const busCell = document.createElement("td");
      const busButton = document.createElement("button");
      busButton.textContent = "BUS";
      busButton.className = "bus-button";
      busButton.onclick = () => handleCallClick("BUS", index);
      busCell.appendChild(busButton);
      row.appendChild(busCell);

      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error("Error fetching flight data:", error);
    loading.style.display = "none";
    noFlights.style.display = "block";
  }
}

function handleCallClick(type, index) {
  const timestamp = new Date().toLocaleTimeString();
  const userId = localStorage.getItem("userId") || "Unknown";
  alert(`${type} button clicked for row ${index + 1} at ${timestamp} by ${userId}`);
}

window.onload = function () {
  const storedId = localStorage.getItem("userId");
  const lastPrompt = localStorage.getItem("lastPrompt");
  const twoWeeks = 1000 * 60 * 60 * 24 * 14;

  if (!storedId || !lastPrompt || Date.now() - parseInt(lastPrompt) > twoWeeks) {
    const userId = prompt("Enter your user ID:");
    if (userId) {
      localStorage.setItem("userId", userId);
      localStorage.setItem("lastPrompt", Date.now().toString());
    }
  }

  fetchFlights();
};
