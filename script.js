const SHEET_BASE = "https://sheets.livepolls.app/api/spreadsheets/a38d476f-d0b4-4200-b29c-1ad937b58868";
let currentUser = JSON.parse(localStorage.getItem("stilt:user")||"null");
let currentRow = null;

/* ---------------- API helpers ---------------- */
const apiGet  = sheet => fetch(`${SHEET_BASE}/${sheet}`).then(r=>r.json());
const apiPost = (sheet,data)=>fetch(`${SHEET_BASE}/${sheet}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify([data])});
const apiPut  = (sheet,row,data)=>fetch(`${SHEET_BASE}/${sheet}/${row}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
const uuid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2);

/* ---------------- Auth ---------------- */
function loginOrSignup(){
  const username=document.getElementById('username').value.trim();
  const password=document.getElementById('password').value.trim();
  if(!username||!password)return alert('Enter both fields');
  apiGet('users').then(users=>{
    const idx=users.findIndex(u=>u.username===username);
    if(idx>-1){
      const user=users[idx];
      if(user.password!==password)return alert('Wrong password');
      currentUser=user;currentRow=(user.__rowNum||idx+2);
      saveSession();
      route();
    }else{
      const newUser={
        "user id":uuid(),username,"display name":username,password,votes:"[]",friends:"[]",sharing:"Share votes to friends",notify:"true"};
      apiPost('users',newUser).then(()=>apiGet('users')).then(u=>{
        const row=u.find(r=>r.username===username);
        currentUser=row;currentRow=(row.__rowNum||u.indexOf(row)+2);
        saveSession();route();
      });
    }
  });
}
function saveSession(){localStorage.setItem('stilt:user',JSON.stringify(currentUser));}
function logout(){localStorage.removeItem('stilt:user');currentUser=null;location.hash='home';route();}

/* ---------------- Routing ---------------- */
window.addEventListener('hashchange',route);
function route(){if(!currentUser){renderAuth();return;}const page=location.hash.slice(1)||'home';
  if(page==='profile')renderProfile();
  else if(page==='settings')renderSettings();
  else renderHome();}

document.addEventListener('DOMContentLoaded',()=>{if(location.pathname.endsWith('activity.html')){switchTab('questions');}else{route();}});

/* ---------------- Renderers ---------------- */
function renderAuth(){document.getElementById('app').innerHTML=`<div id="auth"><h2>Login or Signup</h2><input id="username" placeholder="Username"><input id="password" type="password" placeholder="Password"><button onclick="loginOrSignup()">Go</button></div>`;}

function renderHome(){const app=document.getElementById('app');
  apiGet('debates').then(debates=>{
    apiGet('users').then(users=>{
      const others=users.filter(u=>u.username!==currentUser.username);
      const friendSet=new Set(JSON.parse(currentUser.friends||'[]'));
      const pendingToMe=[];const sentByMe=[];
      apiGet('requests').then(reqs=>{
        reqs.forEach(r=>{if(r.to_username===currentUser.username&&r.status==='pending')pendingToMe.push(r);if(r.from_username===currentUser.username&&r.status==='pending')sentByMe.push(r);});
        app.innerHTML=`<h2>Welcome, ${currentUser.username}</h2>
          <button onclick="logout()">Logout</button>
          <h3>Debates</h3>`+
          debates.map(d=>renderDebateCard(d)).join('')+
          `<h3>Users</h3>`+
          others.map(u=>renderUserCard(u,friendSet,pendingToMe,sentByMe)).join('');
      });
    });
  });}

function renderDebateCard(d){const opts=d.options?.split(',').map(o=>o.trim())||[];
  const userVotes=JSON.parse(currentUser.votes||'[]');
  const myVote=userVotes.find(v=>v.debateId===d["debate id"]);
  return `<div class="card"><h4>${d.question}</h4><p>${d.description||''}</p>${opts.map(o=>`<button onclick="castVote('${d["debate id"]}','${o}')">${o}</button>`).join(' ')}${myVote?`<p class='friend-status'>You voted: ${myVote.option}</p>`:''}</div>`;}

function renderUserCard(u,friendSet,pendingToMe,sentByMe){
  const isFriend=friendSet.has(u.username);
  const pending=pendingToMe.find(r=>r.from_username===u.username)||sentByMe.find(r=>r.to_username===u.username);
  let action='';
  if(isFriend)action='<span class="friend-status">Friend✓</span>';
  else if(pending&&pending.from_username===currentUser.username)action='<span class="friend-status">Request Sent</span>';
  else if(pending)action=`<button onclick="acceptFriend('${pending.__rowNum||pending.rowIndex||''}','${u.username}')">Accept</button>`;
  else action=`<button onclick="sendFriendRequest('${u.username}')">Add Friend</button>`;
  return `<div class="card"><strong>${u["display name"]||u.username}</strong>${action}</div>`;}

