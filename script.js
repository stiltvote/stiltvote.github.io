/* ------------- CONFIG ------------- */
const SHEET_BASE =
  "https://sheets.livepolls.app/api/spreadsheets/a38d476f-d0b4-4200-b29c-1ad937b58868";
const USERS    = `${SHEET_BASE}/users`;
const DEBATES  = `${SHEET_BASE}/debates`;
const REQUESTS = `${SHEET_BASE}/requests`;

/* ------------- GLOBAL STATE ------------- */
let currentUser = JSON.parse(localStorage.getItem("stilt:user") || "null");

/* ------------- HELPERS ------------- */
const j = JSON.stringify;
const h = (p) => document.querySelector(p);
const post  = (url,data) => fetch(url,{method:"POST",headers:{'content-type':'application/json'},body:j([data])}).then(r=>r.json());
const put   = (url,data) => fetch(url,{method:"PUT",headers:{'content-type':'application/json'},body:j(data)}).then(r=>r.json());
const get = async (url) => {
  const res = await fetch(url);
  const json = await res.json();
  return Array.isArray(json) ? json : json.data;
};

// Safe JSON utility – returns fallback if parse fails
function safeJSON(str, fallback = []) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}



function genId() { return Date.now().toString(36); }

/* ------------- AUTH ------------- */
async function signUp(e){
  e.preventDefault();
  const f   = new FormData(e.target);
  const all = await get(USERS);               // ensure unique username
  if (all.find(u=>u.username===f.get("username")))
    return alert("Username taken");
  const id  = genId();
  const user = {
    "user id": id,
    username : f.get("username"),
    "display name": f.get("display"),
    password : btoa(f.get("password")),       // super‑light “hash”
    votes    : "[]",
    "ai summary": "",
    friends  : "[]",
    sharing  : "everyone",
    notify   : "true"
  };
  await post(USERS,user);
  currentUser = user;
  localStorage.setItem("stilt:user",j(user));
  location.reload();
}

async function logIn(e){
  e.preventDefault();
  const f   = new FormData(e.target);
  const all = await get(USERS);
  const u   = all.find(u=>u.username===f.get("username") && atob(u.password)===f.get("password"));
  if(!u) return alert("Invalid credentials");
  currentUser = u;
  localStorage.setItem("stilt:user",j(u));
  location.reload();
}

function logOut(){
  localStorage.removeItem("stilt:user");
  currentUser=null; location.reload();
}

/* ------------- UI SETUP ------------- */
function byId(id){return document.getElementById(id);}
function initUI(){
  const navAuth = byId("nav-auth"), navUser = byId("nav-user");
  if(currentUser){
    navAuth.classList.add("hidden");
    navUser.classList.remove("hidden");
    byId("welcome").textContent = `Hi, ${currentUser["display name"]}!`;
    /* settings defaults */
    byId("form-settings").sharing.value = currentUser.sharing||"everyone";
    byId("form-settings").notify.checked= currentUser.notify!=="false";
  }else{
    navAuth.classList.remove("hidden");
    navUser.classList.add("hidden");
  }
  /* toggle screens */
  const show = id=>{
    ["screen-login","screen-signup"].forEach(x=>byId(x)?.classList.toggle("hidden",x!==id));
  };
  byId("btn-login-view") .onclick=()=>show("screen-login");
  byId("btn-signup-view").onclick=()=>show("screen-signup");
  byId("btn-logout")?.addEventListener("click",logOut);
  if(currentUser) byId("app").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", ()=>{
  initUI();
  /* bind forms */
  byId("form-signup")?.addEventListener("submit",signUp);
  byId("form-login") ?.addEventListener("submit",logIn);
  byId("form-debate")?.addEventListener("submit",createDebate);
  byId("form-settings")?.addEventListener("submit",saveSettings);
  loadDebates();
});

/* ------------- DEBATES + VOTING ------------- */
async function createDebate(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const debate = {
    "debate id": genId(),
    question   : f.get("question"),
    description: f.get("description"),
    options    : j(f.get("options").split(",").map(x=>x.trim())),
    category   : f.get("category"),
    topic      : f.get("topic")
  };
  await post(DEBATES,debate);
  e.target.reset();
  loadDebates();
}

