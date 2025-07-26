document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.getElementById("flight-table-body");
  const loadingIndicator = document.getElementById("loading");
  const fallbackMessage = document.getElementById("fallback");

  const renderFlights = (flights) => {
    if (!flights.length) {
      fallbackMessage.textContent = "No flights available at the moment.";
      return;
    }

    flights.forEach((flight) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${flight.time}</td>
        <td>${flight.flight}</td>
        <td>${flight.origin}</td>
        <td>${flight.status}</td>
        <td>
          <button onclick="logCallTime('SS')">SS</button>
          <button onclick="logCallTime('BUS')">BUS</button>
        </td>
      `;

      tableBody.appendChild(row);
    });
  };

  const fetchFlights = async () => {
    try {
      const response = await fetch("/api/flights");
      const data = await response.json();
      loadingIndicator.style.display = "none";
      renderFlights(data);
    } catch (error) {
      console.error("Error fetching flights:", error);
      loadingIndicator.textContent = "Failed to load data.";
    }
  };

  window.logCallTime = (type) => {
    const now = new Date().toLocaleTimeString();
    alert(`${type} call logged at ${now}`);
  };

  fetchFlights();
});