function renderProfile(){const app=document.getElementById('app');
  const votes=JSON.parse(currentUser.votes||'[]').sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
  apiGet('debates').then(debates=>{
    const map=Object.fromEntries(debates.map(d=>[d["debate id"],d.question]));
    app.innerHTML=`<h2>Your Profile</h2><button onclick="location.hash='home'">Back</button><h3>Votes</h3>`+
      (votes.length?`<ul>${votes.map(v=>`<li>${map[v.debateId]||v.debateId}: ${v.option}</li>`).join('')}</ul>`:'<p>No votes yet.</p>');
  });}

function renderSettings(){const app=document.getElementById('app');
  app.innerHTML=`<h2>Settings</h2><button onclick="location.hash='home'">Back</button><label>Sharing<select id='shareSel'><option>Share votes to everyone</option><option>Share votes to friends</option><option>Don't share votes</option></select></label><label><input type='checkbox' id='notifyChk'> Notify on friends votes</label><button onclick='saveSettings()'>Save</button>`;
  document.getElementById('shareSel').value=currentUser.sharing;
  document.getElementById('notifyChk').checked=currentUser.notify!=='false';}
function saveSettings(){currentUser.sharing=document.getElementById('shareSel').value;currentUser.notify=document.getElementById('notifyChk').checked?'true':'false';apiPut('users',currentRow,{sharing:currentUser.sharing,notify:currentUser.notify});saveSession();alert('Saved');location.hash='home';}

/* ---------------- Votes ---------------- */
function castVote(debateId,option){const votes=JSON.parse(currentUser.votes||'[]');const timestamp=Date.now();const existing=votes.find(v=>v.debateId===debateId);if(existing){existing.option=option;existing.timestamp=timestamp;}else{votes.push({debateId,option,timestamp});}currentUser.votes=JSON.stringify(votes);apiPut('users',currentRow,{votes:currentUser.votes});saveSession();route();}

/* ---------------- Friend requests ---------------- */
function sendFriendRequest(to){apiPost('requests',{from_username:currentUser.username,to_username:to,status:'pending',timestamp:Date.now()}).then(()=>route());}
function acceptFriend(rowId,fromUser){const friends=JSON.parse(currentUser.friends||'[]');friends.push(fromUser);currentUser.friends=JSON.stringify(friends);apiPut('users',currentRow,{friends:currentUser.friends});
  // update other user
  apiGet('users').then(users=>{const other=users.find(u=>u.username===fromUser);if(other){const otherRow=(other.__rowNum||users.indexOf(other)+2);const ofriends=JSON.parse(other.friends||'[]');ofriends.push(currentUser.username);apiPut('users',otherRow,{friends:JSON.stringify(ofriends)});}apiPut('requests',rowId,{status:'accepted'}).then(()=>route());});}

/* ---------------- Activity page ---------------- */
function switchTab(tab){
  const container = document.getElementById('activity-content');
  if (!container) return;

  if (tab === 'questions') {
    apiGet('debates').then(debates => {
      container.innerHTML = debates.map(d =>
        `<div class='card'><h3>${d.question}</h3><p>${d.description || ''}</p></div>`
      ).join('');
    });
  } else {
    Promise.all([apiGet('users'), apiGet('debates')]).then(([users, debates]) => {
      const map = Object.fromEntries(debates.map(d => [d['debate id'], d.question]));
      const friends = JSON.parse(currentUser.friends || '[]');

      const visibleUsers = users.filter(u =>
        friends.includes(u.username) && u.sharing !== "Don't share votes"
      );

      const html = visibleUsers.map(u => {
        const votes = JSON.parse(u.votes || '[]').sort((a, b) =>
          (b.timestamp || 0) - (a.timestamp || 0)
        );
        if (!votes.length) return '';
        return `<div class='card'><h4>${u['display name']}</h4><ul>${
          votes.slice(0, 5).map(v =>
            `<li>${map[v.debateId] || v.debateId}: ${v.option}</li>`
          ).join('')
        }</ul></div>`;
      }).filter(Boolean).join('');

      container.innerHTML = html || '<p>No friend votes.</p>';
    });
  }
}

/* Ensure logout link visible? not needed here */