/* render list */
async function loadDebates(){
  if(!currentUser) return;
  const list = byId("debate-list");
  list.innerHTML="";
  const debates = await get(DEBATES);
  debates.forEach(d=>{
    const li=document.createElement("li");
    li.innerHTML = `
      <strong>${d.question}</strong><br/>
      ${d.description || ""}<br/>
      ${safeJSON(d.options).map(o => `
        <label><input type="radio" name="v-${d["debate id"]}" value="${o}"/>${o}</label>
      `).join(" ")}
      <button data-id="${d["debate id"]}">Vote</button>
      <div class="results" style="margin-top:1rem;color:var(--accent)"></div>
    `;
    li.setAttribute("data-id", d["debate id"]);
    li.querySelector("button").onclick=voteHandler;
    list.appendChild(li);
    showResults(d["debate id"]);
  });
}

async function voteHandler(e) {
  const debateId = e.target.dataset.id;
  const radio = document.querySelector(`input[name="v-${debateId}"]:checked`);
  if (!radio) return alert("Pick an option");
  const choice = radio.value;
  const now = new Date().toISOString();

  // Update current user's votes
  const votes = safeJSON(currentUser.votes);
  const existing = votes.find(v => v.id === debateId);
  if (existing) { existing.choice = choice; existing.time = now; }
  else votes.push({ id: debateId, choice, time: now });
  currentUser.votes = j(votes);
  await put(`${USERS}/${currentUser["user id"]}`, currentUser);
  localStorage.setItem("stilt:user", j(currentUser));

  // Refresh live percentages
  showResults(debateId);
}

async function showResults(debateId) {
  const [users, debates] = await Promise.all([get(USERS), get(DEBATES)]);
  const debate = debates.find(d => d["debate id"] === debateId);
  if (!debate) return;

  const options = safeJSON(debate.options);
  const counts = {};
  options.forEach(o => counts[o] = 0);

  users.forEach(u => {
    const uvotes = safeJSON(u.votes);
    const v = uvotes.find(v => v.id === debateId);
    if (v && counts[v.choice] !== undefined) {
      counts[v.choice]++;
    }
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const li = document.querySelector(`li[data-id="${debateId}"]`);
  const resultBox = li?.querySelector(".results");
  if (!resultBox) return;

  resultBox.innerHTML = options.map(opt => {
    const pct = total ? Math.round((counts[opt] / total) * 100) : 0;
    return `<div><strong>${opt}</strong>: ${pct}% (${counts[opt]} votes)</div>`;
  }).join("");
}


/* ------------- SETTINGS ------------- */
function saveSettings(e){
  e.preventDefault();
  const f = new FormData(e.target);
  currentUser.sharing = f.get("sharing");
  currentUser.notify  = f.get("notify") ? "true":"false";
  put(`${USERS}/${currentUser["user id"]}`,currentUser);
  localStorage.setItem("stilt:user",j(currentUser));
  e.target.closest("dialog").close();
}

byId("btn-settings")?.addEventListener("click",()=>byId("dlg-settings").showModal());

/* ------------- ACTIVITY PAGE ------------- */
async function initActivity(){
  if(!currentUser){ return location.href="index.html"; }
  const qTab = byId("tab-questions"), fTab = byId("tab-friends");
  const qs   = byId("list-questions"), fs = byId("list-friends");
  qTab.onclick = ()=>{swap(qTab,fTab,qs,fs);};
  fTab.onclick = ()=>{swap(fTab,qTab,fs,qs);};
  function swap(a,b,x,y){a.classList.add("active");b.classList.remove("active");x.classList.remove("hidden");y.classList.add("hidden");}
  /* initial load + polling */
  await loadActivity(qs,fs);
  setInterval(()=>loadActivity(qs,fs),30_000);
}

async function loadActivity(qsEl,fsEl){
  const [debates, users] = await Promise.all([get(DEBATES), get(USERS)]);
  /* new questions list */
  qsEl.innerHTML = debates.slice(-25).reverse().map(d=>`
      <li><strong>${d.question}</strong> – ${new Date(parseInt(d["debate id"],36)).toLocaleString()}</li>
  `).join("");

  /* friends' votes list */
  const friends = JSON.parse(currentUser.friends||"[]");
  fsEl.innerHTML = "";
  if(currentUser.notify==="false"){ fsEl.innerHTML="<em>Notifications off</em>"; return; }
  users.filter(u=>friends.includes(u["user id"]) && u.sharing!=="none").forEach(f=>{
      JSON.parse(f.votes||"[]").forEach(v=>{
        const debate = debates.find(d=>d["debate id"]===v.id);
        if(!debate) return;
        if(f.sharing==="friends" || f.sharing==="everyone"){
          const li=document.createElement("li");
          li.innerHTML=`<strong>${f["display name"]}</strong> voted <em>${v.choice}</em> on “${debate.question}” <small>${new Date(v.time).toLocaleString()}</small>`;
          fsEl.appendChild(li);
        }
      });
  });
}
