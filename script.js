const SHEET_BASE = "https://sheets.livepolls.app/api/spreadsheets/a38d476f-d0b4-4200-b29c-1ad937b58868";

function apiGet(sheet) {
  return fetch(`${SHEET_BASE}/${sheet}`)
    .then(res => res.json());
}

function renderHome() {
  const app = document.getElementById("app");
  if (!app) return;
  apiGet("debates").then(debates => {
    app.innerHTML = debates.map(d => `
      <div class="card">
        <h2>${d.question}</h2>
        <p>${d.description || ""}</p>
      </div>
    `).join("");
  });
}

function switchTab(tab) {
  const container = document.getElementById("activity-content");
  if (!container) return;
  if (tab === "questions") {
    apiGet("debates").then(debates => {
      container.innerHTML = debates.map(d => `
        <div class="card">
          <h3>${d.question}</h3>
          <p>${d.description || ""}</p>
        </div>
      `).join("");
    });
  } else {
    Promise.all([apiGet("users"), apiGet("debates")]).then(([users, debates]) => {
      const map = Object.fromEntries(debates.map(d => [d["debate id"], d.question]));
      const content = users.map(u => {
        if (u.sharing === "Don't share votes") return "";
        if (!u.votes || u.votes === "[]") return "";
        const votes = JSON.parse(u.votes || "[]");
        const show = (u.sharing === "Share votes to everyone");
        return show ? `
          <div class="card">
            <h3>${u["display name"]}</h3>
            <ul>
              ${votes.map(v => `<li>${map[v.debateId] || v.debateId}: ${v.option}</li>`).join("")}
            </ul>
          </div>
        ` : "";
      }).join("");
      container.innerHTML = content || "<p>No votes shared.</p>";
    });
  }
}

// Auto-run home if index.html
if (location.pathname.endsWith("index.html") || location.pathname === "/") {
  renderHome();
}

// Auto-load questions by default on activity.html
if (location.pathname.endsWith("activity.html")) {
  switchTab("questions");
} 
