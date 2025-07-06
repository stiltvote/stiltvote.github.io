const SHEET_BASE = "https://sheets.livepolls.app/api/spreadsheets/a38d476f-d0b4-4200-b29c-1ad937b58868";
let currentUser = null;

function apiGet(sheet) {
  return fetch(`${SHEET_BASE}/${sheet}`)
    .then(res => res.json());
}

function apiPost(sheet, data) {
  return fetch(`${SHEET_BASE}/${sheet}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([data])
  });
}

function apiPut(sheet, rowId, data) {
  return fetch(`${SHEET_BASE}/${sheet}/${rowId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
}

function loginOrSignup() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!username || !password) return alert("Enter both fields");

  apiGet("users").then(users => {
    const user = users.find(u => u.username === username);
    if (user) {
      if (user.password !== password) return alert("Wrong password");
      currentUser = user;
      renderHome();
    } else {
      const newUser = {
        username,
        "display name": username,
        password,
        votes: "[]",
        friends: "[]",
        sharing: "Share votes to friends",
        notify: "true"
      };
      apiPost("users", newUser).then(() => {
        currentUser = newUser;
        renderHome();
      });
    }
  });
}

function renderHome() {
  const app = document.getElementById("app");
  if (!app || !currentUser) return;
  apiGet("debates").then(debates => {
    app.innerHTML = `<h2>Welcome, ${currentUser.username}</h2>` + debates.map(d => {
      const options = d.options?.split(',').map(o => `<button onclick="castVote('${d["debate id"]}', '${o.trim()}')">${o.trim()}</button>`).join(" ") || "";
      return `
        <div class="card">
          <h3>${d.question}</h3>
          <p>${d.description || ""}</p>
          <div>${options}</div>
        </div>
      `;
    }).join("");
  });
}

function castVote(debateId, option) {
  const votes = JSON.parse(currentUser.votes || "[]");
  const timestamp = Date.now();
  const existing = votes.find(v => v.debateId === debateId);
  if (existing) {
    existing.option = option;
    existing.timestamp = timestamp;
  } else {
    votes.push({ debateId, option, timestamp });
  }
  currentUser.votes = JSON.stringify(votes);
  apiPut("users", currentUser.rowNumber, { votes: currentUser.votes });
  alert("Vote submitted!");
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

// Auto-load home if already logged in
if ((location.pathname.endsWith("index.html") || location.pathname === "/") && currentUser) {
  renderHome();
}

if (location.pathname.endsWith("activity.html")) {
  switchTab("questions");
} 
