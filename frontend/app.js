/* ============================================================
   CONFIG  (master key is SERVER-ONLY — never in this file)
   ============================================================ */
const POPIA_VERSION = '1.0';
const TOS_VERSION = '1.0';
const APP_VERSION = '2.3.0';
const API_BASE = ''; // same origin when served by the SafeMesh server

const RESPONDER_JOBS = [
  'Police Officer', 'Paramedic', 'Firefighter', 'Community Watch',
  'Private Security', 'Trauma Counsellor', 'Nurse', 'Other'
];
const ON_DUTY_RADIUS_OPTIONS = [2, 5, 10, 25];

/* ============================================================
   API CLIENT (talks to the Node backend)
   ============================================================ */
function getToken() {
  try { return localStorage.getItem('sm_token') || ''; } catch { return ''; }
}
function setToken(t) {
  try {
    if (t) localStorage.setItem('sm_token', t);
    else localStorage.removeItem('sm_token');
  } catch {}
}

/* Guests have no account, so the server gives each guest alert a secret key (only a hash is stored there).
   Keeping it here is what allows the guest — and nobody else — to stand the alert down or add evidence. */
function guestKeys() { try { return JSON.parse(localStorage.getItem('sm_guest_keys') || '{}'); } catch { return {}; } }
function saveGuestKey(id, key) {
  const m = guestKeys(); m[id] = key;
  const ids = Object.keys(m); if (ids.length > 30) delete m[ids[0]];
  try { localStorage.setItem('sm_guest_keys', JSON.stringify(m)); } catch {}
}
function guestKeyFor(id) { return id ? (guestKeys()[id] || '') : ''; }

async function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Accept': 'application/json' }, options.headers || {});
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(API_BASE + path, { ...options, headers });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  async register(body) { return apiFetch('/api/auth/register', { method: 'POST', body }); },
  async login(body) { return apiFetch('/api/auth/login', { method: 'POST', body }); },
  async forgotRequest(body) { return apiFetch('/api/auth/forgot/request', { method: 'POST', body }); },
  async forgotConfirm(body) { return apiFetch('/api/auth/forgot/confirm', { method: 'POST', body }); },
  async changePassword(body) { return apiFetch('/api/auth/change-password', { method: 'POST', body }); },
  async me() { return apiFetch('/api/auth/me'); },
  async listAccounts() { return apiFetch('/api/accounts'); },
  async approveResponder(email, vetting) { return apiFetch('/api/accounts/' + encodeURIComponent(email) + '/approve-responder', { method: 'POST', body: vetting || {} }); },
  async revetResponder(email, vetting) { return apiFetch('/api/accounts/' + encodeURIComponent(email) + '/revet', { method: 'POST', body: vetting || {} }); },
  async rejectResponder(email) { return apiFetch('/api/accounts/' + encodeURIComponent(email) + '/reject-responder', { method: 'POST', body: {} }); },
  async revokeResponder(email) { return apiFetch('/api/accounts/' + encodeURIComponent(email) + '/revoke-responder', { method: 'POST', body: {} }); },
  async setAcctStatus(email, status) { return apiFetch('/api/accounts/' + encodeURIComponent(email) + '/set-status', { method: 'POST', body: { status } }); },
  async adminResetPassword(email, newPassword) { return apiFetch('/api/accounts/' + encodeURIComponent(email) + '/reset-password', { method: 'POST', body: { newPassword } }); },
  async applyAsResponder(body) { return apiFetch('/api/accounts/apply-responder', { method: 'POST', body }); },
  async listProfessionals() { return apiFetch('/api/professionals'); },
  async toggleAccepting() { return apiFetch('/api/accounts/accepting', { method: 'POST', body: {} }); },
  async listIncidents(params = {}) {
    const q = new URLSearchParams(params).toString();
    // guests (and anonymous reporters) prove they own an alert with its secret key; the server never lists other people's alerts
    const keys = Object.values(guestKeys());
    return apiFetch('/api/incidents' + (q ? '?' + q : ''), { headers: keys.length ? { 'X-Guest-Keys': keys.join(',') } : {} });
  },
  async createIncident(incident) {
    const r = await apiFetch('/api/incidents', { method: 'POST', body: incident });
    if (r && r.guestKey && r.incident) saveGuestKey(r.incident.id, r.guestKey);   // lets a guest stand down / update their own alert later
    return r;
  },
  async updateIncident(id, patch) {
    const k = guestKeyFor(id);
    return apiFetch('/api/incidents/' + id, { method: 'PATCH', body: patch, headers: k ? { 'X-Guest-Key': k } : {} });
  },
  async uploadEvidence(formData, incidentId) {
    const k = guestKeyFor(incidentId);
    return apiFetch('/api/evidence', { method: 'POST', body: formData, headers: k ? { 'X-Guest-Key': k } : {} });
  },
  async deleteIncident(id) { return apiFetch('/api/incidents/' + id, { method: 'DELETE' }); },
  async getBulletin(town, province) {
    return apiFetch('/api/bulletins?town=' + encodeURIComponent(town) + '&province=' + encodeURIComponent(province));
  },
  async getBulletins() { return apiFetch('/api/bulletins'); },
  async createBulletin(data) { return apiFetch('/api/bulletins', { method: 'POST', body: data }); },
  async getDuty() { return apiFetch('/api/duty'); },
  async setDuty(data) { return apiFetch('/api/duty', { method: 'POST', body: data }); },
  async getChats(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/api/chats' + (q ? '?' + q : ''));
  },
  async sendChat(body) { return apiFetch('/api/chats', { method: 'POST', body }); },
  async listEvidence(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/api/evidence' + (q ? '?' + q : ''));
  },
  async deleteEvidence(id, incidentId) {
    const k = guestKeyFor(incidentId);
    return apiFetch('/api/evidence/' + id, { method: 'DELETE', headers: k ? { 'X-Guest-Key': k } : {} });
  },
  async health() { return apiFetch('/api/health'); },
  async listSafehouses(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/api/safehouses' + (q ? '?' + q : ''));
  },
  async createSafehouse(body) { return apiFetch('/api/safehouses', { method: 'POST', body }); },
  async updateSafehouse(id, body) { return apiFetch('/api/safehouses/' + id, { method: 'PATCH', body }); },
  async deleteSafehouse(id) { return apiFetch('/api/safehouses/' + id, { method: 'DELETE' }); },
  async logout() { return apiFetch('/api/auth/logout', { method: 'POST', body: {} }); },
  async setPins(body) { return apiFetch('/api/pins', { method: 'POST', body }); },
  async verifyPin(pin) { return apiFetch('/api/pins/verify', { method: 'POST', body: { pin } }); },
  async markChatRead(withEmail) { return apiFetch('/api/chats/read', { method: 'POST', body: { with: withEmail } }); },
  async getLogs(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/api/logs' + (q ? '?' + q : ''));
  },
  async logEvent(type, detail) { return apiFetch('/api/logs/event', { method: 'POST', body: { type, detail } }); },
  async reverseGeocode(lat, lng) { return apiFetch('/api/geo/reverse?lat=' + lat + '&lng=' + lng); },
};
/** Fire-and-forget audit event (never blocks the UI) */
function logEvt(type, detail) { try { api.logEvent(type, detail).catch(() => {}); } catch {} }

/* ============================================================
   SAFE HELPERS
   ============================================================ */
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
async function hashPw(pw, salt) {
  if (window.crypto && crypto.subtle) {
    const data = new TextEncoder().encode((salt || '') + ':' + pw);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  let h = 0;
  const s = (salt || '') + ':' + pw;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'insecure:' + Math.abs(h).toString(36);
}
function randomSalt() {
  const a = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i=0;i<16;i++) a[i] = Math.floor(Math.random()*256);
  return Array.from(a).map(b => b.toString(16).padStart(2,'0')).join('');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ============================================================
   STORAGE
   ============================================================ */
const INCIDENTS_KEY = 'sm_incidents_v5';
const CHANNEL_NAME = 'safemesh_sync';
const SAFEMESH_KEYS = [
  'sm_incidents_v5','sm_accounts','sm_logs','sm_contacts','sm_pin','sm_duress_pin',
  'sm_ping','sm_probe','sm_checkin_ends','sm_fakecall','sm_bulletins','sm_pending_queue',
  'sm_evidence','sm_chats','sm_onduty','sm_units','sm_rec_consent','sm_session'
];

let storageOK = true;
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { storageOK = false; return false; } },
  remove(k) { try { localStorage.removeItem(k); } catch {} }
};
try { localStorage.setItem('sm_probe', '1'); localStorage.removeItem('sm_probe'); } catch { storageOK = false; }

let bc = null;
try { if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(CHANNEL_NAME); } catch {}
function broadcast(type) {
  if (bc) { try { bc.postMessage({ type, ts: Date.now() }); } catch {} return; }
  try { localStorage.setItem('sm_ping', String(Date.now())); } catch {}
}
if (bc) {
  bc.addEventListener('message', (e) => {
    const msg = e.data || {};
    if (['incidents','bulletins','accounts','onduty'].includes(msg.type)) {
      refreshAllFromStorage();
      if (typeof state !== 'undefined' && ['user-dashboard','responder-dashboard','admin-dashboard','pro-dashboard'].includes(state.currentView)) safeRender();
    }
  });
}
window.addEventListener('storage', (e) => {
  if ([INCIDENTS_KEY,'sm_ping','sm_bulletins','sm_accounts','sm_onduty'].includes(e.key)) {
    refreshAllFromStorage();
    if (typeof state !== 'undefined' && ['user-dashboard','responder-dashboard','admin-dashboard','pro-dashboard'].includes(state.currentView)) safeRender();
  }
});

/* ============================================================
   TOWNS
   ============================================================ */
const SA_TOWNS_DATA = {
  "Gauteng":["Johannesburg","Pretoria","Centurion","Midrand","Soweto","Vanderbijlpark","Vereeniging","Meyerton","Benoni","Germiston","Boksburg","Brakpan","Springs","Kempton Park","Alberton","Edenvale","Bedfordview","Roodepoort","Randburg","Sandton","Krugersdorp","Randfontein","Westonaria","Carletonville","Heidelberg","Nigel","Bronkhorstspruit","Cullinan","Hammanskraal","Soshanguve","Mamelodi","Tembisa","Katlehong","Vosloorus","Thokoza","Sebokeng","Evaton","Sharpeville","Magaliesburg","Muldersdrift","Akasia","Devon"],
  "Western Cape":["Cape Town","Stellenbosch","Paarl","Franschhoek","Wellington","Somerset West","Strand","Gordon's Bay","George","Mossel Bay","Knysna","Plettenberg Bay","Oudtshoorn","Worcester","Robertson","Montagu","Ceres","Tulbagh","Swellendam","Hermanus","Caledon","Bredasdorp","Gansbaai","Malmesbury","Vredenburg","Saldanha","Langebaan","Paternoster","Velddrif","St Helena Bay","Clanwilliam","Citrusdal","Vredendal","Lamberts Bay","Beaufort West","Prince Albert","Laingsburg","Riversdale","Albertinia","Heidelberg (WC)","Still Bay","Calitzdorp","Ladismith","De Rust","Uniondale","Riebeek-Kasteel","Darling","Moorreesburg","Piketberg"],
  "KwaZulu-Natal":["Durban","Pietermaritzburg","Newcastle","Osizweni","Madadeni","Richards Bay","Empangeni","Ladysmith","Dundee","Vryheid","Estcourt","Howick","Hilton","Mooi River","Greytown","Richmond","Ixopo","Kokstad","Port Shepstone","Margate","Shelly Beach","Uvongo","Ramsgate","Southbroom","Scottburgh","Umzinto","Amanzimtoti","Kingsburgh","Ballito","Stanger","Umdloti","Umhlanga","Tongaat","Verulam","Eshowe","Ulundi","Melmoth","Mtubatuba","St Lucia","Hluhluwe","Pongola","Paulpietersburg","Utrecht","Glencoe","Dannhauser","Bergville","Winterton","Colenso","Weenen","Underberg","Himeville","Bulwer","Kranskop","Maphumulo","Nongoma"],
  "Eastern Cape":["Gqeberha","East London","Bhisho","Kariega","Mthatha","Makhanda","Queenstown","Cradock","Graaff-Reinet","Aliwal North","Port St Johns","Butterworth","Jeffreys Bay","St Francis Bay","Cape St Francis","Humansdorp","Alice","Fort Beaufort","Seymour","Bedford","Adelaide","Somerset East","Willowmore","Steytlerville","Jansenville","Klipplaat","Aberdeen","Middelburg (EC)","Burgersdorp","Barkly East","Lady Grey","Rhodes","Dordrecht","Elliot","Maclear","Ugie","Mount Frere","Mount Ayliff","Bizana","Lusikisiki","Flagstaff","Libode","Ngqeleni","Nqamakwe","Tsomo","Idutywa","Willowvale","Centane","Peddie","Hamburg","Alexandria","Port Alfred","Kenton-on-Sea","Bathurst"],
  "Free State":["Bloemfontein","Welkom","Sasolburg","Kroonstad","Bethlehem","Harrismith","Parys","Botshabelo","Thaba Nchu","Phuthaditjhaba","Ficksburg","Ladybrand","Clocolan","Senekal","Heilbron","Frankfort","Vrede","Zastron","Rouxville","Brandfort","Winburg","Theunissen","Virginia","Odendaalsrus","Hennenman","Ventersburg","Allanridge","Bothaville","Viljoenskroon","Vredefort","Koppies","Edenville","Steynsrus","Lindley","Reitz","Petrus Steyn","Tweeling","Memel","Warden","Paul Roux","Fouriesburg","Rosendal","Marquard","Excelsior","Hobhouse","Tweespruit","Dewetsdorp","Wepener","Van Stadensrus","Smithfield","Bethulie","Springfontein","Trompsburg","Edenburg","Reddersburg","Philippolis","Fauresmith","Jagersfontein","Koffiefontein","Petrusburg","Boshof","Jacobsdal","Dealesville","Hertzogville","Hoopstad","Bultfontein","Soutpan"],
  "Limpopo":["Polokwane","Tzaneen","Makhado","Musina","Lephalale","Bela-Bela","Thabazimbi","Mokopane","Phalaborwa","Thohoyandou","Giyani","Modimolle","Mookgophong","Burgersfort","Jane Furse","Malamulele","Louis Trichardt","Naboomspruit","Warmbaths","Nylstroom","Potgietersrus","Zebediela","Hoedspruit","Modjadjiskloof","Duiwelskloof","Haenertsburg","Alldays","Northam","Amandelbult","Leeupoort","Rooiberg","Vaawater"],
  "Mpumalanga":["Mbombela","Emalahleni","Middelburg","Secunda","Ermelo","Standerton","Piet Retief","Barberton","White River","Sabie","Graskop","Lydenburg","Komatipoort","Malelane","Balfour","Bethal","Carolina","Volksrust","Witbank","Nelspruit","Mashishing","Mkhondo","Hazyview","Marloth Park","Blyde River Canyon","Chrissiesmeer","Wakkerstroom","Amersfoort","Evander","Kinross","Trichardt","Kriel","Hendrina","Belfast","Dullstroom","Machadodorp","Waterval Boven","Kwamhlanga","Siyabuswa","Delmas"],
  "North West":["Rustenburg","Mahikeng","Klerksdorp","Potchefstroom","Brits","Lichtenburg","Vryburg","Orkney","Stilfontein","Christiana","Schweizer-Reneke","Wolmaransstad","Zeerust","Ventersdorp","Fochville","Hartbeespoort","Mafikeng","Mmabatho","Marikana","Mooinooi","Swartruggens","Koster","Groot Marico","Ottosdal","Coligny","Sannieshof","Delareyville","Stella","Reivilo","Taung","Bloemhof","Leeudoringstad","Makwassie"],
  "Northern Cape":["Kimberley","Upington","Kuruman","Springbok","De Aar","Kathu","Postmasburg","Barkly West","Calvinia","Colesberg","Prieska","Sutherland","Carnarvon","Port Nolloth","Alexander Bay","Kakamas","Keimoes","Augrabies","Olifantshoek","Danielskuil","Lime Acres","Griekwastad","Douglas","Hopetown","Strydenburg","Britstown","Hanover","Richmond (NC)","Victoria West","Loxton","Fraserburg","Williston","Brandvlei","Loeriesfontein","Nieuwoudtville","Garies","Kamieskroon","Okiep","Nababeep","Carolusberg","Pofadder","Onseepkans"]
};
const SA_PROVINCES = Object.keys(SA_TOWNS_DATA).sort();
const THREAT_CATEGORIES = ['Physical Assault','Domestic Violence','Stalking','Robbery','Hate Crime','Sexual Assault','Harassment','Suspicious Activity','Other'];
const SAFE_STATUSES = ['Pending','Acknowledged','Dispatched','Resolved','False Alarm','Escalated','Archived','Duress'];
function safeStatus(s) { return SAFE_STATUSES.includes(s) ? s : 'Pending'; }

const TOWN_COORDS = {
  'johannesburg':[-26.2041,28.0473],'pretoria':[-25.7479,28.2293],'centurion':[-25.8603,28.1894],
  'midrand':[-25.9895,28.1284],'soweto':[-26.2678,27.8585],'sandton':[-26.1076,28.0567],
  'randburg':[-26.0936,28.0064],'roodepoort':[-26.1625,27.8725],'germiston':[-26.2228,28.1658],
  'benoni':[-26.1885,28.3205],'boksburg':[-26.2128,28.2625],'kempton park':[-26.1012,28.2319],
  'alberton':[-26.2678,28.1222],'edenvale':[-26.1375,28.1517],'krugersdorp':[-26.1006,27.7706],
  'cape town':[-33.9249,18.4241],'stellenbosch':[-33.9321,18.8602],'paarl':[-33.7343,18.9625],
  'somerset west':[-34.0819,18.8437],'george':[-33.9630,22.4617],'knysna':[-34.0362,23.0474],
  'mossel bay':[-34.1833,22.1500],'hermanus':[-34.4187,19.2345],'worcester':[-33.6460,19.4486],
  'durban':[-29.8587,31.0218],'pietermaritzburg':[-29.6006,30.3794],'newcastle':[-27.7570,29.9318],'osizweni':[-27.8100,30.0900],'madadeni':[-27.7600,30.0500],'dundee':[-28.1667,30.2333],'vryheid':[-27.7690,30.7910],'estcourt':[-29.0043,29.8760],'eshowe':[-28.8970,31.4690],'empangeni':[-28.7440,31.8930],'ulundi':[-28.3350,31.4170],'kokstad':[-30.5470,29.4240],'volksrust':[-27.3667,29.8833],'utrecht':[-27.6500,30.3167],
  'richards bay':[-28.7807,32.0383],'ballito':[-29.5390,31.2144],'umhlanga':[-29.7258,31.0866],
  'pmb':[-29.6006,30.3794],'port shepstone':[-30.7411,30.4549],'ladysmith':[-28.5587,29.7806],
  'gqeberha':[-33.9608,25.6022],'east london':[-33.0153,27.9116],'mthatha':[-31.5889,28.7843],
  'bhisho':[-32.8496,27.4411],'queenstown':[-31.8976,26.8753],'makhanda':[-33.3102,26.5281],
  'bloemfontein':[-29.0852,26.1596],'welkom':[-27.9775,26.7354],'sasolburg':[-26.8137,27.8297],
  'kroonstad':[-27.6500,27.2333],'bethlehem':[-28.2333,28.3000],'harrismith':[-28.2833,29.1167],
  'polokwane':[-23.9045,29.4689],'tzaneen':[-23.8333,30.1667],'makhado':[-23.0500,29.9000],
  'musina':[-22.3333,30.0333],'thohoyandou':[-22.9500,30.4833],'phalaborwa':[-23.9333,31.1167],
  'mbombela':[-25.4667,30.9667],'emalahleni':[-25.8833,29.2333],'middelburg':[-25.7667,29.4667],
  'secunda':[-26.5500,29.1667],'ermelo':[-26.5333,29.9833],'rustenburg':[-25.6667,27.2333],
  'mahikeng':[-25.8500,25.6333],'klerksdorp':[-26.8667,26.6667],'potchefstroom':[-26.7167,27.1000],
  'brits':[-25.6333,27.7833],'kimberley':[-28.7333,24.7667],'upington':[-28.4500,21.2500],
  'kuruman':[-27.4667,23.4333],'springbok':[-29.6667,17.8833],'de aar':[-30.6500,24.0167]
};
const PROVINCE_COORDS = {
  'Gauteng':[-26.2,28.1],'Western Cape':[-33.5,20.5],'KwaZulu-Natal':[-28.9,30.9],'Eastern Cape':[-32.0,26.5],
  'Free State':[-28.5,26.8],'Limpopo':[-23.6,29.5],'Mpumalanga':[-25.9,30.1],'North West':[-26.4,25.9],'Northern Cape':[-29.6,21.9]
};
/* Townships that belong to a bigger town: responders are assigned by town, so alerts from
   Osizweni / Madadeni must land in the Newcastle feed (the township is kept as the "area"). */
const TOWN_ALIASES = { 'KwaZulu-Natal': { 'osizweni': 'Newcastle', 'madadeni': 'Newcastle' } };
function canonicalRegion(province, town) {
  const al = (TOWN_ALIASES[province] || {})[String(town || '').toLowerCase().trim()];
  return al ? { town: al, area: town } : { town: town || '', area: '' };
}
function regionForUser(province, town) {
  const c = canonicalRegion(province, town);
  return { province: province || '', town: c.town || '', area: c.area || '' };
}
function coordsForTown(town, province) {
  const k = (town||'').toLowerCase().trim();
  if (TOWN_COORDS[k]) return TOWN_COORDS[k];
  // Unknown town: use the real GPS fix if we have one, otherwise the middle of the province
  // (never silently fall back to Johannesburg any more).
  if (state.userCoords && typeof state.userCoords.lat === 'number' && typeof state.userCoords.lng === 'number') {
    return [state.userCoords.lat, state.userCoords.lng];
  }
  const pk = province || (state.user && state.user.province);
  if (pk && PROVINCE_COORDS[pk]) return PROVINCE_COORDS[pk];
  return [-28.5, 24.7]; // centre of South Africa
}
function mapCenterForContext(town) {
  if (state.userCoords && typeof state.userCoords.lat === 'number' && typeof state.userCoords.lng === 'number') {
    return [state.userCoords.lat, state.userCoords.lng];
  }
  return coordsForTown(town, state.user && state.user.province);
}
function incidentCoords(inc) {
  if (inc && typeof inc.lat === 'number' && typeof inc.lng === 'number' && !(inc.lat === 0 && inc.lng === 0)) {
    return [inc.lat, inc.lng];
  }
  return coordsForTown(inc?.town, inc?.province);
}

/* ============================================================
   STORE LOADERS
   ============================================================ */
let INCIDENTS = store.get(INCIDENTS_KEY, []);
let BULLETINS = store.get('sm_bulletins', {});
let EVIDENCE = store.get('sm_evidence', []);
let ON_DUTY = store.get('sm_onduty', {});
let SAFEHOUSES = store.get('sm_safehouses', []) || [];
let _lastKnownIncidentIds = new Set(INCIDENTS.map(i => i.id));
let _alertAudioCtx = null;
let _alertOscNodes = [];

function persistIncidents() { store.set(INCIDENTS_KEY, INCIDENTS); broadcast('incidents'); }
function persistBulletins() { store.set('sm_bulletins', BULLETINS); broadcast('bulletins'); }
function persistEvidence() { store.set('sm_evidence', EVIDENCE); }
function persistDuty() { store.set('sm_onduty', ON_DUTY); broadcast('onduty'); }

function persistSafehouses() { store.set('sm_safehouses', SAFEHOUSES); }

/** Loud alert tone that tries to play even when device volume is low (Web Audio).
 *  Browsers cannot fully bypass OS silent/mute on all platforms, but we maximise gain,
 *  use multiple oscillators, vibrate, and request wake lock. */
function playResponderAlertSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_alertAudioCtx || _alertAudioCtx.state === 'closed') _alertAudioCtx = new AC();
    const ctx = _alertAudioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // Stop any previous burst
    _alertOscNodes.forEach(n => { try { n.stop(); } catch {} });
    _alertOscNodes = [];
    const now = ctx.currentTime;
    // Two-tone siren-like pattern ~3.5s
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = i % 2 === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + i * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.95, now + i * 0.55 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.55 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.55);
      osc.stop(now + i * 0.55 + 0.52);
      _alertOscNodes.push(osc);
    }
  } catch (e) { console.warn('alert sound', e); }
  try { if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500, 120, 300]); } catch {}
  try { acquireWakeLock(); } catch {}
}

function checkNewIncidentsForAlert(prevIds, nextList) {
  if (state.userRole !== 'responder') return;
  const me = state.user || {};
  if (me.responderStatus && me.responderStatus !== 'approved') return;
  const email = me.email;
  const duty = ON_DUTY[email] || {};
  // Alert on any new non-resolved incident in current filter region
  const { town, province } = state.responderFilter || {};
  for (const inc of nextList) {
    if (prevIds.has(inc.id)) continue;
    if (inc.status === 'Resolved' || inc.status === 'False Alarm') continue;
    if (town && province) {
      if ((inc.town || '').toLowerCase() !== String(town).toLowerCase()) continue;
      if ((inc.province || '').toLowerCase() !== String(province).toLowerCase()) continue;
    }
    playResponderAlertSound();
    showToast('🚨 New alert: ' + (inc.category || 'Incident'), 'error');
    break;
  }
}



/** Pull shared data from the backend into in-memory state */
async function syncFromServer() {
  try {
    // Refresh my own account (approval status, availability, PIN flag) — also detects expired sessions
    if (isLoggedInAccount()) {
      try {
        const m = await api.me();
        if (m && m.user) mergeMe(m.user);
      } catch (e) {
        if (e && e.status === 401) { showToast('Session expired — please sign in again', 'warn'); signOut(); return; }
      }
    }
    // Incidents for current context
    let incRes;
    if (state.userRole === 'admin') {
      incRes = await api.listIncidents();
    } else if (state.userRole === 'responder' && state.responderFilter.town) {
      incRes = await api.listIncidents({ province: state.responderFilter.province, town: state.responderFilter.town });
    } else if (state.user && state.user.email) {
      // signed-in users only ever receive their own alerts (the server enforces this)
      incRes = await api.listIncidents({ mine: '1' });
    } else if (state.user && state.user.town) {
      incRes = await api.listIncidents({ guest: '1' });   // guests: matched by the secret keys sent in X-Guest-Keys
    } else {
      incRes = { incidents: [] };
    }
    const prevIds = new Set((INCIDENTS || []).map(i => i.id));
    INCIDENTS = incRes.incidents || [];
    checkNewIncidentsForAlert(prevIds.size ? prevIds : _lastKnownIncidentIds, INCIDENTS);
    _lastKnownIncidentIds = new Set(INCIDENTS.map(i => i.id));

    const bul = await api.getBulletins();
    BULLETINS = bul.bulletins || {};

    try {
      const duty = await api.getDuty();
      ON_DUTY = duty.duty || {};
    } catch { /* guests may not have duty */ }

    if (state.userRole === 'admin' || state.userRole === 'professional') {
      try {
        if (state.userRole === 'admin') {
          const acc = await api.listAccounts();
          state.accounts = acc.accounts || [];
        } else {
          const pros = await api.listProfessionals();
          // keep local cache of pros for counselling
          const existing = state.accounts.filter(a => a.role !== 'professional');
          state.accounts = [...existing, ...(pros.professionals || [])];
        }
      } catch {}
    } else {
      try {
        const pros = await api.listProfessionals();
        const others = state.accounts.filter(a => a.role !== 'professional');
        state.accounts = [...others, ...(pros.professionals || [])];
      } catch {}
    }

    try {
      const evParams = state.userRole === 'admin' ? { all: '1' }
        : state.userRole === 'responder' ? { province: (state.responderFilter && state.responderFilter.province) || '', town: (state.responderFilter && state.responderFilter.town) || '' }
        : (state.user?.email ? { mine: '1' } : {});
      const ev = await api.listEvidence(evParams);
      // Merge server evidence metadata (files served from /api/evidence/:id/file)
      const serverEv = (ev.evidence || []).map(e => ({
        id: e.id,
        incidentId: e.incidentId,
        ownerEmail: e.ownerEmail,
        fileName: e.fileName,
        mimeType: e.mimeType,
        kind: e.kind,
        size: e.size,
        duration: e.duration,
        keep: e.keep,
        fromServer: true,
        dataUrl: e.url, // signed, expiring link — only handed out to people allowed to see the file
      }));
      // Keep pure local-only blobs that have data: URLs
      const localOnly = (EVIDENCE || []).filter(e => (e.dataUrl && String(e.dataUrl).startsWith('data:')) || e.idb);   // files kept on this device
      const ids = new Set(serverEv.map(e => e.id));
      EVIDENCE = [...serverEv, ...localOnly.filter(e => !ids.has(e.id) && !(e.serverId && ids.has(e.serverId)))];
    } catch {}

    // Chats (server is source of truth)
    try {
      if (isLoggedInAccount() && (state.userRole === 'professional' || state.userRole === 'user')) {
        const chatRes = await api.getChats();
        if (chatRes && Array.isArray(chatRes.messages)) handleChatSync(chatRes.messages);
      }
    } catch {}

    // Audit log (admin → Logs tab)
    try {
      if (state.userRole === 'admin' && state.adminTab === 'logs') await fetchAuditLogs(true);
    } catch {}

    // Safe houses
    try {
      const shParams = {};
      if (state.user?.province) shParams.province = state.user.province;
      if (state.user?.town) shParams.town = state.user.town;
      if (state.userRole === 'responder' && state.responderFilter?.town) {
        shParams.province = state.responderFilter.province;
        shParams.town = state.responderFilter.town;
      }
      const sh = await api.listSafehouses(shParams);
      SAFEHOUSES = sh.safehouses || [];
      persistSafehouses();
    } catch {}

    // Persist latest incident snapshot for offline use
    try { persistIncidents(); } catch {}
  } catch (err) {
    console.warn('syncFromServer', err);
  }
}

function refreshAllFromStorage() {
  const fresh = store.get(INCIDENTS_KEY, null);
  if (fresh && Array.isArray(fresh)) INCIDENTS = fresh;
  const bul = store.get('sm_bulletins', null);
  if (bul && typeof bul === 'object') BULLETINS = bul;
  const ev = store.get('sm_evidence', null);
  if (ev && Array.isArray(ev)) EVIDENCE = ev;
  const duty = store.get('sm_onduty', null);
  if (duty && typeof duty === 'object') ON_DUTY = duty;
  const accs = store.get('sm_accounts', null);
  if (accs && Array.isArray(accs) && !getToken()) state.accounts = accs;
}

/* ============================================================
   SUPPORT DIRECTORY
   ============================================================ */
const SUPPORT_DIRECTORY = [
  { id:1,name:'South African Police Service',type:'Police',phone:'10111',town:'National',province:'All',verified:true,address:'24/7 Emergency' },
  { id:2,name:'National Ambulance',type:'Hotline',phone:'10177',town:'National',province:'All',verified:true,address:'24/7 Emergency' },
  { id:3,name:'GBV Command Centre',type:'Hotline',phone:'0800-428-428',town:'National',province:'All',verified:true,address:'24/7 National Hotline' },
];
function communityWatchFor(town, province) {
  if (!town || !province) return [];
  return [
    { id:'cw-' + town.toLowerCase(), name:`${town} Community Watch`, type:'Community', phone:'', town, province, verified:true, address:`Coordinated by SafeMesh responders · ${province}` },
    { id:'pol-' + town.toLowerCase(), name:`${town} SAPS Station`, type:'Police', phone:'10111', town, province, verified:true, address:`Local police response · ${town}` }
  ];
}

/* ============================================================
   FAKE CALL
   ============================================================ */
const FAKE_CALL_PRESETS = [
  { id:'mom',     name:'Mom',          number:'+27 82 123 4567', letter:'M', color:'#ec4899' },
  { id:'boss',    name:'Boss',         number:'+27 11 555 0199', letter:'B', color:'#3b82f6' },
  { id:'partner', name:'Alex',         number:'+27 83 555 0142', letter:'A', color:'#a855f7' },
  { id:'taxi',    name:'Taxi Driver',  number:'+27 84 555 0188', letter:'T', color:'#f59e0b' },
  { id:'sister',  name:'Sister',       number:'+27 82 555 0110', letter:'S', color:'#10b981' }
];
function defaultFakeCallConfig() {
  return { name:'Mom', number:'+27 82 123 4567', letter:'M', color:'#ec4899', preset:'mom' };
}

/* ============================================================
   STATE
   ============================================================ */
const state = {
  currentView:'login', activeTab:'home', responderTab:'feed', adminTab:'monitor',
  user:null, userRole:null,
  sessionUser: store.get('sm_session', null),
  sosActive:false, sosIncidentId:null, sosIsDuress:false,
  logs: store.get('sm_logs',[]),
  emergencyContacts: store.get('sm_contacts',[]),
  personalPin: null,   // loaded per account by loadPinsForUser()
  duressPin: null,
  anonymityToggle:false,
  responderFilter: { province:'', town:'' },
  adminFilter: { province:'', town:'' },
  showAbortModal:false, abortCountdown:0,
  countdown:0, pressing:false,
  userCoords:null, gpsStatus:'unknown',
  accounts: store.get('sm_accounts',[]),
  registerRole:'user', loginRole:'user', authError:'',
  silentSosActive:false,
  fakeCallActive:false, fakeCallTimer:null, fakeCallSeconds:0,
  fakeCallConfig: Object.assign(defaultFakeCallConfig(), store.get('sm_fakecall', {})),
  showFakeCallConfig:false,
  checkInActive:false, checkInEndsAt: store.get('sm_checkin_ends', 0), checkInDuration:30,
  showResolveModal:false, resolveIncidentId:null,
  showAckModal:false, ackIncidentId:null, ackStep:1, ackIsAcknowledged:null,
  recConsent: store.get('sm_rec_consent', false),
  isRecording:false, mediaRecorder:null, recChunks:[], recStartedAt:0, recordingIncidentId:null,
  heatmapOn:true,
  popiaAccepted:false,
  tosAccepted:false,
  authLoading:false,
  storageBytes: 0,
  forgotRole:'user', forgotStep:'request', forgotEmail:'',
  regDraft: { name:'', email:'', password:'', passwordConfirm:'', province:'', town:'', org:'', job:'', adminKey:'', pin:'', duressPin:'' },
  loginDraft: { email:'', password:'', province:'', town:'' },
  reportAttachments: [],
  mapSearchQuery: '',
  mapSearchResults: [],
  mapSearchLoading: false,
  mapSearchTarget: null, // { lat, lng, label } — pin on map
  mapSearchContext: 'responder', // responder | admin
  me: null,                       // fresh copy of my account from the server
  geoRegion: null, locationSource: 'manual', geoBusy: false,
  proTab: 'clients', chatPro: null, chatWith: null,
  auditLogs: [], auditMeta: { total: 0, counts: {}, all: 0 }, auditFilter: { category: 'all', q: '' }, auditLoading: false,
  shFilter: 'all', revealPin: null
};

const EVIDENCE_MAX_FILES = 5;
const EVIDENCE_MAX_BYTES = 500 * 1024 * 1024; // 500 MB per report (large files stored in IndexedDB)
if (state.checkInEndsAt && state.checkInEndsAt > Date.now()) state.checkInActive = true;
else state.checkInEndsAt = 0;

/* Always start at the login page: saved sessions are no longer auto-restored */
const AUTO_RESTORE_SESSION = false;
if (!AUTO_RESTORE_SESSION) { store.remove('sm_session'); state.sessionUser = null; try { localStorage.removeItem('sm_token'); } catch {} }
if (AUTO_RESTORE_SESSION && state.sessionUser && Date.now() - state.sessionUser.at < 7 * 24 * 60 * 60 * 1000) {
  state.user = state.sessionUser.user;
  state.userRole = state.sessionUser.role;
  state.responderFilter = state.sessionUser.responderFilter || { province:'', town:'' };
  state.currentView = state.userRole === 'admin' ? 'admin-dashboard'
                    : state.userRole === 'responder' ? 'responder-dashboard'
                    : 'user-dashboard';
}

/* ============================================================
   WAKE LOCK
   ============================================================ */
let wakeLock = null;
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function releaseWakeLock() {
  if (wakeLock) { try { wakeLock.release(); } catch {} wakeLock = null; }
}

/* ============================================================
   FORM DRAFTS (preserve inputs across re-renders)
   ============================================================ */
function captureRegForm() {
  const g = (id) => document.getElementById(id);
  if (!g('reg-email') && !g('reg-name') && !g('reg-password')) return;
  state.regDraft = {
    name: g('reg-name')?.value ?? state.regDraft.name,
    email: g('reg-email')?.value ?? state.regDraft.email,
    phone: g('reg-phone')?.value ?? state.regDraft.phone,
    password: g('reg-password')?.value ?? state.regDraft.password,
    passwordConfirm: g('reg-password-confirm')?.value ?? state.regDraft.passwordConfirm,
    province: g('reg-province')?.value ?? state.regDraft.province,
    town: g('reg-town')?.value ?? state.regDraft.town,
    org: g('reg-org')?.value ?? state.regDraft.org,
    job: g('reg-job')?.value ?? state.regDraft.job,
    adminKey: g('reg-admin-key')?.value ?? state.regDraft.adminKey,
    industry: g('reg-industry')?.value ?? state.regDraft.industry,
    license: g('reg-license')?.value ?? state.regDraft.license,
    pin: g('reg-pin')?.value ?? state.regDraft.pin,
    duressPin: g('reg-duress-pin')?.value ?? state.regDraft.duressPin
  };
}
function captureLoginForm() {
  const g = (id) => document.getElementById(id);
  if (!g('login-email') && !g('login-password')) return;
  state.loginDraft = {
    email: g('login-email')?.value ?? state.loginDraft.email,
    password: g('login-password')?.value ?? state.loginDraft.password,
    province: g('login-province')?.value ?? state.loginDraft.province,
    town: g('login-town')?.value ?? state.loginDraft.town
  };
}
function clearRegDraft() {
  state.regDraft = { name:'', email:'', password:'', passwordConfirm:'', province:'', town:'', org:'', job:'', adminKey:'', pin:'', duressPin:'' };
  state.popiaAccepted = false;
  state.tosAccepted = false;
}

/* ============================================================
   RENDER
   ============================================================ */
let focusedId = null, focusedValue = null;
function safeRender() {
  const app = document.getElementById('app');
  const overlayRoot = document.getElementById('overlay-root');
  const active = document.activeElement;
  if (active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName)) {
    focusedId = active.id || null;
    focusedValue = active.value;
  } else { focusedId = null; focusedValue = null; }

  app.innerHTML = getView();

  const syncBanner = (!storageOK && ['user-dashboard','responder-dashboard','admin-dashboard'].includes(state.currentView))
    ? '<div class="fixed top-0 inset-x-0 z-[60] bg-amber-600 text-black text-xs font-semibold text-center px-3 py-2" role="alert">Live sync is OFF — this browser is blocking local storage.</div>'
    : '';
  const offlineBanner = (!navigator.onLine && ['user-dashboard','responder-dashboard','admin-dashboard'].includes(state.currentView))
    ? '<div class="offline-banner" role="status">Offline — alerts will sync when connection returns</div>'
    : '';
  const duressBanner = (state.userRole === 'responder' && anyDuressActive())
    ? '<div class="duress-banner" role="alert">⚠ DURESS ALERT ACTIVE — treat as high-risk</div>'
    : '';
  overlayRoot.innerHTML =
    (state.fakeCallActive ? renderFakeCallOverlay() : '') +
    (state.showFakeCallConfig ? renderFakeCallConfigModal() : '') +
    (state.showAckModal ? renderAckModal() : '') +
    duressBanner + offlineBanner + syncBanner;

  if (focusedId) {
    const el = document.getElementById(focusedId);
    if (el) {
      el.focus();
      if (el.setSelectionRange && typeof focusedValue === 'string' && el.value !== focusedValue) {
        try { el.value = focusedValue; el.setSelectionRange(focusedValue.length, focusedValue.length); } catch {}
      }
    }
  }

  if (state.currentView === 'responder-dashboard' && state.responderTab === 'map') {
    setTimeout(initOrRefreshResponderMap, 0);
  }
  if (state.currentView === 'admin-dashboard' && state.adminTab === 'monitor') {
    setTimeout(initOrRefreshAdminMap, 0);
  }
  if (state.currentView === 'user-dashboard' && state.activeTab === 'home') {
    setTimeout(initOrRefreshUserMiniMap, 0);
  }
}
function render(){ safeRender(); }

function getView() {
  switch (state.currentView) {
    case 'landing': return renderLanding();
    case 'login': return renderLogin();
    case 'pro-dashboard': return renderProDashboard();
    case 'register': return renderRegister();
    case 'forgot-password': return renderForgotPassword();
    case 'guest': return renderGuestGateway();
    case 'privacy': return renderPrivacyNotice();
    case 'terms': return renderTerms();
    case 'user-dashboard': return renderUserDashboard();
    case 'responder-dashboard': return renderResponderDashboard();
    case 'admin-dashboard': return renderAdminDashboard();
    default: return renderLanding();
  }
}

/* ============================================================
   POLLING
   ============================================================ */
let lastSyncSig = '', lastForcedRender = 0;
function syncNow() {
  const active = document.activeElement;
  const onLiveFeed = (state.currentView === 'responder-dashboard' && state.responderTab === 'feed') ||
                     (state.currentView === 'admin-dashboard' && ['pending','monitor','logs','safehouses'].includes(state.adminTab));
  if (!onLiveFeed && active && ['INPUT','TEXTAREA'].includes(active.tagName) && active.value) return;
  if (state.showAbortModal || state.fakeCallActive || state.showResolveModal || state.showFakeCallConfig || state.showAckModal) return;
  if (!['user-dashboard','responder-dashboard','admin-dashboard','pro-dashboard'].includes(state.currentView)) return;
  if (sosArmed || state.countdown > 0) return;
  // Prefer server sync; fall back to local storage refresh
  syncFromServer().then(() => {
    let sig = '';
    try { sig = JSON.stringify(INCIDENTS) + state.accounts.length + JSON.stringify(state.accounts.map(a => [a.email, a.responderStatus, a.proStatus, a.accepting])) + JSON.stringify(BULLETINS) + JSON.stringify(ON_DUTY) + JSON.stringify(SAFEHOUSES.map(h => [h.id, h.status, h.verified])) + CHATS.length + unreadIn() + (state.auditLogs[0] ? state.auditLogs[0].id : '') + (state.auditMeta.all || ''); } catch {}
    const now = Date.now();
    if (sig === lastSyncSig && now - lastForcedRender < 10000) return;
    lastSyncSig = sig; lastForcedRender = now;
    safeRender();
  }).catch(() => {
    refreshAllFromStorage();
    safeRender();
  });
}
setInterval(syncNow, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
window.addEventListener('focus', syncNow);

/* ============================================================
   HELPERS
   ============================================================ */
function showToast(message, type='success') {
  const root = document.getElementById('overlay-root');
  const existing = root.querySelector('.toast-node');
  if (existing) existing.remove();
  const colors = {
    success:'background:rgba(6,78,59,.9);border-color:rgba(4,120,87,.5);color:#6ee7b7;',
    error:'background:rgba(127,29,29,.9);border-color:rgba(153,27,27,.5);color:#fca5a5;',
    info:'background:rgba(30,58,138,.9);border-color:rgba(29,78,216,.5);color:#93c5fd;',
    warn:'background:rgba(120,53,15,.9);border-color:rgba(180,83,9,.5);color:#fcd34d;'
  }[type] || '';
  const node = document.createElement('div');
  node.className = 'toast-node';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.innerHTML = `<div style="${colors}border:1px solid;">${esc(message)}</div>`;
  root.appendChild(node);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { node.remove(); }, 3000);

  const live = document.getElementById('live-region');
  if (live) live.textContent = message;
}
function getIncidentsForTown(t, p) {
  if (!t || !p) return [];
  const tl = t.toLowerCase(), pl = p.toLowerCase();
  return INCIDENTS.filter(i => i.town.toLowerCase() === tl && i.province.toLowerCase() === pl);
}
function getIncidentById(id) { return INCIDENTS.find(i => i.id === id); }
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m === 1) return '1 min ago';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr${h > 1 ? 's' : ''} ago`;
}
function incidentBelongsToMe(inc) {
  const myEmail = state.user?.email || null;
  if (myEmail) return inc.ownerEmail === myEmail;
  return inc.user === (state.user?.name || 'Anonymous') && inc.town === (state.user?.town || '');
}
function bulletinKey(town, province) {
  if (!town || !province) return null;
  return `${town.toLowerCase()}|${province.toLowerCase()}`;
}
function getBulletinFor(town, province) {
  const k = bulletinKey(town, province);
  if (!k) return null;
  return BULLETINS[k] || null;
}
function approvedResponders() {
  return state.accounts.filter(a => a.role === 'responder' && a.responderStatus === 'approved');
}
function pendingResponders() {
  return state.accounts.filter(a => a.role === 'responder' && a.responderStatus === 'pending');
}
function hasAdmin() { return state.accounts.some(a => a.role === 'admin'); }
function anyDuressActive() {
  return INCIDENTS.some(i => i.isDuress && i.status !== 'Resolved' && i.status !== 'False Alarm');
}
function evidenceForIncident(id) { return EVIDENCE.filter(e => e.incidentId === id); }
function evidenceKind(mime, name) {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return 'image';
  if (m.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi)$/.test(n)) return 'video';
  if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm|aac)$/.test(n)) return 'audio';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  return 'file';
}
function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
function isEvidenceOwner(ev) {
  const email = state.user?.email || 'guest-session';
  return ev.ownerEmail === email || ev.ownerEmail === (state.user?.email || null);
}
function canDeleteEvidence(ev) {
  // Only the survivor/owner may delete. Responders and admins cannot remove user evidence.
  if (state.userRole === 'responder' || state.userRole === 'admin') return false;
  return isEvidenceOwner(ev);
}
function renderEvidenceCards(list, opts) {
  const canDelete = !!(opts && opts.canDelete);
  if (!list.length) return '';
  return `
    <div class="space-y-2">
      <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Evidence (${list.length}) · view only for responders</p>
      ${list.map(ev => {
        const kind = ev.kind || evidenceKind(ev.mimeType, ev.fileName);
        const label = esc(ev.fileName || (kind + ' evidence'));
        const meta = `${esc(kind)} · ${formatBytes(ev.size) || (ev.duration ? ev.duration + 's' : '')}`;
        let preview = '';
        if (kind === 'image' && evSrc(ev)) {
          preview = `<img src="${evSrc(ev)}" alt="${label}" class="w-full max-h-48 object-contain rounded-lg bg-black/40" loading="lazy"/>`;
        } else if (kind === 'video' && evSrc(ev)) {
          preview = `<video src="${evSrc(ev)}" controls playsinline class="w-full max-h-48 rounded-lg bg-black"></video>`;
        } else if (kind === 'audio' && evSrc(ev)) {
          preview = `<audio id="evidence-audio-${esc(ev.id)}" src="${evSrc(ev)}" controls playsinline preload="metadata" class="w-full h-10"></audio>`;
        } else if (kind === 'pdf' && evSrc(ev)) {
          preview = `<a href="${evSrc(ev)}" target="_blank" rel="noopener" class="block text-xs text-blue-400 underline">Open PDF in new tab</a>`;
        } else if (evSrc(ev)) {
          preview = `<p class="text-[10px] text-slate-500">File attached — use Download / Open</p>`;
        }
        return `
          <div class="bg-slate-950 rounded-lg p-3 space-y-2 border border-slate-800">
            <div class="flex justify-between gap-2 text-xs">
              <span class="text-slate-200 font-medium truncate">${label}</span>
              <span class="text-slate-500 shrink-0">${meta}</span>
            </div>
            ${preview}
            <div class="flex flex-wrap gap-2">
              ${kind === 'audio' ? `<button data-action="play-evidence" data-ev-id="${esc(ev.id)}" class="py-1.5 px-3 bg-blue-600 text-white rounded text-xs font-bold">Play</button>` : ''}
              <button data-action="download-evidence" data-ev-id="${esc(ev.id)}" class="flex-1 min-w-[6.5rem] py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold">Download file</button>
              ${evSrc(ev) ? `<a href="${evSrc(ev)}" target="_blank" rel="noopener" download="${label}" class="py-2 px-3 bg-slate-700 text-white rounded text-xs font-bold inline-block">Open</a>` : ''}
              ${canDelete && canDeleteEvidence(ev) ? `
                <button data-action="keep-evidence" data-ev-id="${esc(ev.id)}" class="py-1.5 px-2 ${ev.keep?'bg-emerald-600':'bg-slate-700'} text-white rounded text-xs font-bold">${ev.keep?'Keep ✓':'Auto-delete'}</button>
                <button data-action="delete-evidence" data-ev-id="${esc(ev.id)}" class="py-1.5 px-2 bg-red-700 text-white rounded text-xs font-bold">Delete</button>
              ` : `<span class="text-[10px] text-slate-500 self-center">View &amp; download only</span>`}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}
function getStorageBytes() {
  let total = 0;
  try {
    for (let k in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, k)) {
        total += (localStorage[k] || '').length;
      }
    }
  } catch {}
  return total;
}
function getQueueCount() {
  return (store.get('sm_pending_queue', []) || []).length;
}

/* ============================================================
   EVENTS
   ============================================================ */
function unlockAlertAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_alertAudioCtx || _alertAudioCtx.state === 'closed') _alertAudioCtx = new AC();
    if (_alertAudioCtx.state === 'suspended') _alertAudioCtx.resume().catch(() => {});
  } catch {}
}
document.addEventListener('pointerdown', unlockAlertAudio, { passive: true });
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action],[data-nav],[data-tab],[data-resp-tab],[data-admin-tab],[data-pro-tab],[data-login-role],[data-register-role],[data-forgot-role],[data-remove-contact],[data-fakecall-preset]');
  if (!t) return;

  if (t.dataset.nav) {
    e.preventDefault();
    if (state.currentView === 'register') captureRegForm();
    if (state.currentView === 'login') captureLoginForm();
    state.currentView = t.dataset.nav;
    safeRender();
    window.scrollTo(0,0);
    return;
  }
  if (t.dataset.tab) { state.activeTab = t.dataset.tab; safeRender(); return; }
  if (t.dataset.respTab) { state.responderTab = t.dataset.respTab; safeRender(); return; }
  if (t.dataset.adminTab) { state.adminTab = t.dataset.adminTab; safeRender(); if (state.adminTab === 'logs') fetchAuditLogs(); return; }
  if (t.dataset.proTab) { state.proTab = t.dataset.proTab; state.chatWith = null; safeRender(); return; }
  if (t.dataset.loginRole) { captureLoginForm(); state.loginRole = t.dataset.loginRole; safeRender(); return; }
  if (t.dataset.registerRole) { captureRegForm(); state.registerRole = t.dataset.registerRole; safeRender(); return; }
  if (t.dataset.forgotRole) { state.forgotRole = t.dataset.forgotRole; state.forgotStep = 'request'; safeRender(); return; }
  if (t.dataset.removeContact !== undefined) {
    const idx = parseInt(t.dataset.removeContact);
    state.emergencyContacts.splice(idx,1);
    store.set('sm_contacts', state.emergencyContacts);
    safeRender(); showToast('Contact removed'); return;
  }
  if (t.dataset.fakecallPreset) {
    const preset = FAKE_CALL_PRESETS.find(p => p.id === t.dataset.fakecallPreset);
    if (preset) {
      state.fakeCallConfig = Object.assign({}, preset, { preset: preset.id });
      saveFakeCallConfig();
      safeRender();
      showToast(`Fake caller set to ${preset.name}`);
    }
    return;
  }

  const a = t.dataset.action;
  const id = t.dataset.id ? parseInt(t.dataset.id) : null;

  switch (a) {
    case 'quick-exit': quickExit(); break;
    case 'login-submit': handleLogin(); break;
    case 'register-submit': handleRegister(); break;
    case 'forgot-request': handleForgotRequest(); break;
    case 'forgot-request-again': state.forgotStep = 'request'; safeRender(); setTimeout(handleForgotRequest, 30); break;
    case 'forgot-password-submit': handleForgotPassword(); break;
    case 'forgot-restart': state.forgotStep = 'request'; safeRender(); break;
    case 'change-password': handleChangePassword(); break;
    case 'admin-reset-password': if (t.dataset.email) adminResetPassword(t.dataset.email); break;
    case 'toggle-password': {
      const target = t.dataset.target;
      const input = target ? document.getElementById(target) : null;
      if (input) {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        t.textContent = show ? 'Hide' : 'Show';
        t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      }
      break;
    }
    case 'guest-enter': enterGuest(); break;
    case 'confirm-sos': confirmSOS(); break;
    case 'abort-sos': abortSOS(); break;
    case 'stand-down': standDown(); break;
    case 'report-submit': submitReport(); break;
    case 'toggle-anonymity': state.anonymityToggle = !state.anonymityToggle; safeRender(); break;
    case 'toggle-popia':
      captureRegForm();
      state.popiaAccepted = !state.popiaAccepted;
      safeRender();
      break;
    case 'toggle-tos':
      captureRegForm();
      state.tosAccepted = !state.tosAccepted;
      safeRender();
      break;
    case 'add-contact': addContact(); break;
    case 'save-pin': savePin(); break;
    case 'save-duress-pin': saveDuressPin(); break;
    case 'clear-duress-pin': clearDuressPin(); break;
    case 'apply-filter': applyResponderFilter(); break;
    case 'apply-admin-filter': applyAdminFilter(); break;
    case 'broadcast': doBroadcast(); break;
    case 'admin-broadcast': doAdminBroadcast(); break;
    case 'admin-emergency-alert': doAdminEmergencyAlert(); break;
    case 'delete-all-data': deleteAllData(); break;
    case 'download-my-data': downloadMyData(); break;
    case 'toggle-privacy': t.classList.toggle('on'); break;
    case 'silent-sos': triggerSilentSOS(); break;
    case 'start-fake-call': startFakeCall(); break;
    case 'end-fake-call': endFakeCall(); break;
    case 'open-fakecall-config': state.showFakeCallConfig = true; safeRender(); break;
    case 'close-fakecall-config': state.showFakeCallConfig = false; safeRender(); break;
    case 'save-fakecall-config': saveFakeCallConfigFromForm(); break;
    case 'start-checkin': startCheckIn(); break;
    case 'checkin-safe': checkInImSafe(); break;
    case 'cancel-checkin': cancelCheckIn(); break;
    case 'open-ack': if (id) openAckModal(id); break;
    case 'close-ack': state.showAckModal = false; state.ackIncidentId = null; state.ackStep = 1; state.ackIsAcknowledged = null; safeRender(); break;
    case 'ack-yes': ackYes(); break;
    case 'ack-no': ackNo(); break;
    case 'ack-dispatch-vehicle': ackDispatchVehicle(); break;
    case 'ack-on-foot': ackOnFoot(); break;
    case 'responder-advance': if (id) responderAdvance(id); break;
    case 'responder-mark-resolved': if (id) responderMarkResolved(id); break;
    case 'responder-mark-false': if (id) responderMarkFalse(id); break;
    case 'responder-reopen': if (id) responderReopen(id); break;
    case 'user-confirm-safe': if (id) userConfirmSafe(id); break;
    case 'user-need-more-help': if (id) userNeedMoreHelp(id); break;
    case 'toggle-duty': toggleDuty(); break;
    case 'save-duty-radius': saveDutyRadius(); break;
    case 'toggle-rec-consent': toggleRecConsent(); break;
    case 'start-recording-manual': startRecordingManual(); break;
    case 'stop-recording': stopRecording(); break;
    case 'play-evidence': if (t.dataset.evId) playEvidence(t.dataset.evId); break;
    case 'download-evidence': if (t.dataset.evId) downloadEvidence(t.dataset.evId); break;
    case 'delete-evidence': if (t.dataset.evId) deleteEvidence(t.dataset.evId); break;
    case 'keep-evidence': if (t.dataset.evId) keepEvidence(t.dataset.evId); break;
    case 'remove-report-attachment': if (t.dataset.tempId) removeReportAttachment(t.dataset.tempId); break;
    case 'pick-report-evidence': document.getElementById('report-evidence-input')?.click(); break;
    case 'toggle-heatmap': state.heatmapOn = !state.heatmapOn; safeRender(); break;
    case 'admin-approve-responder': if (t.dataset.email) adminApproveResponder(t.dataset.email); break;
    case 'admin-reject-responder': if (t.dataset.email) adminRejectResponder(t.dataset.email); break;
    case 'admin-revoke-responder': if (t.dataset.email) adminRevokeResponder(t.dataset.email); break;
    case 'admin-revet-responder': if (t.dataset.email) adminRevetResponder(t.dataset.email); break;
    case 'apply-as-responder': applyAsResponder(); break;
    case 'map-search': runMapSearch(t.dataset.context || 'responder'); break;
    case 'map-search-select': selectMapSearchResult(parseInt(t.dataset.idx, 10)); break;
    case 'map-search-clear': clearMapSearch(); break;
    case 'pro-refresh': { refreshAllFromStorage(); const m = state.accounts.find(a => a.email === state.user?.email); showToast(m && m.proStatus === 'approved' ? 'Approved — welcome!' : 'Still awaiting admin verification', m && m.proStatus === 'approved' ? 'success' : 'warn'); safeRender(); break; }
    case 'open-chat': if (state.userRole === 'professional') state.chatWith = t.dataset.email; else state.chatPro = t.dataset.email; markThreadRead(t.dataset.email); safeRender(); break;
    case 'close-chat': state.chatWith = null; state.chatPro = null; safeRender(); break;
    case 'send-chat': sendChat(); break;
    case 'approve-account': setAcctStatus(t.dataset.email, 'approved'); break;
    case 'reject-account': setAcctStatus(t.dataset.email, 'rejected'); break;
    case 'add-safehouse': addSafehouse(); break;
    case 'delete-safehouse': if (t.dataset.id) deleteSafehouse(t.dataset.id); break;
    case 'approve-safehouse': if (t.dataset.id) approveSafehouse(t.dataset.id); break;
    case 'reject-safehouse': if (t.dataset.id) rejectSafehouse(t.dataset.id); break;
    case 'sh-filter': state.shFilter = t.dataset.filter || 'all'; safeRender(); break;
    case 'logs-apply': applyLogFilter(); break;
    case 'logs-refresh': fetchAuditLogs(); break;
    case 'logs-export': exportLogsCsv(); break;
    case 'toggle-accepting': toggleAccepting(); break;
    case 'toggle-tracking': if (liveWatchId === null) startTracking(); else stopTracking(); safeRender(); break;
    case 'gps-search': gpsSearch(t.dataset.context || 'responder'); break;
    case 'admin-force-resolve': if (id) adminForceResolve(id); break;
    case 'admin-reassign': if (id) adminReassign(id); break;
    case 'admin-delete-incident': if (id) adminDeleteIncident(id); break;
    case 'sign-out': signOut(); break;
    case 'retry-gps': requestGPS(); break;
    case 'use-gps-region': {
      const g = state.geoRegion;
      if (g) { state.responderFilter = { province: g.province, town: g.town }; persistSession(); showToast(`Command region set to ${g.town}`, 'success'); syncNow(); safeRender(); }
      break;
    }
    case 'reveal-pin': {
      const k = t.dataset.kind;
      state.revealPin = state.revealPin === k ? null : k;
      safeRender();
      if (state.revealPin) setTimeout(() => { if (state.revealPin === k) { state.revealPin = null; safeRender(); } }, 10000);
      break;
    }
  }
});

document.addEventListener('mousedown', (e) => {
  const b = e.target.closest('[data-action="start-sos"]'); if (b) startSOSPress(b);
});
document.addEventListener('mouseup', () => { if (sosArmed || state.pressing) endSOSPress(); });
document.addEventListener('touchstart', (e) => {
  const b = e.target.closest('[data-action="start-sos"]'); if (b) { e.preventDefault(); startSOSPress(b); }
}, {passive:false});
document.addEventListener('touchend', (e) => {
  if (e.target.closest && e.target.closest('[data-action="start-sos"]')) e.preventDefault();
  if (sosArmed || state.pressing) endSOSPress();
}, {passive:false});
document.addEventListener('touchcancel', () => { if (sosArmed || state.pressing) endSOSPress(); });

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'reg-province' || t.id === 'login-province' || t.id === 'guest-province' || t.id === 'forgot-province') {
    const prefix = t.id.startsWith('reg') ? 'reg'
      : (t.id.startsWith('guest') ? 'guest'
      : (t.id.startsWith('forgot') ? 'forgot' : 'login'));
    const townSel = document.getElementById(prefix + '-town');
    if (townSel) {
      const towns = SA_TOWNS_DATA[t.value] || [];
      townSel.innerHTML = '<option value="">Select town...</option>' + towns.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    }
    if (prefix === 'reg') {
      state.regDraft.province = t.value;
      state.regDraft.town = '';
    }
    if (prefix === 'login') {
      state.loginDraft.province = t.value;
      state.loginDraft.town = '';
    }
  }
  if (t.id === 'reg-town') state.regDraft.town = t.value;
  if (t.id === 'reg-role-select') { captureRegForm(); state.registerRole = t.value; safeRender(); return; }
  if (t.id === 'login-town') state.loginDraft.town = t.value;
  if (t.id === 'report-evidence-input' && t.files) {
    addReportAttachmentFiles(t.files);
    t.value = '';
  }
  if (t.id === 'sh-province') {
    state.shDraftProvince = t.value;
    const townSel = document.getElementById('sh-town');
    if (townSel) townSel.innerHTML = '<option value="">Select town...</option>' + (SA_TOWNS_DATA[t.value] || []).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  }
  if (t.id === 'log-category') { applyLogFilter(); }
  if (t.id === 'resp-filter-province') {
    const townSel = document.getElementById('resp-filter-town');
    if (townSel) {
      const towns = SA_TOWNS_DATA[t.value] || [];
      townSel.innerHTML = '<option value="">Select town...</option>' + towns.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    }
  }
  if (t.id === 'admin-filter-province') {
    const townSel = document.getElementById('admin-filter-town');
    if (townSel) {
      if (!t.value) townSel.innerHTML = '<option value="">All towns</option>';
      else {
        const towns = SA_TOWNS_DATA[t.value] || [];
        townSel.innerHTML = '<option value="">All towns</option>' + towns.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
      }
    }
  }
  if (t.id === 'admin-broadcast-province') {
    const townSel = document.getElementById('admin-broadcast-town');
    if (townSel) {
      const towns = SA_TOWNS_DATA[t.value] || [];
      townSel.innerHTML = '<option value="">Select town...</option>' + towns.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    }
  }
});

document.addEventListener('input', (e) => {
  const id = e.target && e.target.id;
  if (id !== 'reg-pin' && id !== 'reg-duress-pin') return;
  const a = (document.getElementById('reg-pin') || {}).value || '', b = (document.getElementById('reg-duress-pin') || {}).value || '';
  const hint = document.getElementById('reg-pin-hint'); if (!hint) return;
  if (a && b && a === b) { hint.textContent = '✖ The two PINs must be different.'; hint.className = 'text-[11px] mt-1 text-red-400'; }
  else if (a && b) { hint.textContent = '✔ Looks good — the PINs are different.'; hint.className = 'text-[11px] mt-1 text-emerald-400'; }
  else { hint.textContent = 'Tap “Show” to check what you typed. You can view both PINs later in Settings.'; hint.className = 'text-[11px] mt-1 text-slate-500'; }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const id = e.target && e.target.id;
    if (id === 'resp-map-search') { e.preventDefault(); runMapSearch('responder'); return; }
    if (id === 'admin-map-search') { e.preventDefault(); runMapSearch('admin'); return; }
    if (id === 'log-search') { e.preventDefault(); applyLogFilter(); return; }
  }
  if (e.key !== 'Escape') return;
  if (state.fakeCallActive) { endFakeCall(); return; }
  if (state.showFakeCallConfig) { state.showFakeCallConfig = false; safeRender(); return; }
  if (state.showAckModal) {
    state.showAckModal = false; state.ackIncidentId = null; state.ackStep = 1; state.ackIsAcknowledged = null;
    safeRender(); return;
  }
  if (state.showAbortModal) { abortSOS(); return; }
  if (state.showResolveModal) { state.showResolveModal = false; state.resolveIncidentId = null; safeRender(); return; }
});

/* ============================================================
   AUTH
   ============================================================ */
const LOGIN_LOCK = { fails: 0, until: 0 };

async function handleLogin() {
  const loginId = (document.getElementById('login-email').value || '').trim().toLowerCase();
  const password = document.getElementById('login-password').value || '';
  const role = state.loginRole;
  const province = document.getElementById('login-province')?.value || '';
  const town = document.getElementById('login-town')?.value || '';

  if (Date.now() < LOGIN_LOCK.until) {
    const secs = Math.ceil((LOGIN_LOCK.until - Date.now()) / 1000);
    showToast(`Too many failed attempts. Try again in ${secs}s`, 'error');
    return;
  }

  captureLoginForm();
  state.authLoading = true; safeRender();

  try {
    if (!loginId) throw new Error('Email or phone is required');
    if (!password) throw new Error('Password is required');

    const data = await api.login({ login: loginId, password, role, province, town });
    setToken(data.token);
    LOGIN_LOCK.fails = 0;

    const account = data.user;
    const _reg = regionForUser(province || account.province, town || account.town);
    resetSessionState();
    state.user = {
      name: account.name,
      email: account.email,
      phone: account.phone,
      province: _reg.province,
      town: _reg.town,
      area: _reg.area,
      hasPins: !!account.hasPins,
      org: account.org,
      job: account.job,
      responderStatus: account.responderStatus || null,
      proStatus: account.proStatus || null,
      adminStatus: account.adminStatus || null,
      industry: account.industry || null,
      accepting: account.accepting,
    };
    state.userRole = account.role;
    state.responderFilter = { province: state.user.province || '', town: state.user.town || '' };

    if (account.role === 'admin') {
      state.currentView = 'admin-dashboard';
      state.adminTab = 'monitor';
      showToast('Welcome, Admin');
    } else if (account.role === 'professional') {
      state.currentView = 'pro-dashboard';
      state.proTab = 'clients';
      showToast(account.proStatus === 'approved' ? 'Signed in' : 'Signed in — awaiting verification', account.proStatus === 'approved' ? 'success' : 'warn');
    } else if (account.role === 'responder') {
      state.currentView = 'responder-dashboard';
      state.responderTab = 'feed';
      // Seed local accounts cache so dashboard status check works even before admin list loads
      if (!state.accounts.some(a => a.email === account.email)) {
        state.accounts.push({ ...account });
        store.set('sm_accounts', state.accounts);
      } else {
        const idx = state.accounts.findIndex(a => a.email === account.email);
        if (idx >= 0) state.accounts[idx] = { ...state.accounts[idx], ...account };
        store.set('sm_accounts', state.accounts);
      }
      showToast(data.warn || (account.responderStatus === 'pending' ? 'Signed in — awaiting admin approval' : `Signed in — ${state.user.town}`), (data.warn || account.responderStatus === 'pending') ? 'warn' : 'success');
    } else {
      state.currentView = 'user-dashboard';
      state.activeTab = 'home';
      showToast(`Welcome — ${state.user.town}`);
    }

    loadPinsForUser();
    persistSession();
    await syncFromServer();
    requestGPS();
  } catch (err) {
    LOGIN_LOCK.fails += 1;
    if (LOGIN_LOCK.fails >= 5) {
      LOGIN_LOCK.until = Date.now() + 30000;
      LOGIN_LOCK.fails = 0;
      showToast('Too many failed attempts. Locked for 30 seconds', 'error');
    } else {
      showToast(err.message || 'Could not sign in', 'error');
    }
  } finally {
    state.authLoading = false; safeRender();
  }
}

async function handleRegister() {
  const name = (document.getElementById('reg-name').value || '').trim() || 'New User';
  const email = (document.getElementById('reg-email').value || '').trim().toLowerCase();
  const password = document.getElementById('reg-password').value || '';
  const passwordConfirm = document.getElementById('reg-password-confirm')?.value || '';
  const role = state.registerRole;
  const adminKey = (document.getElementById('reg-admin-key')?.value || '').trim();
  const province = document.getElementById('reg-province')?.value || '';
  const town = document.getElementById('reg-town')?.value || '';
  const org = (document.getElementById('reg-org')?.value || '').trim() || 'Community Watch';
  const job = (document.getElementById('reg-job')?.value || '').trim();
  // Keep digits and leading + only
  const phoneRaw = (document.getElementById('reg-phone')?.value || '').trim();
  const phone = phoneRaw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const industry = document.getElementById('reg-industry')?.value || '';
  const license = (document.getElementById('reg-license')?.value || '').trim();
  const pin = (document.getElementById('reg-pin')?.value || '').trim();
  const duress = (document.getElementById('reg-duress-pin')?.value || '').trim();
  const needsPins = role === 'user' || role === 'professional';
  captureRegForm();
  state.authError = '';
  state.authLoading = true; safeRender();

  try {
    if (!email) throw new Error('Email is required');
    if (!phone || phone.replace(/\D/g,'').length < 9) throw new Error('Enter a valid cellphone number, e.g. 0821234567 or +27821234567');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
    if (password !== passwordConfirm) throw new Error('Passwords do not match');
    if (needsPins) {
      if (!/^\d{4,6}$/.test(pin)) throw new Error('Stand-down PIN must be 4–6 digits');
      if (!/^\d{4,6}$/.test(duress)) throw new Error('Duress PIN must be 4–6 digits');
      if (pin === duress) throw new Error('Duress PIN must be different from your stand-down PIN');
    }
    if (role === 'responder' && !job) throw new Error('Please select your job role');
    if (role === 'professional' && !industry) throw new Error('Please select your industry / specialty');
    if (role === 'professional' && !license) throw new Error('Professional registration number is required for verification');
    if (role !== 'admin') {
      if (!state.popiaAccepted) throw new Error('Tick the box to accept the privacy notice (POPIA)');
      if (!state.tosAccepted) throw new Error('Tick the box to accept the terms of service');
      if (!province || !town) throw new Error('Please select your province and town');
    }

    // Master key is validated only on the server — never compared in the browser
    const data = await api.register({
      name, email, phone, password, role, province, town, org, job,
      industry, license, adminKey,
      standDownPin: needsPins ? pin : undefined, duressPin: needsPins ? duress : undefined,
      popiaAccepted: state.popiaAccepted,
      tosAccepted: state.tosAccepted,
    });

    clearRegDraft();

    if (data.pending) {
      state.currentView = 'login';
      state.loginRole = role === 'admin' ? 'admin' : role;
      showToast(data.message || 'Awaiting approval', 'warn');
      return;
    }

    if (data.token) setToken(data.token);
    const account = data.user;
    const _reg = regionForUser(account.province || province, account.town || town);
    resetSessionState();
    state.user = {
      name: account.name, email: account.email, phone: account.phone,
      province: _reg.province, town: _reg.town, area: _reg.area, hasPins: !!account.hasPins,
      org: account.org, job: account.job,
      responderStatus: account.responderStatus || null,
      proStatus: account.proStatus || null,
      adminStatus: account.adminStatus || null,
      industry: account.industry || null,
      accepting: account.accepting,
    };
    state.userRole = account.role;
    state.responderFilter = { province: state.user.province || '', town: state.user.town || '' };

    if (account.role === 'admin') {
      state.currentView = 'admin-dashboard';
      state.adminTab = 'monitor';
      showToast('Admin account created');
    } else if (account.role === 'professional') {
      state.currentView = 'pro-dashboard';
      state.proTab = 'clients';
      showToast(data.message || 'Account created — awaiting admin verification', 'warn');
    } else if (account.role === 'responder') {
      state.currentView = 'responder-dashboard';
      state.responderTab = 'feed';
      if (!state.accounts.some(a => a.email === account.email)) {
        state.accounts.push({ ...account });
        store.set('sm_accounts', state.accounts);
      }
      showToast(data.message || 'Responder account created — pending admin approval', 'warn');
    } else {
      state.currentView = 'user-dashboard';
      state.activeTab = 'home';
      showToast(data.message || ('Account created — ' + town));
    }
    loadPinsForUser();
    if (needsPins) savePinsLocal(pin, duress);
    persistSession();
    await syncFromServer();
    requestGPS();
  } catch (err) {
    const msg = err.message || 'Could not create account';
    state.authError = msg;
    showToast(msg, 'error');
    console.error('register failed', err);
  } finally {
    state.authLoading = false; safeRender();
  }
}

async function handleForgotRequest() {
  const email = (document.getElementById('forgot-email')?.value || '').trim().toLowerCase();
  state.authLoading = true; safeRender();
  try {
    if (!email) throw new Error('Enter the account email');
    const r = await api.forgotRequest({ email, role: state.forgotRole });
    state.forgotEmail = email; state.forgotStep = 'confirm';
    showToast(r.message || 'Code sent', 'success');
  } catch (err) {
    showToast(err.message || 'Could not send a code', 'error');
  } finally { state.authLoading = false; safeRender(); }
}
async function handleForgotPassword() {
  const email = state.forgotEmail;
  const code = (document.getElementById('forgot-code')?.value || '').replace(/\D/g, '');
  const newPw = document.getElementById('forgot-new-password')?.value || '';
  const confirmPw = document.getElementById('forgot-confirm-password')?.value || '';
  const role = state.forgotRole;
  const fpKey = (document.getElementById('forgot-admin-key')?.value || '').trim();
  state.authLoading = true; safeRender();
  try {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code we sent you');
    if (!newPw || newPw.length < 6) throw new Error('New password must be at least 6 characters');
    if (newPw !== confirmPw) throw new Error('Passwords do not match');
    if (role === 'admin' && !fpKey) throw new Error('Admins also need the master key');
    await api.forgotConfirm({ email, role, code, newPassword: newPw, adminKey: fpKey });
    showToast('Password updated — you can sign in now', 'success');
    state.currentView = 'login'; state.loginRole = role; state.forgotStep = 'request'; state.forgotEmail = '';
  } catch (err) {
    showToast(err.message || 'Could not reset password', 'error');
  } finally { state.authLoading = false; safeRender(); }
}

async function handleChangePassword() {
  const currentPw = document.getElementById('change-current-password')?.value || '';
  const newPw = document.getElementById('change-new-password')?.value || '';
  const confirmPw = document.getElementById('change-confirm-password')?.value || '';
  const email = state.user?.email;
  if (!email) { showToast('Guests cannot set a password — create an account first', 'error'); return; }

  try {
    if (!currentPw) throw new Error('Enter your current password');
    if (!newPw || newPw.length < 6) throw new Error('New password must be at least 6 characters');
    if (newPw !== confirmPw) throw new Error('New passwords do not match');
    if (currentPw === newPw) throw new Error('New password must be different from the current one');

    await api.changePassword({ currentPassword: currentPw, newPassword: newPw });
    const cur = document.getElementById('change-current-password');
    const nw = document.getElementById('change-new-password');
    const cf = document.getElementById('change-confirm-password');
    if (cur) cur.value = '';
    if (nw) nw.value = '';
    if (cf) cf.value = '';
    showToast('Password changed successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Could not change password', 'error');
  }
}

async function adminResetPassword(email) {
  if (!email) return;
  const newPw = prompt('Enter a temporary new password for this account (min 6 characters):');
  if (!newPw) return;
  if (newPw.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
  if (!confirm(`Reset password for ${email}? They will need this temporary password to sign in.`)) return;

  try {
    refreshAllFromStorage();
    const account = state.accounts.find(a => a.email === email);
    if (!account) throw new Error('Account not found');
    const salt = randomSalt();
    const pw = await hashPw(newPw, salt);
    account.pw = pw;
    account.salt = salt;
    account.passwordResetAt = Date.now();
    account.passwordResetBy = state.user?.email || 'admin';
    store.set('sm_accounts', state.accounts);
    broadcast('accounts');
    showToast(`Password reset for ${account.name || email}`, 'success');
  } catch (err) {
    showToast(err.message || 'Reset failed', 'error');
  }
}

function persistSession() {
  store.set('sm_session', {
    user: state.user,
    role: state.userRole,
    responderFilter: state.responderFilter,
    at: Date.now()
  });
}

function resetSessionState() {
  state.accounts = []; INCIDENTS = []; CHATS = []; _chatsInit = false;
  state.me = null; state.geoRegion = null; state.locationSource = 'manual'; _lastGeo = { lat: null, lng: null, at: 0, busy: false };
  state.chatPro = null; state.chatWith = null; state.auditLogs = []; state.revealPin = null;
  state.personalPin = null; state.duressPin = null;
  Object.keys(routeCache).forEach(k => delete routeCache[k]);
  try { localStorage.removeItem('sm_accounts'); } catch {}
}
function signOut() {
  try { stopTracking(); } catch {}
  try { if (getToken()) api.logout().catch(() => {}); } catch {}
  store.remove('sm_session');
  setToken('');
  resetSessionState();
  state.proTab = 'clients'; state.activeTab = 'home';
  state.sosActive = false; state.sosIncidentId = null; state.silentSosActive = false;
  state.sessionUser = null;
  state.user = null;
  state.userRole = null;
  state.currentView = 'landing';
  safeRender();
}

function enterGuest() {
  const province = document.getElementById('guest-province').value || '';
  const town = document.getElementById('guest-town').value || '';
  if (!province || !town) { showToast('Please select a province and town','error'); return; }
  resetSessionState();
  const _r = regionForUser(province, town);
  state.user = { name:'Guest', town: _r.town, province, area: _r.area };
  loadPinsForUser();
  state.userRole = 'guest';
  state.currentView = 'user-dashboard';
  state.activeTab = 'home';
  refreshAllFromStorage();
  safeRender(); showToast('Entered anonymous emergency mode');
  requestGPS();
}

function quickExit() {
  try {
    const t = getToken();
    fetch('/api/logs/event', { method: 'POST', keepalive: true, headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: JSON.stringify({ type: 'quick_exit' }) }).catch(() => {});
  } catch {}
  try {
    Object.keys(localStorage).filter(k => k.indexOf('sm_') === 0).forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {}
  try { window.history.replaceState(null, '', '/'); } catch {}
  window.location.replace('https://www.google.com/search?q=weather');
}

function requestGPS() {
  state.gpsStatus = 'locating';
  safeRender();
  if (!navigator.geolocation) {
    state.gpsStatus = 'unavailable';
    safeRender();
    return;
  }
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
    state.gpsStatus = 'insecure';
    safeRender();
    showToast('GPS only works on HTTPS or localhost — see README (phones need an https link)', 'error');
    return;
  }
  const ok = (pos) => {
    state.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
    state.gpsStatus = 'verified';
    safeRender();
    detectRegionFromGPS({ force: true });
  };
  navigator.geolocation.getCurrentPosition(
    ok,
    (err) => {
      if (err && err.code === 3) {   // timeout with high accuracy → retry with network/Wi-Fi location
        navigator.geolocation.getCurrentPosition(ok, (e2) => {
          state.gpsStatus = e2 && e2.code === 1 ? 'denied' : 'error'; safeRender();
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 });
        return;
      }
      state.gpsStatus = err && err.code === 1 ? 'denied' : 'error';
      if (err && err.code === 1) logEvt('gps_denied');
      safeRender();
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

/* ============================================================
   REAL LOCATION  (GPS → town / province)
   The town you pick when you sign up is only a fallback. As soon as the device gives us a
   GPS fix we work out where you really are, so alerts reach the responders who are actually nearby.
   ============================================================ */
let _townIndex = null;
function townIndex() {
  if (_townIndex) return _townIndex;
  _townIndex = {};
  Object.keys(SA_TOWNS_DATA).forEach(p => SA_TOWNS_DATA[p].forEach(t => { _townIndex[t.toLowerCase()] = { name: t, province: p }; }));
  return _townIndex;
}
function _norm(s) {
  return String(s || '').toLowerCase()
    .replace(/\b(local|metropolitan|district)\s+municipality\b/g, '').replace(/\bmunicipality\b/g, '')
    .replace(/^city of\s+/, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function matchProvince(name) {
  const n = _norm(name); if (!n) return '';
  return SA_PROVINCES.find(p => _norm(p) === n) || SA_PROVINCES.find(p => _norm(p).replace(/ /g, '') === n.replace(/ /g, '')) || '';
}
function findTownIn(province, candidates) {
  const list = SA_TOWNS_DATA[province] || [];
  for (const c of candidates) {
    const n = _norm(c); if (!n) continue;
    const hit = list.find(t => _norm(t) === n);
    if (hit) return hit;
  }
  return '';
}
function nearestKnownTown(lat, lng, province, maxKm) {
  const idx = townIndex(); let best = null;
  Object.keys(TOWN_COORDS).forEach(k => {
    const info = idx[k]; if (!info) return;
    if (province && info.province !== province) return;
    const c = TOWN_COORDS[k], d = haversineKm(lat, lng, c[0], c[1]);
    if (!best || d < best.d) best = { d, name: info.name, province: info.province };
  });
  return best && best.d <= maxKm ? best : null;
}
function resolveRegion(a, lat, lng) {
  a = a || {};
  let province = matchProvince(a.state) || matchProvince(a.region) || matchProvince(a.province);
  if (!province) { const n = nearestKnownTown(lat, lng, '', 150); if (n) province = n.province; }
  if (!province) return null;
  const cand = [a.city, a.town, a.municipality, a.county, a.suburb, a.village, a.city_district, a.neighbourhood, a.hamlet, a.state_district];
  let town = findTownIn(province, cand), custom = false;
  if (!town) { const n = nearestKnownTown(lat, lng, province, 45); if (n) town = n.name; }
  if (!town) { town = cand.find(Boolean) || ''; custom = !!town; }
  if (!town) return null;
  const area = [a.suburb, a.neighbourhood, a.city_district, a.village, a.hamlet, a.town, a.city]
    .find(x => x && _norm(x) !== _norm(town)) || '';
  if (custom && !SA_TOWNS_DATA[province].includes(town)) SA_TOWNS_DATA[province].push(town);
  return { town, province, area, custom };
}
async function reverseGeocodeClient(lat, lng) {
  try { const r = await api.reverseGeocode(lat, lng); if (r && r.address) return r.address; } catch {}
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=14&accept-language=en&lat=${lat}&lon=${lng}`,
      { signal: ctl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(tm);
    if (r.ok) { const j = await r.json(); if (j && j.address) return j.address; }
  } catch {}
  return null;
}
let _lastGeo = { lat: null, lng: null, at: 0, busy: false };
async function detectRegionFromGPS(opts = {}) {
  const c = state.userCoords; if (!c) return null;
  const moved = _lastGeo.lat === null ? Infinity : haversineKm(c.lat, c.lng, _lastGeo.lat, _lastGeo.lng);
  if (!opts.force && _lastGeo.lat !== null && moved < 0.5 && Date.now() - _lastGeo.at < 5 * 60 * 1000) return state.geoRegion;
  if (_lastGeo.busy) return state.geoRegion;
  _lastGeo.busy = true; state.geoBusy = true;
  try {
    const addr = await reverseGeocodeClient(c.lat, c.lng);
    let region = addr ? resolveRegion(addr, c.lat, c.lng) : null;
    if (!region) {                       // geocoder offline → nearest town we know about
      const n = nearestKnownTown(c.lat, c.lng, '', 60);
      if (n) region = { town: n.name, province: n.province, area: '', custom: false };
    }
    _lastGeo = { lat: c.lat, lng: c.lng, at: Date.now(), busy: true };
    if (!region) { state.geoBusy = false; safeRender(); return null; }
    const canon = canonicalRegion(region.province, region.town);
    region = { ...region, town: canon.town, area: region.area || canon.area || '' };
    state.geoRegion = { ...region, at: Date.now(), lat: c.lat, lng: c.lng };
    applyDetectedRegion(opts);
    return state.geoRegion;
  } catch (e) { console.warn('detectRegion', e); return null; }
  finally { _lastGeo.busy = false; state.geoBusy = false; }
}
function applyDetectedRegion(opts = {}) {
  const g = state.geoRegion, u = state.user;
  if (!g || !u) return;
  const role = state.userRole;
  state.locationSource = 'gps';
  if (role === 'responder' || role === 'admin') {
    // Responders/admins pick their own command region — we only offer the GPS one.
    u.area = g.area || '';
    if (role === 'responder' && !(state.responderFilter && state.responderFilter.town)) {
      state.responderFilter = { province: g.province, town: g.town };
      persistSession();
    }
    safeRender();
    return;
  }
  const changed = String(u.town || '').toLowerCase() !== g.town.toLowerCase() || String(u.province || '').toLowerCase() !== g.province.toLowerCase();
  u.town = g.town; u.province = g.province; u.area = g.area || '';
  state.responderFilter = { province: g.province, town: g.town };
  persistSession();
  if (changed && !opts.silent) {
    showToast(`📍 Location updated: ${g.area ? g.area + ', ' : ''}${g.town}, ${g.province}`, 'success');
    logEvt('location_detected', `${g.town}, ${g.province}`);
  }
  safeRender();
}
function locationChip() {
  const u = state.user || {}, g = state.gpsStatus;
  const place = [u.area, u.town].filter(Boolean).join(', ');
  const full = place ? esc(place) + (u.province ? ', ' + esc(u.province) : '') : 'Location unknown';
  const verified = state.locationSource === 'gps' && !!state.geoRegion;
  let badge, cls;
  if (g === 'locating' || state.geoBusy) { badge = 'Locating…'; cls = 'bg-slate-800 text-slate-300 border-slate-600'; }
  else if (verified) { badge = '✔ GPS-verified'; cls = 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50'; }
  else if (g === 'denied') { badge = 'GPS blocked'; cls = 'bg-amber-900/40 text-amber-300 border-amber-700/50'; }
  else if (g === 'insecure') { badge = 'GPS needs HTTPS'; cls = 'bg-amber-900/40 text-amber-300 border-amber-700/50'; }
  else { badge = 'Not verified'; cls = 'bg-amber-900/40 text-amber-300 border-amber-700/50'; }
  const showBtn = !verified && g !== 'locating' && !state.geoBusy;
  return `<div class="inline-flex flex-wrap items-center justify-center gap-2">
    <span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border bg-blue-900/60 text-blue-200 border-blue-700/50">📍 ${full}</span>
    <span class="text-[10px] px-2 py-0.5 rounded-full border ${cls}">${badge}</span>
    ${showBtn ? '<button data-action="retry-gps" class="keep-small text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-blue-300 border border-slate-600">Use my GPS</button>' : ''}
  </div>`;
}
function renderGpsRegionBanner() {
  const g = state.geoRegion; if (!g) return '';
  const cur = state.responderFilter || {};
  if (String(cur.town || '').toLowerCase() === g.town.toLowerCase() && String(cur.province || '').toLowerCase() === g.province.toLowerCase()) return '';
  return `<div class="bg-blue-950/50 border border-blue-700/50 rounded-xl p-3 flex items-center justify-between gap-3">
    <p class="text-xs text-blue-200">📍 GPS says you are in <b>${esc(g.area ? g.area + ', ' : '')}${esc(g.town)}, ${esc(g.province)}</b>. Your command region is ${esc(cur.town || 'not set')}.</p>
    <button data-action="use-gps-region" class="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Use GPS region</button>
  </div>`;
}

/* ============================================================
   SOS
   ============================================================ */
let sosPressTimer = null, sosCountdownTimer = null, sosArmed = false;
function startSOSPress(btn) {
  if (state.sosActive || state.showAbortModal) return;
  state.pressing = true;
  sosArmed = true;
  if (btn) btn.classList.add('pressing');
  if (navigator.vibrate) navigator.vibrate(50);
  clearTimeout(sosPressTimer);
  sosPressTimer = setTimeout(() => {
    sosArmed = false;
    state.countdown = 3;
    if (navigator.vibrate) navigator.vibrate([100,50,100]);
    safeRender(); startSOSCountdown();
  }, 800);
}
function endSOSPress() {
  state.pressing = false;
  const btn = document.querySelector('[data-action="start-sos"]');
  if (btn) btn.classList.remove('pressing');
  clearTimeout(sosPressTimer);
  if (sosArmed) {
    sosArmed = false;
    showToast('Press and HOLD the SOS button to send an alert','info');
  }
  if (state.countdown > 0) return;
  state.countdown = 0;
}
function startSOSCountdown() {
  clearInterval(sosCountdownTimer);
  sosCountdownTimer = setInterval(() => {
    state.countdown -= 1;
    if (navigator.vibrate) navigator.vibrate(30);
    if (state.countdown <= 0) { clearInterval(sosCountdownTimer); showAbortModal(); }
    else { safeRender(); }
  }, 1000);
}
let abortTimer = null;
function showAbortModal() {
  state.showAbortModal = true;
  state.abortCountdown = 3;
  safeRender();
  clearInterval(abortTimer);
  abortTimer = setInterval(() => {
    state.abortCountdown -= 1;
    if (state.abortCountdown <= 0) { clearInterval(abortTimer); confirmSOS(); }
    else { safeRender(); }
  }, 1000);
}
function confirmSOS() {
  clearInterval(abortTimer);
  state.showAbortModal = false;
  state.countdown = 0;
  state.pressing = false;
  state.sosActive = true;
  refreshAllFromStorage();
  const coords = incidentCoords({ lat: state.userCoords?.lat, lng: state.userCoords?.lng, town: state.user?.town });
  const inc = {
    id: Date.now(),
    user: state.user?.name || 'Anonymous',
    ownerEmail: state.user?.email || null,
    town: state.user?.town || '',
    province: state.user?.province || '',
    area: state.user?.area || '',
    reporterRole: state.userRole || 'guest',
    approxLocation: !(state.userCoords && typeof state.userCoords.lat === 'number'),
    category: 'SOS Emergency',
    status: 'Pending',
    time: new Date().toISOString(),
    lat: coords[0], lng: coords[1],
    description: 'SOS panic button triggered.',
    responder: null, eta: null, resolution: 'pending', confirmedByUser: null, escalation: '',
    forcedBy: null, isDuress: false,
    acknowledged: false, ackAt: null,
    dispatched: false, dispatchAt: null, dispatchUnit: null
  };
  INCIDENTS.unshift(inc);
  persistIncidents();
  state.sosIncidentId = inc.id;
  state.sosIsDuress = false;
  api.createIncident(inc).catch(err => showToast(err.message || 'Could not sync SOS to server', 'warn'));
  if (navigator.vibrate) navigator.vibrate([200,100,200,100,200]);
  acquireWakeLock();
  safeRender();
  showToast('SOS sent — waiting for responder acknowledgment','error');
  if (state.recConsent) startRecording(inc.id);
}
function abortSOS() {
  clearInterval(abortTimer);
  state.showAbortModal = false;
  state.countdown = 0;
  safeRender(); showToast('SOS cancelled');
}
function triggerSilentSOS() {
  refreshAllFromStorage();
  const coords = incidentCoords({ lat: state.userCoords?.lat, lng: state.userCoords?.lng, town: state.user?.town });
  const inc = {
    id: Date.now(),
    user: state.user?.name || 'Anonymous',
    ownerEmail: state.user?.email || null,
    town: state.user?.town || '',
    province: state.user?.province || '',
    area: state.user?.area || '',
    reporterRole: state.userRole || 'guest',
    approxLocation: !(state.userCoords && typeof state.userCoords.lat === 'number'),
    category: 'SILENT SOS',
    status: 'Pending',
    time: new Date().toISOString(),
    lat: coords[0], lng: coords[1],
    description: 'Silent SOS triggered. Do not call back — user may be in danger.',
    responder: null, eta: null, resolution: 'pending', confirmedByUser: null, escalation: '',
    forcedBy: null, isDuress: false,
    acknowledged: false, ackAt: null,
    dispatched: false, dispatchAt: null, dispatchUnit: null
  };
  INCIDENTS.unshift(inc);
  persistIncidents();
  state.silentSosActive = true;
  api.createIncident(inc).catch(err => showToast(err.message || 'Could not sync silent SOS', 'warn'));
  acquireWakeLock();
  safeRender();
  showToast('Silent SOS sent','info');
  if (state.recConsent) startRecording(inc.id);
}

/* ============================================================
   STAND-DOWN & DURESS
   ============================================================ */
/* PINs are stored per account on this device (so you can view them) AND as hashes on the server
   (so a new phone still works). The two PINs must always be different. */
function pinKey(kind) {
  const e = state.user && state.user.email ? String(state.user.email).toLowerCase() : '';
  return e ? `sm_${kind}:${e}` : `sm_${kind}`;
}
function loadPinsForUser() {
  state.personalPin = store.get(pinKey('pin'), null);
  state.duressPin = store.get(pinKey('duress_pin'), null);
  state.revealPin = null;
}
function savePinsLocal(pin, duress) {
  if (pin !== undefined && pin !== null) { state.personalPin = pin; store.set(pinKey('pin'), pin); }
  if (duress !== undefined && duress !== null) { state.duressPin = duress; store.set(pinKey('duress_pin'), duress); }
}
function isLoggedInAccount() { return !!(state.user && state.user.email && state.userRole && state.userRole !== 'guest' && getToken()); }

async function standDown() {
  const pin = (document.getElementById('stand-down-pin') || {}).value || '';
  const loggedIn = isLoggedInAccount();
  if (!state.personalPin && !state.duressPin && !(loggedIn && state.user.hasPins)) { showToast('Set a stand-down PIN in Settings first','error'); return; }

  let outcome = 'wrong';
  if (state.duressPin && safeEqual(pin, state.duressPin)) outcome = 'duress';
  else if (state.personalPin && safeEqual(pin, state.personalPin)) outcome = 'normal';
  if (outcome === 'wrong' && loggedIn && state.user.hasPins) {
    // this device has no (or an old) copy of the PIN — ask the server
    try { const r = await api.verifyPin(pin); outcome = r.result || 'wrong'; }
    catch (err) { showToast(err.message || 'Could not verify PIN', 'error'); return; }
  }

  const activeInc = INCIDENTS.find(i =>
    incidentBelongsToMe(i) && i.status !== 'Resolved' && i.status !== 'False Alarm' && !i.hiddenFromOwner && !i.isDuress
  );
  const targetId = state.sosIncidentId || (activeInc && activeInc.id) || null;

  if (outcome === 'duress') {
    if (targetId) {
      refreshAllFromStorage();
      const inc = getIncidentById(targetId);
      if (inc) {
        inc.isDuress = true;
        inc.status = 'Duress';
        inc.category = 'DURESS SOS';
        inc.description = 'DURESS ALERT — user may be under threat. Do not call back. Dispatch silently.';
        // Hidden from the survivor's UI so the app appears cancelled to anyone watching the screen
        inc.hiddenFromOwner = true;
        persistIncidents();
        api.updateIncident(inc.id, {
          isDuress: true, status: 'Duress', category: 'DURESS SOS',
          description: inc.description, hiddenFromOwner: true,
        }).catch(() => {});
      }
    }
    state.sosActive = false;
    state.sosIncidentId = null;
    state.sosIsDuress = true;
    state.silentSosActive = false;
    releaseWakeLock();
    // Appear identical to a normal stand-down
    safeRender();
    showToast('Alert stood down. Stay safe.','success');
    return;
  }

  if (outcome === 'normal') {
    if (targetId) {
      refreshAllFromStorage();
      const inc = getIncidentById(targetId);
      if (inc) {
        inc.status = 'Resolved'; inc.resolution = 'resolved'; inc.confirmedByUser = true;
        persistIncidents();
        api.updateIncident(inc.id, { status: 'Resolved', resolution: 'resolved', confirmedByUser: true }).catch(() => {});
      }
    }
    state.sosActive = false;
    state.sosIncidentId = null;
    state.silentSosActive = false;
    releaseWakeLock();
    safeRender(); showToast('Alert stood down. Stay safe.','success');
  } else {
    showToast('Incorrect PIN','error');
  }
}
async function savePin() {
  const v = (document.getElementById('pin-input') || {}).value || '';
  if (!/^\d{4,6}$/.test(v)) { showToast('PIN must be 4–6 digits','error'); return; }
  if (state.duressPin && safeEqual(v, state.duressPin)) { showToast('Stand-down PIN must be different from your duress PIN','error'); return; }
  if (isLoggedInAccount()) {
    try { const r = await api.setPins({ standDownPin: v }); state.user.hasPins = !!r.hasPins; }
    catch (err) { showToast(err.message || 'Could not save PIN','error'); return; }
  }
  savePinsLocal(v, undefined);
  safeRender();
  showToast('Stand-down PIN updated');
}
async function saveDuressPin() {
  const v = (document.getElementById('duress-pin-input') || {}).value || '';
  if (!/^\d{4,6}$/.test(v)) { showToast('Duress PIN must be 4–6 digits','error'); return; }
  if (state.personalPin && safeEqual(v, state.personalPin)) {
    showToast('Duress PIN must be different from your stand-down PIN','error'); return;
  }
  if (isLoggedInAccount()) {
    try { const r = await api.setPins({ duressPin: v }); state.user.hasPins = !!r.hasPins; }
    catch (err) { showToast(err.message || 'Could not save PIN','error'); return; }
  }
  savePinsLocal(undefined, v);
  safeRender();
  showToast('Duress PIN set — remember it silently escalates','warn');
}
function clearDuressPin() {
  if (isLoggedInAccount()) { showToast('Accounts must keep a duress PIN — change it instead','info'); return; }
  if (!confirm('Remove your duress PIN? You will lose the silent escalation feature.')) return;
  state.duressPin = null;
  store.remove(pinKey('duress_pin'));
  safeRender();
  showToast('Duress PIN removed','info');
}
function pinsBanner() {
  if (!isLoggedInAccount() || !['user', 'professional'].includes(state.userRole)) return '';
  if (state.user.hasPins && state.personalPin && state.duressPin) return '';
  if (state.user.hasPins) return '';
  return `<div class="bg-amber-950/40 border border-amber-700/50 rounded-xl p-3 text-xs text-amber-200" role="alert">
    ⚠ Your account has no emergency PINs yet. Set a <b>stand-down PIN</b> and a different <b>duress PIN</b> in Settings so you can cancel (or silently escalate) an SOS.
    <button ${state.userRole === 'professional' ? 'data-pro-tab="settings"' : 'data-tab="settings"'} class="ml-1 underline font-bold">Open Settings</button></div>`;
}
function renderPinSettings() {
  const reveal = state.revealPin;
  const cur = (kind, val, label) => `
    <div class="flex items-center justify-between bg-slate-950 rounded-lg px-3 py-2">
      <span class="text-xs text-slate-400">Current ${label} PIN</span>
      <span class="flex items-center gap-3">
        ${val
          ? `<span class="font-mono tracking-widest text-sm ${reveal === kind ? 'text-white' : 'text-slate-500'}">${reveal === kind ? esc(val) : '•'.repeat(val.length)}</span>
             <button data-action="reveal-pin" data-kind="${kind}" class="keep-small text-xs font-semibold text-blue-400">${reveal === kind ? 'Hide' : 'Show'}</button>`
          : '<span class="text-[11px] text-slate-500">not saved on this device</span>'}
      </span>
    </div>`;
  const inp = (id, ph, border) => `
    <div class="relative flex-1">
      <input id="${id}" type="password" maxlength="6" inputmode="numeric" placeholder="${ph}" autocomplete="off" class="w-full px-3 py-2.5 pr-14 bg-slate-800 border ${border} rounded-lg text-white text-center tracking-widest"/>
      <button type="button" data-action="toggle-password" data-target="${id}" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-semibold" aria-label="Show PIN">Show</button>
    </div>`;
  return `
      <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-slate-300">Stand-Down PIN</h3>
        <p class="text-xs text-slate-500">A 4–6 digit PIN that really cancels your SOS alert. It must be different from your duress PIN.</p>
        ${cur('pin', state.personalPin, 'stand-down')}
        <div class="flex gap-2">
          ${inp('pin-input', state.personalPin ? 'Change PIN' : 'Set PIN', 'border-slate-700')}
          <button data-action="save-pin" class="px-4 py-2.5 bg-slate-700 text-white rounded-lg font-bold text-sm">Save</button>
        </div>
      </div>

      <div class="bg-slate-900 rounded-xl border-2 border-red-800/60 p-4 space-y-3">
        <div class="flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <h3 class="text-sm font-bold text-red-300">Duress PIN</h3>
        </div>
        <p class="text-xs text-slate-400">If you are forced to cancel an alert, enter this PIN instead of your real one. The app will look like it cancelled, but responders receive a high-priority DURESS signal.</p>
        ${cur('duress', state.duressPin, 'duress')}
        <div class="flex gap-2">
          ${inp('duress-pin-input', state.duressPin ? 'Change duress PIN' : 'Set duress PIN', 'border-red-900/60')}
          <button data-action="save-duress-pin" class="px-4 py-2.5 bg-red-700 text-white rounded-lg font-bold text-sm">${state.duressPin ? 'Update' : 'Save'}</button>
          ${!isLoggedInAccount() && state.duressPin ? '<button data-action="clear-duress-pin" class="px-3 py-2.5 bg-red-900/50 text-red-300 rounded-lg font-bold text-sm">Clear</button>' : ''}
        </div>
      </div>`;
}
function addContact() {
  if (state.emergencyContacts.length >= 3) { showToast('Max 3 contacts','error'); return; }
  const name = prompt('Contact name:');
  const phone = prompt('Contact phone number:');
  if (name && phone) {
    state.emergencyContacts.push({ name, phone });
    store.set('sm_contacts', state.emergencyContacts);
    safeRender(); showToast('Contact added');
  }
}

/* ============================================================
   CHECK-IN
   ============================================================ */
let checkInTicker = null;
function startCheckInTicker() { if (checkInTicker) return; checkInTicker = setInterval(tickCheckIn, 1000); }
function stopCheckInTicker() { clearInterval(checkInTicker); checkInTicker = null; }
function startCheckIn() {
  const mins = parseInt(document.getElementById('checkin-minutes').value || '30');
  if (!mins || mins < 1 || mins > 240) { showToast('Choose 1–240 minutes','error'); return; }
  state.checkInActive = true;
  state.checkInDuration = mins;
  state.checkInEndsAt = Date.now() + mins * 60 * 1000;
  store.set('sm_checkin_ends', state.checkInEndsAt);
  startCheckInTicker();
  safeRender();
  showToast(`Check-in set for ${mins} min`);
}
function checkInImSafe() {
  state.checkInActive = false;
  state.checkInEndsAt = 0;
  store.remove('sm_checkin_ends');
  stopCheckInTicker();
  safeRender(); showToast('Glad you are safe','success');
}
function cancelCheckIn() {
  state.checkInActive = false;
  state.checkInEndsAt = 0;
  store.remove('sm_checkin_ends');
  stopCheckInTicker();
  safeRender(); showToast('Check-in cancelled');
}
function tickCheckIn() {
  if (!state.checkInActive) { stopCheckInTicker(); return; }
  const remain = state.checkInEndsAt - Date.now();
  if (remain <= 0) {
    state.checkInActive = false;
    state.checkInEndsAt = 0;
    store.remove('sm_checkin_ends');
    stopCheckInTicker();
    state.countdown = 3;
    state.pressing = true;
    safeRender();
    showAbortModal();
  } else {
    const el = document.getElementById('checkin-remaining');
    if (el) {
      const m = Math.floor(remain / 60000);
      const s = Math.floor((remain % 60000) / 1000);
      el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    }
  }
}
if (state.checkInActive) startCheckInTicker();

/* ============================================================
   REPORT
   ============================================================ */
function submitReport() {
  const category = document.getElementById('report-category').value;
  const description = document.getElementById('report-description').value;
  if (!category) { showToast('Please select a threat category','error'); return; }
  const anon = state.anonymityToggle;
  const attachments = (state.reportAttachments || []).slice();
  if (!attachments.length) {
    showToast('Please upload evidence before submitting — your report has been kept','error');
    setTimeout(() => { const c = document.getElementById('report-category'), d = document.getElementById('report-description'); if (c) c.value = category; if (d) d.value = description; }, 0);
    return;
  }

  state.logs.unshift({
    id: Date.now(), date: new Date().toLocaleString(), category, description,
    anonymous: anon, town: anon ? 'Hidden' : (state.user?.town || 'Unknown'),
    evidenceCount: attachments.length
  });
  store.set('sm_logs', state.logs);

  refreshAllFromStorage();
  const townForCoords = anon ? null : state.user?.town;
  const coords = anon ? [0, 0] : incidentCoords({ lat: state.userCoords?.lat, lng: state.userCoords?.lng, town: townForCoords });
  const incidentId = Date.now();
  const ownerEmail = anon ? 'anonymous' : (state.user?.email || 'guest-session');
  const incident = {
    id: incidentId,
    user: anon ? 'Anonymous' : (state.user?.name || 'User'),
    ownerEmail: anon ? null : (state.user?.email || null),
    town: state.user?.town || '',
    province: state.user?.province || '',
    category, status:'Pending', time:new Date().toISOString(),
    lat: coords[0], lng: coords[1],
    description: description || 'No description',
    evidenceCount: attachments.length,
    responder: null, eta: null, resolution: 'pending', confirmedByUser: null, escalation: '',
    forcedBy: null, isDuress: false,
    acknowledged: false, ackAt: null,
    dispatched: false, dispatchAt: null, dispatchUnit: null
  };
  INCIDENTS.unshift(incident);
  persistIncidents();

  // Evidence is linked to the incident so responders can view it; only the owner can delete.
  attachEvidenceToIncident(incidentId, attachments, ownerEmail);
  state.reportAttachments = [];

  api.createIncident(incident).then(async () => {
    showToast(
      (anon ? 'Anonymous report sent to responders' : 'Report sent to responders') +
      (attachments.length ? ` with ${attachments.length} evidence file${attachments.length !== 1 ? 's' : ''}` : ''),
      'success'
    );
    await uploadReportEvidence(incident.id, attachments);
  }).catch(err => showToast(err.message || 'Report saved locally but could not reach server', 'warn'));

  safeRender();
}

/* ============================================================
   FAKE CALL
   ============================================================ */
function startFakeCall() {
  state.fakeCallActive = true;
  state.fakeCallSeconds = 0;
  clearInterval(state.fakeCallTimer);
  state.fakeCallTimer = setInterval(() => {
    state.fakeCallSeconds += 1;
    const el = document.getElementById('fake-call-timer');
    if (el) el.textContent = formatCallTime(state.fakeCallSeconds);
  }, 1000);
  safeRender();
}
function endFakeCall() {
  state.fakeCallActive = false;
  clearInterval(state.fakeCallTimer);
  safeRender();
}
function formatCallTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return m + ':' + ss;
}
function saveFakeCallConfig() { store.set('sm_fakecall', state.fakeCallConfig); }
function saveFakeCallConfigFromForm() {
  const name = (document.getElementById('fc-name').value || '').trim() || 'Mom';
  const number = (document.getElementById('fc-number').value || '').trim() || '+27 82 123 4567';
  const letter = (document.getElementById('fc-letter').value || '').trim().slice(0,1).toUpperCase() || name.charAt(0).toUpperCase();
  const color = document.getElementById('fc-color').value || '#ec4899';
  state.fakeCallConfig = { name, number, letter, color, preset:'custom' };
  saveFakeCallConfig();
  state.showFakeCallConfig = false;
  safeRender();
  showToast('Fake call settings saved');
}

/* ============================================================
   AUDIO EVIDENCE
   ============================================================ */
function toggleRecConsent() {
  if (!state.recConsent) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          state.recConsent = true;
          store.set('sm_rec_consent', true);
          safeRender();
          showToast('Microphone access granted — recordings stored only on this device','success');
        })
        .catch(() => {
          showToast('Microphone permission denied — recording disabled','error');
        });
    } else {
      showToast('Microphone not supported on this device','error');
    }
  } else {
    state.recConsent = false;
    store.set('sm_rec_consent', false);
    safeRender();
    showToast('Audio evidence disabled','info');
  }
}
function preferredAudioMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
}
async function startRecording(incidentId) {
  if (!state.recConsent) return;
  if (state.isRecording) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Microphone not supported in this browser','error');
    return;
  }
  if (typeof MediaRecorder === 'undefined') {
    showToast('Audio recording is not supported in this browser','error');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = preferredAudioMime();
    const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    state.mediaRecorder = mr;
    state.recChunks = [];
    state.recStartedAt = Date.now();
    state.recordingIncidentId = incidentId;
    state.isRecording = true;
    mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) state.recChunks.push(e.data); };
    mr.onerror = () => showToast('Recording error','error');
    mr.onstop = () => {
      try {
        const blobType = mr.mimeType || mime || 'audio/webm';
        const blob = new Blob(state.recChunks, { type: blobType });
        if (!blob.size) {
          showToast('Recording was empty — try again','error');
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const mimeType = blob.type || blobType;
          EVIDENCE.push({
            id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            incidentId: incidentId || null,
            ownerEmail: state.user?.email || 'guest-session',
            fileName: `recording-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.webm`,
            dataUrl: reader.result,
            mimeType,
            kind: 'audio',
            size: blob.size,
            duration: Math.max(1, Math.round((Date.now() - state.recStartedAt) / 1000)),
            createdAt: Date.now(),
            keep: false,
            source: 'mic'
          });
          persistEvidence();
          safeRender();
          showToast('Recording saved — open Tools to listen','success');
        };
        reader.onerror = () => showToast('Could not save recording','error');
        reader.readAsDataURL(blob);
      } finally {
        stream.getTracks().forEach(t => t.stop());
      }
    };
    mr.start(1000);
    safeRender();
    showToast('Recording started — stored only on this device','info');
    setTimeout(() => {
      if (state.isRecording && state.recordingIncidentId === incidentId) stopRecording();
    }, 120000);
  } catch (err) {
    const msg = (err && err.name === 'NotAllowedError')
      ? 'Microphone permission denied'
      : 'Could not start recording';
    showToast(msg, 'error');
  }
}
function startRecordingManual() {
  if (!state.recConsent) { showToast('Enable audio evidence first (toggle above)','error'); return; }
  if (state.isRecording) { showToast('Already recording','info'); return; }
  startRecording(state.sosIncidentId || ('manual-' + Date.now()));
}
function stopRecording() {
  if (!state.isRecording || !state.mediaRecorder) return;
  try { state.mediaRecorder.stop(); } catch {}
  state.isRecording = false;
  state.mediaRecorder = null;
  state.recordingIncidentId = null;
  safeRender();
}
let activeEvidenceAudio = null;
function playEvidence(evId) {
  const ev = EVIDENCE.find(e => e.id === evId);
  if (!ev || !evSrc(ev)) {
    showToast('Recording not found','error');
    return;
  }
  try {
    if (activeEvidenceAudio) {
      try { activeEvidenceAudio.pause(); } catch {}
      activeEvidenceAudio = null;
    }
    const a = new Audio(evSrc(ev));
    a.setAttribute('playsinline', 'true');
    a.preload = 'auto';
    activeEvidenceAudio = a;
    a.onended = () => { activeEvidenceAudio = null; };
    a.onerror = () => {
      showToast('Could not play this recording','error');
      activeEvidenceAudio = null;
    };
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => showToast('Playing recording…','info'))
       .catch(() => {
         // Fallback: open in new tab / force user gesture path via visible controls
         const el = document.getElementById('evidence-audio-' + evId);
         if (el) {
           el.play().catch(() => showToast('Tap the audio player controls to listen','warn'));
         } else {
           showToast('Tap the audio player controls to listen','warn');
         }
       });
    }
  } catch {
    showToast('Could not play recording','error');
  }
}
function deleteEvidence(evId) {
  const ev = EVIDENCE.find(e => e.id === evId);
  if (!ev) { showToast('File not found','error'); return; }
  if (!canDeleteEvidence(ev)) {
    showToast('Responders cannot delete survivor evidence','error');
    return;
  }
  if (!confirm('Delete this evidence file permanently?')) return;
  if (ev.fromServer) api.deleteEvidence(evId, ev.incidentId).catch(err => showToast(err.message || 'Could not delete the server copy', 'error'));
  try { idbDel(evId); delete EV_URLS[evId]; } catch {}
  if (activeEvidenceAudio) { try { activeEvidenceAudio.pause(); } catch {} activeEvidenceAudio = null; }
  EVIDENCE = EVIDENCE.filter(e => e.id !== evId);
  persistEvidence();
  safeRender();
  showToast('Evidence deleted','info');
}
function addReportAttachmentFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const remaining = EVIDENCE_MAX_FILES - state.reportAttachments.length;
  if (remaining <= 0) {
    showToast(`Maximum ${EVIDENCE_MAX_FILES} files per report`,'error');
    return;
  }
  files.slice(0, remaining).forEach(file => {
    if (file.size > EVIDENCE_MAX_BYTES) {
      showToast(`${file.name} is too large (max ${formatBytes(EVIDENCE_MAX_BYTES)})`,'error');
      return;
    }
    const used = state.reportAttachments.reduce((n, a) => n + (a.size || 0), 0);
    if (used + file.size > EVIDENCE_MAX_BYTES) { showToast('Evidence is limited to 500 MB per report','error'); return; }
    state.reportAttachments.push({
      tempId: 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      fileName: file.name, mimeType: file.type || 'application/octet-stream',
      size: file.size, kind: evidenceKind(file.type, file.name), blob: file
    });
    safeRender();
  });
}
function removeReportAttachment(tempId) {
  state.reportAttachments = state.reportAttachments.filter(a => a.tempId !== tempId);
  safeRender();
}

/* Evidence you attach to a REPORT is sent to the server so responders on other devices can open it.
   (Voice recordings made with the mic button still stay on this device only.) */
async function uploadReportEvidence(incidentId, attachments) {
  const files = (attachments || []).filter(a => a.blob);
  if (!files.length) return;
  let ok = 0, skipped = 0, failed = 0;
  for (const a of files) {
    const mt = String(a.mimeType || '').toLowerCase();
    if (!/^(image|video|audio)\//.test(mt) && mt !== 'application/pdf') { skipped++; continue; }
    try {
      const fd = new FormData();
      fd.append('file', a.blob, a.fileName || 'evidence');
      fd.append('incidentId', String(incidentId));
      fd.append('kind', a.kind || 'file');
      if (a.duration) fd.append('duration', String(a.duration));
      const r = await api.uploadEvidence(fd, incidentId);
      const local = EVIDENCE.find(e => e.incidentId === incidentId && e.fileName === a.fileName && e.size === a.size && !e.serverId);
      if (local && r && r.evidence) local.serverId = r.evidence.id;
      ok++;
    } catch { failed++; }
  }
  persistEvidence();
  if (ok) showToast(`${ok} evidence file${ok !== 1 ? 's' : ''} uploaded for responders`, 'success');
  if (failed || skipped) showToast(`${failed + skipped} file${failed + skipped !== 1 ? 's' : ''} stayed on this device (${skipped && !failed ? 'type not supported for upload' : 'upload failed'})`, 'warn');
}
function attachEvidenceToIncident(incidentId, attachments, ownerEmail) {
  if (!attachments || !attachments.length) return;
  attachments.forEach(a => {
    const newId = 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    if (a.blob) { idbPut(newId, a.blob); EV_URLS[newId] = URL.createObjectURL(a.blob); }
    EVIDENCE.push({
      id: newId,
      incidentId,
      ownerEmail: ownerEmail || state.user?.email || 'guest-session',
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      kind: a.kind || evidenceKind(a.mimeType, a.fileName),
      dataUrl: a.blob ? undefined : a.dataUrl, idb: !!a.blob,
      duration: a.duration || null,
      createdAt: Date.now(),
      keep: true,
      source: 'report'
    });
  });
  persistEvidence();
}
function keepEvidence(evId) {
  const ev = EVIDENCE.find(e => e.id === evId);
  if (!ev) return;
  if (!canDeleteEvidence(ev)) {
    showToast('Only the evidence owner can change retention','error');
    return;
  }
  ev.keep = !ev.keep;
  persistEvidence();
  safeRender();
  showToast(ev.keep ? 'Marked to keep' : 'Auto-delete after 7 days','info');
}
function dataUrlToBlob(dataUrl) {
  if (!String(dataUrl).startsWith('data:')) return null;
  const parts = String(dataUrl).split(',');
  if (parts.length < 2) return null;
  const header = parts[0];
  const isBase64 = /;base64/i.test(header);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = (mimeMatch && mimeMatch[1]) || 'application/octet-stream';
  const data = parts.slice(1).join(',');
  try {
    if (isBase64) {
      const binary = atob(data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch {
    return null;
  }
}
function downloadEvidence(evId) {
  const ev = EVIDENCE.find(e => e.id === evId);
  if (!ev || !evSrc(ev)) {
    showToast('File not found','error');
    return;
  }
  try {
    const fileName = ev.fileName || (`safemesh-evidence-${ev.id}`);
    const blob = dataUrlToBlob(evSrc(ev));
    const url = blob ? URL.createObjectURL(blob) : evSrc(ev);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      if (blob) URL.revokeObjectURL(url);
    }, 1500);
    showToast('Download started — check your downloads folder','success');
  } catch {
    try {
      window.open(evSrc(ev), '_blank', 'noopener');
      showToast('Opened file — use Save As if download did not start','info');
    } catch {
      showToast('Could not download file','error');
    }
  }
}
function myEvidenceList() {
  const email = state.user?.email || 'guest-session';
  return EVIDENCE.filter(e => e.ownerEmail === email || e.ownerEmail === (state.user?.email || null));
}

/* ============================================================
   RESPONDER ACK FLOW
   ============================================================ */
function openAckModal(incidentId) {
  refreshAllFromStorage();
  const inc = getIncidentById(incidentId);
  if (!inc) return;
  state.ackIncidentId = incidentId;
  state.ackStep = 1;
  state.ackIsAcknowledged = null;
  state.showAckModal = true;
  safeRender();
}
function ackYes() {
  const inc = getIncidentById(state.ackIncidentId);
  if (!inc) return;
  inc.acknowledged = true;
  inc.ackAt = Date.now();
  inc.acknowledgedBy = state.user?.email || null;
  inc.acknowledgedByJob = state.user?.job || 'Responder';
  inc.acknowledgedByName = state.user?.name || '';
  inc.acknowledgedByOrg = state.user?.org || 'Community Watch';
  if (inc.status === 'Pending') inc.status = 'Acknowledged';
  persistIncidents();
  api.updateIncident(inc.id, {
    acknowledged: true, ackAt: inc.ackAt, acknowledgedBy: inc.acknowledgedBy,
    acknowledgedByOrg: inc.acknowledgedByOrg, acknowledgedByName: inc.acknowledgedByName, acknowledgedByJob: inc.acknowledgedByJob, status: inc.status,
  }).catch(() => {});
  state.ackIsAcknowledged = true;
  state.ackStep = 2;
  // start live GPS so the route map in the feed knows where the responder is
  try { if (!state.userCoords) requestGPS(); if (liveWatchId === null) startTracking(); } catch {}
  safeRender();
}
function ackNo() {
  const inc = getIncidentById(state.ackIncidentId);
  if (!inc) return;
  inc.acknowledged = false;
  inc.ackAt = Date.now();
  inc.acknowledgedBy = state.user?.email || null;
  inc.ackDeclinedAt = Date.now();
  persistIncidents();
  state.showAckModal = false;
  state.ackIncidentId = null;
  state.ackStep = 1;
  state.ackIsAcknowledged = null;
  safeRender();
  showToast('Alert declined — another responder can pick it up','info');
}
function ackDispatchVehicle() {
  const inc = getIncidentById(state.ackIncidentId);
  if (!inc) return;
  const unitName = (document.getElementById('ack-unit-name')?.value || '').trim() ||
                   `${state.user?.org || 'Response Unit'} · Unit ${Math.floor(Math.random() * 9 + 1)}`;
  inc.dispatched = true;
  inc.dispatchAt = Date.now();
  inc.dispatchUnit = unitName;
  inc.dispatchedBy = state.user?.email || null;
  inc.responder = `${unitName} [${state.user?.job || 'Responder'}]`;
  inc.eta = Math.floor(Math.random() * 5) + 2;
  inc.status = 'Dispatched';
  persistIncidents();
  api.updateIncident(inc.id, {
    dispatched: true, dispatchAt: inc.dispatchAt, dispatchUnit: inc.dispatchUnit,
    responder: inc.responder, eta: inc.eta, status: 'Dispatched',
  }).catch(() => {});
  state.showAckModal = false;
  state.ackIncidentId = null;
  state.ackStep = 1;
  state.ackIsAcknowledged = null;
  safeRender();
  showToast(`Vehicle dispatched — ETA ${inc.eta} min`, 'success');
}
function ackOnFoot() {
  const inc = getIncidentById(state.ackIncidentId);
  if (!inc) return;
  inc.dispatched = true;
  inc.dispatchAt = Date.now();
  inc.dispatchUnit = 'On foot';
  inc.dispatchedBy = state.user?.email || null;
  inc.responder = `${state.user?.org || 'Response Unit'} · On foot [${state.user?.job || 'Responder'}]`;
  inc.eta = Math.floor(Math.random() * 8) + 3;
  inc.status = 'Dispatched';
  persistIncidents();
  api.updateIncident(inc.id, {
    dispatched: true, dispatchAt: inc.dispatchAt, dispatchUnit: 'On foot',
    responder: inc.responder, eta: inc.eta, status: 'Dispatched',
  }).catch(() => {});
  state.showAckModal = false;
  state.ackIncidentId = null;
  state.ackStep = 1;
  state.ackIsAcknowledged = null;
  safeRender();
  showToast(`Responding on foot — ETA ${inc.eta} min`, 'success');
}

/* ============================================================
   RESPONDER ADVANCE / RESOLVE
   ============================================================ */
function responderSignature() {
  const org = state.user?.org || 'Response Unit';
  const job = state.user?.job || 'Responder';
  return `${org} · Unit ${Math.floor(Math.random() * 9 + 1)} [${job}]`;
}
function responderAdvance(id) {
  refreshAllFromStorage();
  const inc = getIncidentById(id);
  if (!inc) return;
  const flow = { 'Pending':'Acknowledged', 'Acknowledged':'Dispatched', 'Dispatched':'Resolved' };
  inc.status = flow[inc.status] || inc.status;
  if (inc.status === 'Dispatched' && !inc.responder) {
    inc.responder = responderSignature();
    inc.eta = Math.floor(Math.random() * 5) + 2;
  }
  if (inc.status === 'Resolved') { inc.resolution = 'resolved'; inc.eta = 0; }
  persistIncidents();
  api.updateIncident(inc.id, { status: inc.status, responder: inc.responder, eta: inc.eta, resolution: inc.resolution }).catch(() => {});
  safeRender();
  showToast(`#${id} → ${inc.status}`);
}
function responderMarkResolved(id) {
  refreshAllFromStorage();
  const inc = getIncidentById(id);
  if (!inc) return;
  inc.status = 'Resolved'; inc.resolution = 'resolved'; inc.eta = 0;
  persistIncidents();
  api.updateIncident(inc.id, { status: 'Resolved', resolution: 'resolved', eta: 0 }).catch(() => {});
  safeRender();
  showToast(`#${id} marked resolved — awaiting user confirmation`, 'success');
}
function responderMarkFalse(id) {
  refreshAllFromStorage();
  const inc = getIncidentById(id);
  if (!inc) return;
  inc.status = 'False Alarm'; inc.resolution = 'false_alarm'; inc.eta = 0;
  persistIncidents();
  api.updateIncident(id, { status: 'False Alarm', resolution: 'false_alarm', eta: 0 }).catch(() => {});
  safeRender();
  showToast(`#${id} marked as false alarm`, 'info');
}
function responderReopen(id) {
  refreshAllFromStorage();
  const inc = getIncidentById(id);
  if (!inc) return;
  inc.status = 'Acknowledged'; inc.resolution = 'pending'; inc.confirmedByUser = null;
  persistIncidents();
  api.updateIncident(id, { status: 'Acknowledged', resolution: 'pending', confirmedByUser: null }).catch(() => {});
  safeRender();
  showToast(`#${id} reopened`);
}

/* ============================================================
   ON DUTY
   ============================================================ */
function toggleDuty() {
  const email = state.user?.email;
  if (!email) return;
  const cur = ON_DUTY[email] || {};
  const next = !cur.on;
  if (next) {
    // Turning on duty — request location
    requestGPS();
    if (liveWatchId === null) startTracking();
  }
  ON_DUTY[email] = {
    on: next,
    radiusKm: cur.radiusKm || 5,
    lat: state.userCoords?.lat ?? null,
    lng: state.userCoords?.lng ?? null,
    updatedAt: Date.now(),
    town: state.responderFilter?.town || state.user?.town || '',
    province: state.responderFilter?.province || state.user?.province || ''
  };
  persistDuty();
  api.setDuty({
    on: next,
    radiusKm: ON_DUTY[email].radiusKm,
    lat: ON_DUTY[email].lat,
    lng: ON_DUTY[email].lng,
    town: ON_DUTY[email].town,
    province: ON_DUTY[email].province,
  }).catch(() => {});
  safeRender();
  showToast(next ? 'You are ON DUTY — location sharing active' : 'You are OFF DUTY', next ? 'success' : 'info');
}
function saveDutyRadius() {
  const email = state.user?.email;
  if (!email) return;
  const sel = document.getElementById('duty-radius');
  if (!sel) return;
  const km = parseInt(sel.value) || 5;
  const cur = ON_DUTY[email] || { on: false };
  ON_DUTY[email] = { ...cur, radiusKm: km };
  persistDuty();
  api.setDuty({ on: !!cur.on, radiusKm: km }).catch(() => {});
  safeRender();
  showToast(`Response radius set to ${km} km`, 'success');
}

/* ============================================================
   USER RESOLUTION CONFIRM
   ============================================================ */
function userConfirmSafe(id) {
  refreshAllFromStorage();
  const inc = getIncidentById(id);
  if (!inc) return;
  inc.confirmedByUser = true; inc.resolution = 'resolved'; inc.status = 'Resolved';
  persistIncidents();
  api.updateIncident(id, { confirmedByUser: true, resolution: 'resolved', status: 'Resolved' }).catch(() => {});
  state.sosActive = false; state.sosIncidentId = null;
  state.showResolveModal = false; state.resolveIncidentId = null;
  releaseWakeLock();
  safeRender(); showToast('Thank you — case closed', 'success');
}
function userNeedMoreHelp(id) {
  refreshAllFromStorage();
  const inc = getIncidentById(id);
  if (!inc) return;
  inc.confirmedByUser = false; inc.resolution = 'pending'; inc.status = 'Dispatched'; inc.escalation = 'User needs more help';
  persistIncidents();
  api.updateIncident(id, { confirmedByUser: false, resolution: 'pending', status: 'Dispatched', escalation: 'User needs more help' }).catch(() => {});
  state.showResolveModal = false; state.resolveIncidentId = null;
  safeRender(); showToast('Escalated — responder notified', 'error');
}

let resolveModalTicker = null;
function startResolveModalTicker() {
  if (resolveModalTicker) return;
  resolveModalTicker = setInterval(() => {
    if (state.currentView !== 'user-dashboard' && state.currentView !== 'pro-dashboard') return;
    if (state.showResolveModal) return;
    const mine = INCIDENTS.find(i =>
      incidentBelongsToMe(i) && i.status === 'Resolved' &&
      i.resolution === 'resolved' && i.confirmedByUser === null
    );
    if (mine) {
      state.showResolveModal = true;
      state.resolveIncidentId = mine.id;
      safeRender();
    }
  }, 1500);
}
startResolveModalTicker();

/* ============================================================
   HEATMAP
   ============================================================ */
function getHeatPoints(province, town) {
  let list = INCIDENTS;
  if (province) list = list.filter(i => i.province.toLowerCase() === province.toLowerCase());
  if (town) list = list.filter(i => i.town.toLowerCase() === town.toLowerCase());
  return list.map(i => {
    const [lat, lng] = incidentCoords(i);
    const base = i.isDuress ? 1.0 : (i.status === 'Escalated' ? 0.9 : (i.responder ? 0.6 : 0.75));
    return [lat, lng, base];
  });
}

/* ============================================================
   LOCATION / LANDMARK SEARCH (OpenStreetMap Nominatim + local SA)
   ============================================================ */
const SA_LANDMARKS = [
  { name: 'OR Tambo International Airport', town: 'Johannesburg', province: 'Gauteng', lat: -26.1367, lng: 28.2411 },
  { name: 'Cape Town International Airport', town: 'Cape Town', province: 'Western Cape', lat: -33.9715, lng: 18.6021 },
  { name: 'King Shaka International Airport', town: 'Durban', province: 'KwaZulu-Natal', lat: -29.6144, lng: 31.1197 },
  { name: 'Union Buildings', town: 'Pretoria', province: 'Gauteng', lat: -25.7461, lng: 28.2293 },
  { name: 'V&A Waterfront', town: 'Cape Town', province: 'Western Cape', lat: -33.9036, lng: 18.4201 },
  { name: 'Table Mountain', town: 'Cape Town', province: 'Western Cape', lat: -33.9628, lng: 18.4098 },
  { name: 'Sandton City', town: 'Johannesburg', province: 'Gauteng', lat: -26.1086, lng: 28.0547 },
  { name: 'Canal Walk', town: 'Cape Town', province: 'Western Cape', lat: -33.8925, lng: 18.5112 },
  { name: 'Gateway Theatre of Shopping', town: 'Durban', province: 'KwaZulu-Natal', lat: -29.7267, lng: 31.0650 },
  { name: 'Menlyn Park', town: 'Pretoria', province: 'Gauteng', lat: -25.7829, lng: 28.2763 },
  { name: 'Constitution Hill', town: 'Johannesburg', province: 'Gauteng', lat: -26.1886, lng: 28.0431 },
  { name: 'Robben Island', town: 'Cape Town', province: 'Western Cape', lat: -33.8066, lng: 18.3662 },
  { name: 'uShaka Marine World', town: 'Durban', province: 'KwaZulu-Natal', lat: -29.8674, lng: 31.0456 },
  { name: 'Apartheid Museum', town: 'Johannesburg', province: 'Gauteng', lat: -26.2370, lng: 28.0090 },
  { name: 'Nelson Mandela Square', town: 'Johannesburg', province: 'Gauteng', lat: -26.1076, lng: 28.0547 },
  { name: 'GrandWest Casino', town: 'Cape Town', province: 'Western Cape', lat: -33.9150, lng: 18.5400 },
  { name: 'Moses Mabhida Stadium', town: 'Durban', province: 'KwaZulu-Natal', lat: -29.8289, lng: 31.0303 },
  { name: 'FNB Stadium', town: 'Johannesburg', province: 'Gauteng', lat: -26.2348, lng: 27.9826 },
  { name: 'Cape Town Station', town: 'Cape Town', province: 'Western Cape', lat: -33.9222, lng: 18.4256 },
  { name: 'Park Station', town: 'Johannesburg', province: 'Gauteng', lat: -26.1952, lng: 28.0416 }
];

function localPlaceSearch(query) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const results = [];
  // Towns
  SA_PROVINCES.forEach(prov => {
    (SA_TOWNS_DATA[prov] || []).forEach(town => {
      if (town.toLowerCase().includes(q) || prov.toLowerCase().includes(q)) {
        const c = coordsForTown(town);
        results.push({
          label: `${town}, ${prov}`,
          lat: c[0], lng: c[1],
          kind: 'town', town, province: prov
        });
      }
    });
  });
  // Landmarks
  SA_LANDMARKS.forEach(lm => {
    if (lm.name.toLowerCase().includes(q) || lm.town.toLowerCase().includes(q)) {
      results.push({
        label: `${lm.name} · ${lm.town}`,
        lat: lm.lat, lng: lm.lng,
        kind: 'landmark', town: lm.town, province: lm.province
      });
    }
  });
  // Dedupe by label
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  }).slice(0, 8);
}

async function nominatimSearch(query) {
  const q = (query || '').trim();
  if (q.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=za&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return (data || []).map(item => ({
    label: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    kind: 'place'
  })).filter(r => isFinite(r.lat) && isFinite(r.lng));
}

async function runMapSearch(context) {
  const input = document.getElementById(context === 'admin' ? 'admin-map-search' : 'resp-map-search');
  const query = (input?.value || state.mapSearchQuery || '').trim();
  if (query.length < 2) {
    showToast('Type at least 2 characters','error');
    return;
  }
  state.mapSearchQuery = query;
  state.mapSearchContext = context;
  state.mapSearchLoading = true;
  state.mapSearchResults = localPlaceSearch(query);
  safeRender();
  try {
    if (navigator.onLine) {
      const remote = await nominatimSearch(query);
      // Merge: local first, then remote not already similar
      const labels = new Set(state.mapSearchResults.map(r => r.label.toLowerCase().slice(0, 40)));
      remote.forEach(r => {
        const key = r.label.toLowerCase().slice(0, 40);
        if (!labels.has(key)) state.mapSearchResults.push(r);
      });
      state.mapSearchResults = state.mapSearchResults.slice(0, 10);
    }
  } catch {
    if (!state.mapSearchResults.length) showToast('Could not reach place search — try a town name','error');
  } finally {
    state.mapSearchLoading = false;
    safeRender();
  }
}

function selectMapSearchResult(idx) {
  const r = state.mapSearchResults[idx];
  if (!r) return;
  state.mapSearchTarget = { lat: r.lat, lng: r.lng, label: r.label };
  state.mapSearchResults = [];
  state.mapSearchQuery = r.label;
  // If result has town/province, optionally align filters
  if (r.town && r.province) {
    if (state.mapSearchContext === 'admin') {
      state.adminFilter = { province: r.province, town: r.town };
    } else if (state.userRole === 'responder') {
      state.responderFilter = { province: r.province, town: r.town };
    }
  }
  safeRender();
  showToast(`Centered on ${r.label.split(',')[0]}`,'success');
  setTimeout(() => {
    if (state.mapSearchContext === 'admin') initOrRefreshAdminMap();
    else initOrRefreshResponderMap();
  }, 30);
}

function clearMapSearch() {
  state.mapSearchQuery = '';
  state.mapSearchResults = [];
  state.mapSearchTarget = null;
  state.mapSearchLoading = false;
  safeRender();
}

function renderMapSearchBox(context) {
  const id = context === 'admin' ? 'admin-map-search' : 'resp-map-search';
  const q = state.mapSearchContext === context ? state.mapSearchQuery : '';
  const results = state.mapSearchContext === context ? state.mapSearchResults : [];
  const loading = state.mapSearchContext === context && state.mapSearchLoading;
  return `
    <div class="space-y-2">
      <div class="flex gap-2">
        <input id="${id}" type="search" value="${esc(q)}" placeholder="Search town, landmark, address…"
          class="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500"
          autocomplete="off"/>
        <button data-action="map-search" data-context="${context}" class="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold shrink-0">${loading ? '…' : 'Search'}</button>
        <button data-action="gps-search" data-context="${context}" class="px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shrink-0" aria-label="Search near my GPS location">📍 Near me</button>
        ${state.mapSearchTarget && state.mapSearchContext === context ? `<button data-action="map-search-clear" class="px-3 py-2.5 bg-slate-700 text-slate-300 rounded-lg text-xs font-bold">Clear</button>` : ''}
      </div>
      ${results.length ? `
        <ul class="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 max-h-48 overflow-y-auto">
          ${results.map((r, i) => `
            <li>
              <button data-action="map-search-select" data-idx="${i}" class="w-full text-left px-3 py-2.5 hover:bg-slate-800 text-xs text-slate-200">
                <span class="font-semibold text-white">${esc(r.label.split(',')[0])}</span>
                <span class="text-slate-500 block truncate">${esc(r.label)}</span>
              </button>
            </li>
          `).join('')}
        </ul>
      ` : ''}
      ${state.mapSearchTarget && state.mapSearchContext === context ? `
        <p class="text-[10px] text-emerald-400">📍 ${esc(state.mapSearchTarget.label)}</p>
      ` : ''}
    </div>`;
}

/* ============================================================
   LEAFLET MAPS
   ============================================================ */
let leafletMap = null, leafletMarkers = [], leafletHeat = null, leafletSearchMarker = null;
let adminMap = null, adminMarkers = [], adminHeat = null, adminSearchMarker = null;
let userMiniMap = null, userMiniMarker = null, userMiniRespMarker = null;

function initOrRefreshResponderMap() {
  const el = document.getElementById('responder-map');
  if (!el || typeof L === 'undefined') return;
  const { town, province } = state.responderFilter;
  const filtered = town && province ? getIncidentsForTown(town, province) : [];
  const center = mapCenterForContext(town);

  if (!leafletMap) {
    leafletMap = L.map(el, { zoomControl: true, attributionControl: true, center, zoom: 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(leafletMap);
  } else if (!document.body.contains(leafletMap.getContainer())) {
    leafletMap = null;
    return initOrRefreshResponderMap();
  }
  leafletMarkers.forEach(m => { try { leafletMap.removeLayer(m); } catch {} });
  leafletMarkers = [];
  if (leafletHeat) { try { leafletMap.removeLayer(leafletHeat); } catch {} leafletHeat = null; }

  if (state.heatmapOn && typeof L.heatLayer === 'function') {
    const points = getHeatPoints(province, town);
    if (points.length) {
      leafletHeat = L.heatLayer(points, {
        radius: 28, blur: 22, maxZoom: 17,
        gradient: { 0.2:'#3b82f6', 0.5:'#fbbf24', 0.8:'#ef4444', 1.0:'#7f1d1d' }
      }).addTo(leafletMap);
    }
  }

  filtered.forEach(inc => {
    const [lat, lng] = incidentCoords(inc);
    const status = safeStatus(inc.status);
    let statusClass, wrapperClass;
    if (inc.isDuress) { statusClass = 'duress'; wrapperClass = 'duress'; }
    else if (status === 'Resolved') { statusClass = 'resolved'; wrapperClass = 'resolved'; }
    else if (inc.responder) { statusClass = 'dispatched'; wrapperClass = 'dispatched'; }
    else { statusClass = 'pending'; wrapperClass = ''; }
    const letter = (inc.category || '?').charAt(0).toUpperCase();
    const icon = L.divIcon({
      className: '',
      html: `<div class="sm-pin-wrap ${wrapperClass}"><div class="sm-pin ${statusClass}">${esc(letter)}</div></div>`,
      iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
    });
    const popup = `
      <div class="sm-popup">
        <b>${esc(inc.category)}</b>${inc.isDuress ? ' <span style="color:#b91c1c;font-weight:800;">DURESS</span>' : ''}<br/>
        <span style="color:#475569;">${esc(inc.user)} · ${esc(timeAgo(inc.time))}</span><br/>
        <span style="color:#475569;">${esc(inc.town)}, ${esc(inc.province)}</span><br/>
        <span style="color:#475569;">Status: ${esc(status)}${inc.responder ? ' · ' + esc(inc.responder) : ''}</span>
      </div>`;
    const marker = L.marker([lat, lng], { icon }).bindPopup(popup);
    marker.addTo(leafletMap);
    leafletMarkers.push(marker);
  });

  if (leafletSearchMarker) { try { leafletMap.removeLayer(leafletSearchMarker); } catch {} leafletSearchMarker = null; }
  if (state.mapSearchTarget && state.mapSearchContext !== 'admin') {
    const t = state.mapSearchTarget;
    leafletSearchMarker = L.marker([t.lat, t.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div class="sm-pin-wrap"><div class="sm-pin" style="background:#8b5cf6;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">📍</div></div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
      })
    }).bindPopup(`<div class="sm-popup"><b>${esc(t.label)}</b></div>`).addTo(leafletMap);
    leafletMap.setView([t.lat, t.lng], 15);
  } else if (leafletMarkers.length > 0) {
    const group = L.featureGroup(leafletMarkers);
    try { leafletMap.fitBounds(group.getBounds().pad(0.2), { maxZoom: 14 }); }
    catch { leafletMap.setView(center, 12); }
  } else {
    leafletMap.setView(center, 12);
  }
  setTimeout(() => { try { leafletMap.invalidateSize(); } catch {} }, 50);
}

function initOrRefreshAdminMap() {
  const el = document.getElementById('admin-map');
  if (!el || typeof L === 'undefined') return;
  const { town, province } = state.adminFilter;
  let list = INCIDENTS.slice();
  if (province) list = list.filter(i => i.province.toLowerCase() === province.toLowerCase());
  if (town) list = list.filter(i => i.town.toLowerCase() === town.toLowerCase());

  if (!adminMap) {
    const adminCenter = (state.userCoords && typeof state.userCoords.lat === 'number')
      ? [state.userCoords.lat, state.userCoords.lng] : [-29.0, 24.0];
    const adminZoom = (state.userCoords && typeof state.userCoords.lat === 'number') ? 12 : 5;
    adminMap = L.map(el, { zoomControl: true, attributionControl: true, center: adminCenter, zoom: adminZoom });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(adminMap);
  } else if (!document.body.contains(adminMap.getContainer())) {
    adminMap = null;
    return initOrRefreshAdminMap();
  }
  adminMarkers.forEach(m => { try { adminMap.removeLayer(m); } catch {} });
  adminMarkers = [];
  if (adminHeat) { try { adminMap.removeLayer(adminHeat); } catch {} adminHeat = null; }

  if (state.heatmapOn && typeof L.heatLayer === 'function') {
    const points = getHeatPoints(province, town);
    if (points.length) {
      adminHeat = L.heatLayer(points, {
        radius: 35, blur: 30, maxZoom: 17,
        gradient: { 0.2:'#3b82f6', 0.5:'#fbbf24', 0.8:'#ef4444', 1.0:'#7f1d1d' }
      }).addTo(adminMap);
    }
  }

  list.forEach(inc => {
    const [lat, lng] = incidentCoords(inc);
    const status = safeStatus(inc.status);
    let statusClass, wrapperClass;
    if (inc.isDuress) { statusClass = 'duress'; wrapperClass = 'duress'; }
    else if (status === 'Resolved') { statusClass = 'resolved'; wrapperClass = 'resolved'; }
    else if (inc.responder) { statusClass = 'dispatched'; wrapperClass = 'dispatched'; }
    else { statusClass = 'pending'; wrapperClass = ''; }
    const letter = (inc.category || '?').charAt(0).toUpperCase();
    const icon = L.divIcon({
      className: '',
      html: `<div class="sm-pin-wrap ${wrapperClass}"><div class="sm-pin ${statusClass}">${esc(letter)}</div></div>`,
      iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
    });
    const popup = `
      <div class="sm-popup">
        <b>${esc(inc.category)}</b><br/>
        <span style="color:#475569;">${esc(inc.town)}, ${esc(inc.province)}</span><br/>
        <span style="color:#475569;">${esc(status)}</span>
      </div>`;
    const marker = L.marker([lat, lng], { icon }).bindPopup(popup);
    marker.addTo(adminMap);
    adminMarkers.push(marker);
  });

  if (adminSearchMarker) { try { adminMap.removeLayer(adminSearchMarker); } catch {} adminSearchMarker = null; }
  if (state.mapSearchTarget && state.mapSearchContext === 'admin') {
    const t = state.mapSearchTarget;
    adminSearchMarker = L.marker([t.lat, t.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div class="sm-pin-wrap"><div class="sm-pin" style="background:#8b5cf6;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">📍</div></div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
      })
    }).bindPopup(`<div class="sm-popup"><b>${esc(t.label)}</b></div>`).addTo(adminMap);
    adminMap.setView([t.lat, t.lng], 14);
  } else if (adminMarkers.length > 0) {
    const group = L.featureGroup(adminMarkers);
    try { adminMap.fitBounds(group.getBounds().pad(0.2), { maxZoom: 10 }); }
    catch { adminMap.setView([-29.0, 24.0], 5); }
  } else {
    adminMap.setView([-29.0, 24.0], 5);
  }
  setTimeout(() => { try { adminMap.invalidateSize(); } catch {} }, 50);
}

function initOrRefreshUserMiniMap() {
  const el = document.getElementById('user-mini-map');
  if (!el || typeof L === 'undefined') return;
  const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
  if (!isFinite(lat) || !isFinite(lng)) return;

  if (!userMiniMap) {
    userMiniMap = L.map(el, { zoomControl: false, attributionControl: true, center: [lat, lng], zoom: 15 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(userMiniMap);
  } else if (!document.body.contains(userMiniMap.getContainer())) {
    userMiniMap = null;
    return initOrRefreshUserMiniMap();
  }
  if (userMiniMarker) { try { userMiniMap.removeLayer(userMiniMarker); } catch {} }
  const icon = L.divIcon({
    className: '',
    html: `<div class="sm-pin-wrap"><div class="sm-pin pending">!</div></div>`,
    iconSize: [28, 28], iconAnchor: [14, 14]
  });
  userMiniMarker = L.marker([lat, lng], { icon }).addTo(userMiniMap);
  if (userMiniRespMarker) { try { userMiniMap.removeLayer(userMiniRespMarker); } catch {} userMiniRespMarker = null; }
  const rlat = parseFloat(el.dataset.rlat), rlng = parseFloat(el.dataset.rlng);
  if (isFinite(rlat) && isFinite(rlng)) {
    userMiniRespMarker = L.marker([rlat, rlng], { icon: L.divIcon({ className: '', html: '<div class="live-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(userMiniMap).bindPopup('Responder');
    try { userMiniMap.fitBounds(L.latLngBounds([[lat, lng], [rlat, rlng]]).pad(0.3), { maxZoom: 16 }); } catch { userMiniMap.setView([lat, lng], 15); }
  } else {
    userMiniMap.setView([lat, lng], 15);
  }
  setTimeout(() => { try { userMiniMap.invalidateSize(); } catch {} }, 50);
}

/* ============================================================
   MODALS
   ============================================================ */
function renderAckModal() {
  if (!state.showAckModal || !state.ackIncidentId) return '';
  const inc = getIncidentById(state.ackIncidentId);
  if (!inc) { state.showAckModal = false; state.ackIncidentId = null; return ''; }

  const org = state.user?.org || 'Community Watch';
  const stepper = `
    <div class="flex items-center gap-2 justify-center mb-2" aria-hidden="true">
      <span class="step-dot ${state.ackStep === 1 ? 'active' : 'done'}"></span>
      <span class="step-dot ${state.ackStep === 2 ? 'active' : ''}"></span>
    </div>`;

  if (state.ackStep === 1) {
    return `
      <div class="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ack-title">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative bg-slate-900 border border-amber-700/60 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
          <div class="p-5 space-y-4">
            ${stepper}
            <div class="text-center space-y-1">
              <p class="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Incoming Alert</p>
              <h3 id="ack-title" class="text-lg font-bold text-white">${esc(inc.category)}</h3>
              <p class="text-xs text-slate-500">${esc(inc.town)}, ${esc(inc.province)} · ${esc(timeAgo(inc.time))}</p>
            </div>

            ${inc.isDuress ? `<div class="bg-red-950/60 border-2 border-red-700 rounded-lg p-3 text-center" role="alert"><p class="text-red-300 font-bold text-sm">⚠ DURESS ALERT</p><p class="text-red-200 text-xs mt-1">User may be under threat. Dispatch silently. Do not call back.</p></div>` : ''}

            <div class="bg-slate-950 rounded-lg p-3 text-xs text-slate-300 space-y-1">
              <p><span class="text-slate-500">Reported by:</span> ${esc(inc.user)}</p>
              <p><span class="text-slate-500">Description:</span> ${esc(inc.description)}</p>
              <p><span class="text-slate-500">Coordinates:</span> ${incidentCoords(inc)[0].toFixed(4)}, ${incidentCoords(inc)[1].toFixed(4)}</p>
            </div>

            <div class="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-1">
              <p class="text-sm font-bold text-white text-center">Have you acknowledged this alert?</p>
              <p class="text-[10px] text-slate-500 text-center">Acknowledging tells the user help is coming. You will then be asked if you are dispatching a vehicle.</p>
            </div>

            <div class="flex gap-3">
              <button data-action="ack-no" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-sm active:scale-95">No — not yet</button>
              <button data-action="ack-yes" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm active:scale-95">Yes — acknowledge</button>
            </div>
            <button data-action="close-ack" class="w-full py-2 text-slate-500 text-xs hover:text-slate-300">Close without responding</button>
          </div>
        </div>
      </div>`;
  }

  if (state.ackStep === 2) {
    return `
      <div class="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ack2-title">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative bg-slate-900 border border-blue-700/60 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
          <div class="p-5 space-y-4">
            ${stepper}
            <div class="text-center space-y-1">
              <p class="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Acknowledged ✓</p>
              <h3 id="ack2-title" class="text-lg font-bold text-white">Dispatch decision</h3>
              <p class="text-xs text-slate-500">${esc(inc.category)} · ${esc(inc.town)}</p>
            </div>

            <div class="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-1">
              <p class="text-sm font-bold text-white text-center">Is a vehicle being dispatched?</p>
              <p class="text-[10px] text-slate-500 text-center">Choose "Vehicle" if you are driving to the scene. Choose "On foot" if you are walking or nearby.</p>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-semibold text-slate-300" for="ack-unit-name">Unit name / callsign (optional)</label>
              <input id="ack-unit-name" type="text" placeholder="e.g. ${esc(org)} Unit 3" maxlength="40"
                class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500"/>
            </div>

            <div class="flex flex-col gap-2">
              <button data-action="ack-dispatch-vehicle" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm active:scale-95">🚗 Yes — dispatching a vehicle</button>
              <button data-action="ack-on-foot" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm active:scale-95">🚶 No — responding on foot</button>
            </div>
            <button data-action="close-ack" class="w-full py-2 text-slate-500 text-xs hover:text-slate-300">Back</button>
          </div>
        </div>
      </div>`;
  }
  return '';
}

function renderFakeCallOverlay() {
  const c = state.fakeCallConfig;
  const initial = (c.letter || c.name.charAt(0) || '?').toUpperCase();
  const color = c.color || '#ec4899';
  return `
    <div class="fake-call-screen">
      <div class="text-center space-y-2 pt-8">
        <p class="text-xs text-slate-500 uppercase tracking-widest">Incoming call</p>
        <h2 class="text-3xl font-bold text-white">${esc(c.name)}</h2>
        <p class="text-sm text-slate-500">Mobile · ${esc(c.number)}</p>
      </div>
      <div class="text-center">
        <div class="w-32 h-32 rounded-full border-4 flex items-center justify-center mx-auto" style="background:${color}22;border-color:${color};">
          <span class="text-5xl font-black" style="color:${color};">${esc(initial)}</span>
        </div>
        <p class="text-sm text-slate-400 mt-6" id="fake-call-timer">00:00</p>
      </div>
      <div class="flex items-center justify-around pb-8">
        <button data-action="end-fake-call" class="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all active:scale-95" aria-label="Decline call">
          <svg class="w-7 h-7 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
        </button>
        <button data-action="end-fake-call" class="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center transition-all active:scale-95" aria-label="Answer call">
          <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
        </button>
      </div>
    </div>`;
}

function renderFakeCallConfigModal() {
  const c = state.fakeCallConfig;
  return `
    <div class="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="fc-title">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" data-action="close-fakecall-config"></div>
      <div class="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up max-h-[90vh] overflow-y-auto">
        <div class="p-5 space-y-4">
          <div class="flex items-center justify-between">
            <h3 id="fc-title" class="text-lg font-bold text-white">Fake Call Settings</h3>
            <button data-action="close-fakecall-config" class="p-2 -mr-2 rounded-lg hover:bg-slate-800 transition-colors touch-target" aria-label="Close">
              <svg class="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <p class="text-xs text-slate-500">Configure who appears to be calling. Saved to this device only.</p>

          <div class="space-y-2">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick presets</p>
            <div class="flex flex-wrap gap-2">
              ${FAKE_CALL_PRESETS.map(p => {
                const active = c.preset === p.id;
                return `<button data-fakecall-preset="${p.id}"
                  class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95"
                  style="${active
                    ? `background:${p.color}22;border-color:${p.color};color:${p.color};`
                    : 'background:#1e293b;border-color:#334155;color:#cbd5e1;'}">
                  ${esc(p.name)}
                </button>`;
              }).join('')}
            </div>
          </div>

          <div class="space-y-3 pt-2 border-t border-slate-800">
            <div class="space-y-1.5">
              <label class="block text-sm font-medium text-slate-300" for="fc-name">Caller name</label>
              <input id="fc-name" type="text" maxlength="32" value="${esc(c.name)}" placeholder="Mom" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500"/>
            </div>
            <div class="space-y-1.5">
              <label class="block text-sm font-medium text-slate-300" for="fc-number">Phone number</label>
              <input id="fc-number" type="tel" maxlength="24" value="${esc(c.number)}" placeholder="+27 82 123 4567" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500"/>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <label class="block text-sm font-medium text-slate-300" for="fc-letter">Avatar letter</label>
                <input id="fc-letter" type="text" maxlength="1" value="${esc(c.letter)}" placeholder="M" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-center font-bold placeholder-slate-500"/>
              </div>
              <div class="space-y-1.5">
                <label class="block text-sm font-medium text-slate-300" for="fc-color">Avatar color</label>
                <input id="fc-color" type="color" value="${esc(c.color)}" class="w-full h-[42px] bg-slate-800 border border-slate-700 rounded-lg cursor-pointer"/>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-1">
            <button data-action="close-fakecall-config" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all active:scale-95">Cancel</button>
            <button data-action="save-fakecall-config" class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all active:scale-95">Save</button>
          </div>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   VIEWS
   ============================================================ */
function renderLanding() {
  return `
    <div class="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center px-4 sm:px-6 relative overflow-hidden bg-slate-950">
      <div class="relative z-10 w-full max-w-md text-center space-y-6 py-8">
        <div class="flex justify-center">
          <div class="w-16 h-16 bg-red-600/20 rounded-2xl flex items-center justify-center border border-red-600/30">
            <svg class="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          </div>
        </div>
        <div>
          <h1 class="text-3xl font-black text-white">SafeMesh</h1>
          <p class="text-slate-400 mt-3 text-sm">Privacy-first community safety for South Africa</p>
        </div>

        <div class="space-y-3">
          <button data-nav="login" class="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold active:scale-[0.98]">Sign In</button>
          <button data-nav="register" class="w-full py-3.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold active:scale-[0.98]">Create Account</button>
          <button data-nav="guest" class="w-full py-3.5 border border-slate-600 hover:bg-slate-800 text-slate-200 rounded-xl font-bold active:scale-[0.98]">Continue as Guest</button>
        </div>

        <div class="pt-6 border-t border-slate-800">
          <p class="text-xs text-slate-500 mb-3 uppercase tracking-wider font-semibold">Emergency Numbers</p>
          <div class="grid grid-cols-2 gap-2 text-left">
            <div class="bg-slate-900 rounded-lg p-3 border border-slate-800"><p class="text-xs font-semibold text-red-400">Police</p><p class="text-sm text-white font-bold">10111</p></div>
            <div class="bg-slate-900 rounded-lg p-3 border border-slate-800"><p class="text-xs font-semibold text-emerald-400">Ambulance</p><p class="text-sm text-white font-bold">10177</p></div>
            <div class="bg-slate-900 rounded-lg p-3 border border-slate-800 col-span-2"><p class="text-xs font-semibold text-amber-400">GBV Hotline</p><p class="text-sm text-white font-bold">0800 428 428</p></div>
          </div>
        </div>

        <div class="flex justify-center gap-3 text-[10px] text-slate-600 pt-2">
          <button data-nav="privacy" class="hover:text-slate-400">Privacy Notice</button>
          <span>·</span>
          <button data-nav="terms" class="hover:text-slate-400">Terms of Service</button>
        </div>
      </div>
    </div>`;
}

function renderLogin() {
  const role = state.loginRole;
  const showLocation = role !== 'admin' && role !== 'professional';
  const loading = state.authLoading;
  return `
    <div class="min-h-screen bg-slate-950 flex flex-col px-4 py-6">
      <button data-nav="landing" class="text-slate-400 hover:text-white mb-6 self-start text-sm">← Back</button>
      <div class="flex-1 max-w-md mx-auto w-full space-y-6">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-white">Welcome Back</h2>
        </div>
        <div class="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800" role="tablist">
          <button data-login-role="user" role="tab" aria-selected="${role==='user'}" class="flex-1 py-2.5 rounded-lg text-xs font-semibold ${role==='user'?'bg-red-600 text-white':'text-slate-400'}">User</button>
          <button data-login-role="responder" role="tab" aria-selected="${role==='responder'}" class="flex-1 py-2.5 rounded-lg text-xs font-semibold ${role==='responder'?'bg-red-600 text-white':'text-slate-400'}">Responder</button>
          <button data-login-role="professional" role="tab" aria-selected="${role==='professional'}" class="flex-1 py-2.5 rounded-lg text-xs font-semibold ${role==='professional'?'bg-emerald-600 text-white':'text-slate-400'}">Health Pro</button>
          <button data-login-role="admin" role="tab" aria-selected="${role==='admin'}" class="flex-1 py-2.5 rounded-lg text-xs font-semibold ${role==='admin'?'bg-purple-600 text-white':'text-slate-400'}">Admin</button>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="login-email">${role === 'admin' ? 'Admin email or phone' : 'Email or Phone'}</label>
            <input id="login-email" type="text" inputmode="email" placeholder="${role === 'admin' ? 'name@email.com or 082…' : 'name@email.com or 082…'}" autocomplete="username" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"/>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="login-password">Password</label>
            <div class="relative">
              <input id="login-password" type="password" placeholder="Your password" autocomplete="current-password" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white pr-12"/>
              <button type="button" data-action="toggle-password" data-target="login-password" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-semibold" aria-label="Show password">Show</button>
            </div>
          </div>
          ${showLocation ? `
          <div class="pt-3 border-t border-slate-800 space-y-3">
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="login-province">Province <span class="text-red-400" aria-label="required">*</span></label>
              <select id="login-province" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
                <option value="">Select province...</option>
                ${SA_PROVINCES.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="login-town">Town <span class="text-red-400" aria-label="required">*</span></label>
              <select id="login-town" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
                <option value="">Select town...</option>
              </select>
            </div>
          </div>` : ''}
          <button data-action="login-submit" class="w-full py-3.5 ${role==='admin'?'bg-purple-600':'bg-red-600'} text-white rounded-xl font-bold flex items-center justify-center gap-2 ${loading?'btn-loading':''}">
            ${loading ? '<span class="loading-spinner"></span>' : ''}
            <span>${role==='admin'?'Enter Admin Console':(role==='responder'?'Enter Command Board':(role==='professional'?'Enter Practice Console':'Sign In'))}</span>
          </button>
        </div>
        <p class="text-center text-sm text-slate-500">
          <button data-nav="forgot-password" class="text-red-400 font-semibold">Forgot password?</button>
          <span class="mx-2 text-slate-700">·</span>
          No account? <button data-nav="register" class="text-red-400 font-semibold">Create one</button>
        </p>
      </div>
    </div>`;
}

function renderForgotPassword() {
  const role = state.forgotRole;
  const isAdmin = role === 'admin';
  const loading = state.authLoading;
  const step = state.forgotStep || 'request';
  const btn = isAdmin ? 'bg-purple-600' : 'bg-red-600';
  const inp = 'w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white';
  return `
    <div class="min-h-screen bg-slate-950 flex flex-col px-4 py-6">
      <button data-nav="login" class="text-slate-400 hover:text-white mb-6 self-start text-sm">← Back to Sign In</button>
      <div class="flex-1 max-w-md mx-auto w-full space-y-6">
        <div class="text-center space-y-2">
          <h2 class="text-2xl font-bold text-white">Reset Password</h2>
          <p class="text-sm text-slate-400">${step === 'request'
            ? 'We will send a 6-digit code to the email and cellphone number on your account.'
            : `Enter the code sent for <b class="text-slate-200">${esc(state.forgotEmail)}</b>. It expires in 10 minutes.`}</p>
        </div>
        <div class="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800" role="tablist">
          <button data-forgot-role="user" role="tab" aria-selected="${role==='user'}" class="flex-1 py-2.5 rounded-lg text-xs font-semibold ${role==='user'?'bg-red-600 text-white':'text-slate-400'}">User</button>
          <button data-forgot-role="responder" role="tab" aria-selected="${role==='responder'}" class="flex-1 py-2.5 rounded-lg text-xs font-semibold ${role==='responder'?'bg-red-600 text-white':'text-slate-400'}">Responder</button>
          <button data-forgot-role="professional" role="tab" aria-selected="${role==='professional'}" class="flex-1 py-2.5 rounded-lg text-xs font-semibold ${role==='professional'?'bg-emerald-600 text-white':'text-slate-400'}">Health Pro</button>
          <button data-forgot-role="admin" role="tab" aria-selected="${isAdmin}" class="flex-1 py-2.5 rounded-lg text-xs font-semibold ${isAdmin?'bg-purple-600 text-white':'text-slate-400'}">Admin</button>
        </div>
        ${step === 'request' ? `
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="forgot-email">Account email</label>
            <input id="forgot-email" type="email" placeholder="name@email.com" autocomplete="username" value="${esc(state.forgotEmail || '')}" class="${inp}"/>
          </div>
          <button data-action="forgot-request" class="w-full py-3.5 ${btn} text-white rounded-xl font-bold flex items-center justify-center gap-2 ${loading?'btn-loading':''}">
            ${loading ? '<span class="loading-spinner"></span>' : ''}<span>Send me a code</span>
          </button>
          <p class="text-[11px] text-slate-500 text-center">For your safety we show the same message whether or not the account exists.</p>
        </div>` : `
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="forgot-code">6-digit code</label>
            <input id="forgot-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" class="${inp} text-center text-xl tracking-[0.4em]"/>
          </div>
          ${isAdmin ? `
          <div>
            <label class="block text-sm text-purple-300 mb-1.5" for="forgot-admin-key">Admin Master Key</label>
            <input id="forgot-admin-key" type="password" placeholder="Paste the master key" class="w-full px-3.5 py-3 bg-purple-950/40 border border-purple-700/50 rounded-lg text-white"/>
            <p class="text-[10px] text-purple-400/70 mt-1">Admin resets need the code AND the master key.</p>
          </div>` : ''}
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="forgot-new-password">New password (min 6 characters)</label>
            <input id="forgot-new-password" type="password" placeholder="New password" autocomplete="new-password" class="${inp}"/>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="forgot-confirm-password">Confirm new password</label>
            <input id="forgot-confirm-password" type="password" placeholder="Confirm password" autocomplete="new-password" class="${inp}"/>
          </div>
          <button data-action="forgot-password-submit" class="w-full py-3.5 ${btn} text-white rounded-xl font-bold flex items-center justify-center gap-2 ${loading?'btn-loading':''}">
            ${loading ? '<span class="loading-spinner"></span>' : ''}<span>Reset Password</span>
          </button>
          <div class="flex justify-between text-xs">
            <button data-action="forgot-restart" class="text-slate-400 underline">Use a different email</button>
            <button data-action="forgot-request-again" class="text-red-400 underline">Send a new code</button>
          </div>
        </div>`}
      </div>
    </div>`;
}

function renderRegister() {
  const role = state.registerRole;
  const isResponder = role === 'responder';
  const isAdmin = role === 'admin';
  const isPro = role === 'professional';
  const adminExists = hasAdmin();
  const loading = state.authLoading;
  const d = state.regDraft || {};
  const towns = d.province ? (SA_TOWNS_DATA[d.province] || []) : [];
  return `
    <div class="min-h-screen bg-slate-950 flex flex-col px-4 py-6">
      <button data-nav="landing" class="text-slate-400 hover:text-white mb-6 self-start text-sm">← Back</button>
      <div class="flex-1 max-w-md mx-auto w-full space-y-6">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-white">Create Account</h2>
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1.5" for="reg-role-select">Create an account as</label>
          <select id="reg-role-select" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold">
            <option value="user" ${role==='user'?'selected':''}>User</option>
            <option value="responder" ${role==='responder'?'selected':''}>Responder</option>
            <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
            <option value="professional" ${role==='professional'?'selected':''}>Mental Health Professional</option>
          </select>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="reg-name">Full Name ${isAdmin ? '' : '(optional)'}</label>
            <input id="reg-name" type="text" placeholder="Jane Doe" value="${esc(d.name || '')}" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"/>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="reg-email">Email <span class="text-red-400" aria-label="required">*</span></label>
            <input id="reg-email" type="email" placeholder="name@email.com" autocomplete="email" value="${esc(d.email || '')}" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"/>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="reg-phone">Cellphone Number <span class="text-red-400" aria-label="required">*</span></label>
            <input id="reg-phone" type="tel" inputmode="tel" placeholder="082 123 4567 or +27821234567" autocomplete="tel" value="${esc(d.phone || '')}" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"/>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="reg-password">Password <span class="text-red-400" aria-label="required">*</span> <span class="text-slate-500 font-normal">(min 6 characters)</span></label>
            <div class="relative">
              <input id="reg-password" type="password" placeholder="Choose a password" autocomplete="new-password" value="${esc(d.password || '')}" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white pr-12"/>
              <button type="button" data-action="toggle-password" data-target="reg-password" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-semibold" aria-label="Show password">Show</button>
            </div>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="reg-password-confirm">Confirm password <span class="text-red-400" aria-label="required">*</span></label>
            <input id="reg-password-confirm" type="password" placeholder="Confirm password" autocomplete="new-password" value="${esc(d.passwordConfirm || '')}" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"/>
          </div>


          ${(role === 'user' || role === 'professional') ? `
          <div class="bg-slate-900 rounded-xl border border-red-800/50 p-4 space-y-3">
            <p class="text-xs font-bold text-red-300">Emergency PINs <span class="text-red-400">*</span></p>
            <p class="text-[11px] text-slate-400">Your <b>stand-down PIN</b> really cancels an SOS. Your <b>duress PIN</b> looks like it cancels, but silently alerts responders. They must be different (4–6 digits).</p>
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="reg-pin">Stand-down PIN</label>
              <div class="relative">
                <input id="reg-pin" type="password" maxlength="6" inputmode="numeric" autocomplete="off" placeholder="e.g. 4821" value="${esc(d.pin || '')}" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white pr-14 tracking-widest"/>
                <button type="button" data-action="toggle-password" data-target="reg-pin" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-semibold" aria-label="Show PIN">Show</button>
              </div>
            </div>
            <div>
              <label class="block text-sm text-red-200 mb-1.5" for="reg-duress-pin">Duress PIN</label>
              <div class="relative">
                <input id="reg-duress-pin" type="password" maxlength="6" inputmode="numeric" autocomplete="off" placeholder="a different number" value="${esc(d.duressPin || '')}" class="w-full px-3.5 py-3 bg-red-950/30 border border-red-800/60 rounded-lg text-white pr-14 tracking-widest"/>
                <button type="button" data-action="toggle-password" data-target="reg-duress-pin" class="absolute right-3 top-1/2 -translate-y-1/2 text-red-300 hover:text-white text-xs font-semibold" aria-label="Show PIN">Show</button>
              </div>
              <p id="reg-pin-hint" class="text-[11px] mt-1 text-slate-500">Tap “Show” to check what you typed. You can view both PINs later in Settings.</p>
            </div>
          </div>` : ''}

          ${isAdmin ? `
            <div>
              <label class="block text-sm text-purple-300 mb-1.5" for="reg-admin-key">Admin Master Key</label>
              <input id="reg-admin-key" type="password" placeholder="Paste the master key" value="${esc(d.adminKey || '')}" class="w-full px-3.5 py-3 bg-purple-950/40 border border-purple-700/50 rounded-lg text-white"/>
              <p class="text-[10px] text-purple-400/70 mt-1">With the master key your admin account is active immediately. Without it, an existing admin must approve you before you can sign in.</p>
            </div>
          ` : ''}

          ${isPro ? `
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="reg-industry">Your industry / specialty <span class="text-red-400">*</span></label>
              <select id="reg-industry" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
                <option value="">Select your industry...</option>
                ${['Psychologist','Counsellor','Psychiatrist','Social Worker','Therapist / Psychotherapist','Trauma & GBV Specialist','Addiction Counsellor','Other mental health'].map(i => `<option value="${i}" ${d.industry===i?'selected':''}>${i}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="reg-license">Professional registration no. (e.g. HPCSA) <span class="text-red-400">*</span></label>
              <input id="reg-license" type="text" placeholder="Registration number" value="${esc(d.license || '')}" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"/>
              <p class="text-[10px] text-slate-500 mt-1">An admin verifies this before you can chat with users.</p>
            </div>
          ` : ''}

          ${isResponder ? `
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="reg-org">Organisation (optional)</label>
              <input id="reg-org" type="text" placeholder="e.g. Community Watch" value="${esc(d.org || '')}" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"/>
            </div>
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="reg-job">Job Role <span class="text-red-400" aria-label="required">*</span></label>
              <select id="reg-job" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
                <option value="">Select your job...</option>
                ${RESPONDER_JOBS.map(j => `<option value="${esc(j)}" ${d.job===j?'selected':''}>${esc(j)}</option>`).join('')}
              </select>
              <p class="text-[10px] text-teal-400/80 mt-1">Your job role will be visible to users when you dispatch to their incident.</p>
            </div>
          ` : ''}

          ${!isAdmin ? `
          <div class="pt-3 border-t border-slate-800 space-y-3">
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="reg-province">Province <span class="text-red-400" aria-label="required">*</span></label>
              <select id="reg-province" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
                <option value="">Select province...</option>
                ${SA_PROVINCES.map(p => `<option value="${esc(p)}" ${d.province===p?'selected':''}>${esc(p)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm text-slate-300 mb-1.5" for="reg-town">Town <span class="text-red-400" aria-label="required">*</span></label>
              <select id="reg-town" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
                <option value="">Select town...</option>
                ${towns.map(x => `<option value="${esc(x)}" ${d.town===x?'selected':''}>${esc(x)}</option>`).join('')}
              </select>
            </div>
          </div>` : ''}

          ${!isAdmin ? `
          <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
            <div class="flex items-start gap-2">
              <svg class="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              <div class="min-w-0">
                <p class="text-xs font-bold text-blue-300">Privacy Notice (POPIA)</p>
                <p class="text-[11px] text-slate-400 mt-1">SafeMesh collects the minimum information needed to coordinate emergency response: name, town, province, email, and location only during an active emergency. We never access your photos, contacts, social media, or any other app.</p>
              </div>
            </div>
            <label class="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" ${state.popiaAccepted?'checked':''} data-action="toggle-popia" class="mt-0.5 w-4 h-4 accent-red-600" aria-describedby="popia-desc"/>
              <span id="popia-desc" class="text-xs text-slate-300">I have read and consent to the <button data-nav="privacy" class="text-red-400 underline">privacy notice</button>. <span class="text-red-400" aria-label="required">*</span></span>
            </label>
            <label class="flex items-start gap-2 cursor-pointer pt-2 border-t border-slate-800">
              <input type="checkbox" ${state.tosAccepted?'checked':''} data-action="toggle-tos" class="mt-0.5 w-4 h-4 accent-red-600" aria-describedby="tos-desc"/>
              <span id="tos-desc" class="text-xs text-slate-300">I agree to the <button data-nav="terms" class="text-red-400 underline">terms of service</button>. <span class="text-red-400" aria-label="required">*</span></span>
            </label>
          </div>` : ''}

          ${state.authError ? `<div class="p-3 rounded-lg bg-red-950/80 border border-red-700 text-red-200 text-sm" role="alert">${esc(state.authError)}</div>` : ''}
          <button data-action="register-submit" class="w-full py-3.5 ${isAdmin?'bg-purple-600':'bg-red-600'} text-white rounded-xl font-bold flex items-center justify-center gap-2 ${loading?'btn-loading':''}" ${loading?'disabled':''}>
            ${loading ? '<span class="loading-spinner"></span>' : ''}
            <span>${isResponder?'Submit Responder Application':(isAdmin?'Create Admin Account':'Create Account')}</span>
          </button>
        </div>
      </div>
    </div>`;
}

function renderGuestGateway() {
  return `
    <div class="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-8">
      <div class="max-w-md w-full text-center space-y-6">
        <h2 class="text-2xl font-bold text-white">Anonymous Access</h2>
        <p class="text-slate-400 text-sm">Enter as guest. Pick your location so we can route your SOS correctly.</p>
        <div class="text-left space-y-3">
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="guest-province">Province <span class="text-red-400" aria-label="required">*</span></label>
            <select id="guest-province" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
              <option value="">Select province...</option>
              ${SA_PROVINCES.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1.5" for="guest-town">Town <span class="text-red-400" aria-label="required">*</span></label>
            <select id="guest-town" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
              <option value="">Select town...</option>
            </select>
          </div>
        </div>
        <button data-action="guest-enter" class="w-full py-3.5 bg-red-600 text-white rounded-xl font-bold">Enter Emergency Mode</button>
      </div>
    </div>`;
}

function renderPrivacyNotice() {
  return `
    <div class="min-h-screen bg-slate-950 px-4 py-6">
      <button data-nav="landing" class="text-slate-400 hover:text-white mb-4 text-sm">← Back</button>
      <div class="max-w-md mx-auto space-y-4">
        <h1 class="text-2xl font-bold text-white">Privacy Notice (POPIA)</h1>
        <p class="text-xs text-slate-500">Version ${POPIA_VERSION}</p>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">What we collect</h2>
          <p class="text-sm text-slate-300">Name, email, town, province, and location <em>only during an active emergency</em>. Nothing else.</p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">What we never access</h2>
          <ul class="text-sm text-slate-300 list-disc pl-5 space-y-1">
            <li>Your photos, camera, or files</li>
            <li>Your contacts</li>
            <li>Your social media</li>
            <li>Any data from other apps</li>
            <li>Your location when no emergency is active</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">Who sees it</h2>
          <p class="text-sm text-slate-300">Responders in your town — only during an active incident. Nobody else. We do not sell or share your data.</p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">Your rights</h2>
          <ul class="text-sm text-slate-300 list-disc pl-5 space-y-1">
            <li>Access a copy of your data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your data</li>
            <li>Object to processing</li>
            <li>Complain to the Information Regulator</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">Retention</h2>
          <p class="text-sm text-slate-300">Active incidents: resolved + 30 days. Resolved incidents: 12 months. Audio evidence: 7 days unless marked to keep. Account data: until you delete it.</p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">Contact</h2>
          <p class="text-sm text-slate-300">Information Officer: SafeMesh Privacy Team<br/>Email: privacy@safemesh.app</p>
        </section>

        <button data-nav="landing" class="w-full py-3 bg-slate-700 text-white rounded-xl font-bold">Close</button>
      </div>
    </div>`;
}

function renderTerms() {
  return `
    <div class="min-h-screen bg-slate-950 px-4 py-6">
      <button data-nav="landing" class="text-slate-400 hover:text-white mb-4 text-sm">← Back</button>
      <div class="max-w-md mx-auto space-y-4">
        <h1 class="text-2xl font-bold text-white">Terms of Service</h1>
        <p class="text-xs text-slate-500">Version ${TOS_VERSION}</p>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">Emergency use only</h2>
          <p class="text-sm text-slate-300">SafeMesh is not a replacement for emergency services. Always call 10111 (police) or 10177 (ambulance) for life-threatening emergencies.</p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">Prohibited use</h2>
          <ul class="text-sm text-slate-300 list-disc pl-5 space-y-1">
            <li>False alarms with intent to waste responder time</li>
            <li>Impersonating law enforcement, medical, or emergency personnel</li>
            <li>Harassing other users</li>
            <li>Using SafeMesh to commit or facilitate a crime</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">Responder conduct</h2>
          <p class="text-sm text-slate-300">Responders act as volunteers or representatives of their registered organisation. They must follow their organisation's code of conduct and applicable law.</p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-red-400">Limitation of liability</h2>
          <p class="text-sm text-slate-300">SafeMesh is provided "as is". We do not guarantee response times or outcomes.</p>
        </section>

        <button data-nav="landing" class="w-full py-3 bg-slate-700 text-white rounded-xl font-bold">Close</button>
      </div>
    </div>`;
}

/* ============================================================
   USER DASHBOARD
   ============================================================ */
function renderUserDashboard() {
  const tabs = [
    { id:'home', label:'Home' },
    { id:'report', label:'Report' },
    { id:'bulletin', label:'Bulletin' },
    { id:'counselling', label:'Counselling', badge: unreadIn() || '' },
    { id:'directory', label:'Directory' },
    { id:'tools', label:'Tools' },
    { id:'settings', label:'Settings' }
  ];
  let content = '';
  if (state.activeTab === 'home') content = renderHomeTab();
  else if (state.activeTab === 'report') content = renderReportTab();
  else if (state.activeTab === 'bulletin') content = renderUserBulletin();
  else if (state.activeTab === 'counselling') content = renderCounselling();
  else if (state.activeTab === 'directory') content = renderDirectoryTab();
  else if (state.activeTab === 'tools') content = renderToolsTab();
  else if (state.activeTab === 'settings') content = renderSettingsTab();

  const roleBadge = state.userRole === 'guest'
    ? '<span class="role-badge-guest text-[10px] px-2 py-0.5 rounded-full font-semibold">GUEST</span>'
    : '<span class="role-badge-user text-[10px] px-2 py-0.5 rounded-full font-semibold">USER</span>';

  const queueCount = getQueueCount();
  const queuedBadge = queueCount > 0
    ? `<span class="role-badge-queued text-[10px] px-2 py-0.5 rounded-full font-semibold" aria-label="${queueCount} queued alerts">${queueCount} QUEUED</span>`
    : '';

  return `
    <div class="min-h-screen bg-slate-950 pb-24 has-nav">
      <header class="sticky-header bg-slate-900/95 border-b border-slate-800">
        <div class="max-w-2xl mx-auto flex items-center justify-between px-4 py-3 gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-bold text-white">SafeMesh</span>
            ${roleBadge}
            ${queuedBadge}
          </div>
          <button data-action="quick-exit" class="px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-bold active:scale-95" aria-label="Quick exit — leaves app immediately">Exit</button>
        </div>
      </header>
      <main class="max-w-2xl mx-auto">${content}</main>
      ${renderNavBar(tabs, state.activeTab, 'data-tab', 'acc-red')}
      ${renderAbortModal()}
      ${renderResolveModal()}
    </div>`;
}

function renderHomeTab() {
  // Exclude duress / hidden-from-owner incidents so the survivor sees a normal "stood down" home screen
  // (Duress PIN makes the alert look cancelled on the device while responders still see a high-priority signal)
  const myActive = INCIDENTS.find(i =>
    incidentBelongsToMe(i) &&
    i.status !== 'Resolved' &&
    i.status !== 'False Alarm' &&
    !i.hiddenFromOwner &&
    !i.isDuress
  );
  const bulletin = null; /* bulletin now lives in its own tab */
  const bulletinBlock = bulletin ? `
    <div class="${bulletin.kind === 'emergency' ? 'bg-red-950/50 border-red-700/60' : 'bg-emerald-950/40 border-emerald-700/50'} border rounded-xl p-3 space-y-1" role="status">
      <p class="text-xs font-bold ${bulletin.kind === 'emergency' ? 'text-red-400' : 'text-emerald-400'} uppercase">${bulletin.kind === 'emergency' ? 'EMERGENCY ALERT' : 'Bulletin'} · ${esc(bulletin.town)}</p>
      <p class="text-sm ${bulletin.kind === 'emergency' ? 'text-red-100' : 'text-emerald-100'}">${esc(bulletin.message)}</p>
      <p class="text-[10px] opacity-70">${esc(bulletin.org)} · ${esc(timeAgo(new Date(bulletin.at).toISOString()))}</p>
    </div>
  ` : '';

  if (myActive) {
    const inc = myActive;
    const [incLat, incLng] = incidentCoords(inc);
    return `
      <div class="p-4 space-y-4 pb-6">
        ${bulletinBlock}
        <div class="bg-red-950/40 border border-red-800/50 rounded-xl p-3 flex items-center gap-3" role="alert">
          <div class="w-10 h-10 rounded-full bg-red-600/30 flex items-center justify-center animate-pulse">
            <svg class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
          </div>
          <div class="flex-1">
            <p class="text-sm font-bold text-red-400">EMERGENCY ACTIVE</p>
            <p class="text-xs text-slate-400">${esc(inc.category)} · ${esc(safeStatus(inc.status))}</p>
          </div>
        </div>

        <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
          <p class="text-xs uppercase text-slate-500 font-semibold">Responder Status</p>
          ${inc.acknowledged
            ? `<p class="text-sm text-emerald-400 font-bold">✓ Alert acknowledged by ${esc(inc.acknowledgedByOrg || 'responder')}</p>`
            : `<p class="text-sm text-amber-400 font-bold">Waiting for acknowledgment…</p>`}
          ${inc.dispatched
            ? `<p class="text-sm text-blue-400 font-bold">${inc.dispatchUnit === 'On foot' ? '🚶 Responding on foot' : '🚗 Vehicle dispatched'}${inc.dispatchUnit && inc.dispatchUnit !== 'On foot' ? ' · ' + esc(inc.dispatchUnit) : ''}</p>
               <p class="text-xs text-slate-400">ETA ${inc.eta ?? '—'} min</p>`
            : inc.acknowledged ? `<p class="text-sm text-slate-400">Awaiting dispatch decision…</p>` : ''}
          ${responderDistanceLine(inc)}
        </div>

        ${state.isRecording ? `
          <div class="bg-red-950/40 border-2 border-red-700 rounded-xl p-3 flex items-center gap-3" role="status">
            <span class="rec-dot w-3 h-3 rounded-full bg-red-500"></span>
            <p class="text-sm font-bold text-red-300">RECORDING — evidence saved locally</p>
          </div>
        ` : ''}

        <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div id="user-mini-map" class="relative h-56 bg-slate-900" data-lat="${incLat}" data-lng="${incLng}" data-rlat="${typeof inc.responderLat === 'number' ? inc.responderLat : ''}" data-rlng="${typeof inc.responderLng === 'number' ? inc.responderLng : ''}"></div>
        </div>

        <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
          <h3 class="text-sm font-bold text-slate-300">Secure Stand-Down</h3>
          <p class="text-xs text-slate-500">Enter your PIN to cancel this alert.</p>
          <div class="flex gap-2">
            <input id="stand-down-pin" type="password" maxlength="6" inputmode="numeric" placeholder="••••" autocomplete="off" class="flex-1 px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-center text-lg tracking-widest"/>
            <button data-action="stand-down" class="px-5 py-3 bg-slate-700 text-white rounded-lg font-bold text-sm">Confirm</button>
          </div>
        </div>
      </div>`;
  }

  const checkInBlock = state.checkInActive ? `
    <div class="bg-slate-900 rounded-2xl border border-amber-700/50 p-4 space-y-3">
      <h3 class="text-sm font-bold text-amber-400">Check-In Active</h3>
      <p class="text-3xl font-black text-white text-center" id="checkin-remaining">--:--</p>
      <div class="flex gap-2">
        <button data-action="checkin-safe" class="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-sm">I'm safe</button>
        <button data-action="cancel-checkin" class="flex-1 py-2.5 bg-slate-700 text-white rounded-lg font-bold text-sm">Cancel</button>
      </div>
    </div>
  ` : `
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
      <h3 class="text-sm font-bold text-slate-300">Check-In Timer</h3>
      <div class="flex gap-2">
        <select id="checkin-minutes" class="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" aria-label="Check-in duration">
          <option value="15">15 min</option>
          <option value="30" selected>30 min</option>
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
        </select>
        <button data-action="start-checkin" class="px-4 py-2.5 bg-amber-600 text-white rounded-lg font-bold text-sm">Start</button>
      </div>
    </div>
  `;

  return `
    <div class="p-4 space-y-5 pb-6">
      ${bulletinBlock}
      ${pinsBanner()}
      <div class="text-center space-y-1">
        <p class="text-sm text-slate-400">Welcome back,</p>
        <h2 class="text-xl font-bold text-white">${esc(state.user?.name || 'Guest')}</h2>
        ${locationChip()}
      </div>

      <div class="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
        <div class="flex items-center justify-center gap-2 text-emerald-400">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span class="text-xs font-semibold">Ready — press & hold SOS in an emergency</span>
        </div>
        <div class="flex flex-col items-center">
          <button id="sos-btn" data-action="start-sos" class="sos-btn" aria-label="Emergency SOS — press and hold for 3 seconds">
            <svg class="text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
            <span class="text-white font-black sos-text tracking-wider">SOS</span>
            <span class="text-red-200 sos-sub mt-1">${state.countdown > 0 ? `Sending in ${state.countdown}...` : 'Press & Hold'}</span>
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button data-action="silent-sos" class="py-3 bg-slate-800 text-slate-200 rounded-xl font-bold text-xs">Silent SOS</button>
          <button data-action="start-fake-call" class="py-3 bg-slate-800 text-slate-200 rounded-xl font-bold text-xs">Fake Call</button>
        </div>
      </div>
      ${checkInBlock}
    </div>`;
}

function renderReportTab() {
  const atts = state.reportAttachments || [];
  return `
    <div class="p-4 space-y-5 pb-6">
      <h2 class="text-xl font-bold text-white">Report Incident</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-slate-300 mb-1.5" for="report-category">Threat Category</label>
          <select id="report-category" class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
            <option value="">Select category...</option>
            ${THREAT_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1.5" for="report-description">Description</label>
          <textarea id="report-description" rows="3" placeholder="Describe what happened..." class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white resize-none"></textarea>
        </div>

        <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
          <div>
            <p class="text-sm font-semibold text-white">Evidence (required · up to 500 MB)</p>
            <p class="text-xs text-slate-500">Photos, video, audio, PDFs or any file. Stored on this device and shared with responders for this report only. Max ${EVIDENCE_MAX_FILES} files, ${formatBytes(EVIDENCE_MAX_BYTES)} each.</p>
          </div>
          <input id="report-evidence-input" type="file" multiple accept="*/*" class="hidden" aria-label="Attach evidence files"/>
          <button type="button" data-action="pick-report-evidence" class="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold border border-slate-700">
            ${atts.length ? 'Add more files' : 'Attach evidence files'}
          </button>
          ${atts.length ? `
            <ul class="space-y-2">
              ${atts.map(a => `
                <li class="flex items-center justify-between gap-2 bg-slate-950 rounded-lg px-3 py-2 text-xs">
                  <span class="text-slate-300 truncate">${esc(a.fileName)} <span class="text-slate-500">(${esc(a.kind)} · ${formatBytes(a.size)})</span></span>
                  <button type="button" data-action="remove-report-attachment" data-temp-id="${esc(a.tempId)}" class="text-red-400 font-bold shrink-0">Remove</button>
                </li>
              `).join('')}
            </ul>
          ` : ''}
        </div>

        <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold text-white">Anonymity Mode</p>
            <p class="text-xs text-slate-500">Strip name, town and coordinates (evidence still attached)</p>
          </div>
          <div data-action="toggle-anonymity" role="switch" aria-checked="${state.anonymityToggle}" tabindex="0" class="toggle-switch ${state.anonymityToggle?'on':''}"></div>
        </div>
        <button data-action="report-submit" class="w-full py-3 bg-red-600 text-white rounded-xl font-bold">Submit Report${atts.length ? ` + ${atts.length} file${atts.length!==1?'s':''}` : ''}</button>
      </div>
    </div>`;
}

function renderDirectoryTab() {
  const town = state.user?.town || '';
  const province = state.user?.province || '';
  const local = communityWatchFor(town, province);
  const nat = SUPPORT_DIRECTORY.filter(d => d.town === 'National');
  const houses = (SAFEHOUSES || []).filter(s =>
    (s.verified || s.status === 'approved') &&
    (!town || (s.town || '').toLowerCase() === String(town).toLowerCase())
  );
  return `
    <div class="p-4 space-y-5 pb-6">
      <h2 class="text-xl font-bold text-white">Support Directory</h2>
      <p class="text-sm text-slate-400">Services in <span class="text-red-400 font-semibold">${esc(town)}</span></p>
      ${houses.length ? `
        <div>
          <h3 class="text-sm font-bold text-emerald-300 mb-2">Verified Safe Houses</h3>
          ${houses.map(s => `
            <div class="bg-slate-900 rounded-xl border border-emerald-800/40 p-4 space-y-2 mb-2">
              <div class="flex justify-between gap-2">
                <h3 class="text-sm font-bold text-white">${esc(s.name)} <span class="text-[10px] text-emerald-400">✔ Verified</span></h3>
              </div>
              <p class="text-xs text-slate-400">${esc(s.address || '')}${s.town ? ' · ' + esc(s.town) : ''}</p>
              ${s.notes ? `<p class="text-[11px] text-slate-500">${esc(s.notes)}</p>` : ''}
              ${s.phone ? `<a href="tel:${esc(s.phone)}" class="inline-block px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">Call</a>` : ''}
            </div>`).join('')}
        </div>` : ''}
      ${local.map(item => `
        <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
          <div class="flex justify-between">
            <h3 class="text-sm font-bold text-white">${esc(item.name)}</h3>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400">${esc(item.type)}</span>
          </div>
          <p class="text-xs text-slate-500">${esc(item.address)}</p>
          ${item.phone ? `<a href="tel:${esc(item.phone)}" class="inline-block px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-bold">Call</a>` : ''}
        </div>`).join('')}
      ${nat.map(item => `
        <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
          <h3 class="text-sm font-bold text-white">${esc(item.name)}</h3>
          <p class="text-xs text-slate-500">${esc(item.address)}</p>
          <a href="tel:${esc(item.phone)}" class="inline-block px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold">Call</a>
        </div>`).join('')}
    </div>`;
}

function renderToolsTab() {
  const myEvidence = myEvidenceList();
  return `
    <div class="p-4 space-y-5 pb-6">
      <h2 class="text-xl font-bold text-white">Safety Tools</h2>

      <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center">
            <svg class="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
          </div>
          <div class="flex-1">
            <h3 class="text-sm font-bold text-white">Audio Evidence</h3>
            <p class="text-xs text-slate-500">Recordings stored only on this device. Use the player below to listen.</p>
          </div>
        </div>
        <div class="flex items-center justify-between bg-slate-950 rounded-lg p-3">
          <span class="text-xs text-slate-300">${state.recConsent ? '✓ Microphone enabled' : 'Microphone disabled — turn on to record'}</span>
          <div data-action="toggle-rec-consent" role="switch" aria-checked="${state.recConsent}" tabindex="0" class="toggle-switch ${state.recConsent?'on':''}"></div>
        </div>
        ${state.recConsent ? `
          <button data-action="start-recording-manual" class="w-full py-2.5 bg-purple-600 text-white rounded-lg font-bold text-sm ${state.isRecording?'opacity-50':''}" ${state.isRecording?'disabled':''}>${state.isRecording ? 'Recording…' : 'Start Recording'}</button>
          ${state.isRecording ? `<button data-action="stop-recording" class="w-full py-2.5 bg-red-700 text-white rounded-lg font-bold text-sm">Stop &amp; Save Recording</button>` : ''}
        ` : `<p class="text-xs text-amber-400">Enable the microphone toggle above, allow permission when asked, then you can record and play back audio.</p>`}
        ${myEvidence.length ? `
          <div class="space-y-3 pt-2 border-t border-slate-800">
            ${renderEvidenceCards(myEvidence, { canDelete: true })}
          </div>
        ` : `<p class="text-xs text-slate-500">No evidence yet. Attach files when reporting, or enable the mic and record.</p>`}
      </div>

      <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-white">Fake Call</h3>
        <button data-action="start-fake-call" class="w-full py-3 bg-blue-600 text-white rounded-xl font-bold">Start Fake Call</button>
        <button data-action="open-fakecall-config" class="w-full py-2 bg-slate-700 text-white rounded-lg text-sm">Configure Caller</button>
      </div>

      <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-white">Silent SOS</h3>
        <p class="text-xs text-slate-500">No sound, no vibration, no visible change.</p>
        <button data-action="silent-sos" class="w-full py-3 bg-red-700 text-white rounded-xl font-bold">Trigger Silent SOS</button>
      </div>
    </div>`;
}

function renderSettingsTab() {
  const isResponder = state.userRole === 'responder';
  const email = state.user?.email;
  const hasPasswordAccount = !!(email && state.userRole !== 'guest');
  const duty = ON_DUTY[email] || { on: false, radiusKm: 5 };
  return `
    <div class="p-4 space-y-5 pb-6">
      <h2 class="text-xl font-bold text-white">Profile & Settings</h2>

      <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
        <p class="text-sm font-bold text-white">${esc(state.user?.name || 'Guest')}</p>
        <p class="text-xs text-slate-500">${esc(state.user?.email || 'Anonymous session')}</p>
        <p class="text-xs text-slate-400">${esc([state.user?.area, state.user?.town].filter(Boolean).join(', ') || '—')}, ${esc(state.user?.province || '—')}</p>
        <div class="pt-1">${locationChip()}</div>
        <p class="text-[11px] text-slate-500">Your location is detected from GPS so alerts reach responders where you really are. ${deviceLabel()}.</p>
        <button data-action="retry-gps" class="w-full py-2 bg-slate-800 text-blue-300 rounded-lg text-xs font-bold border border-slate-700">📍 Re-detect my location</button>
      </div>

      ${hasPasswordAccount ? `
      <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-slate-300">Change Password</h3>
        <p class="text-xs text-slate-500">Update the password used to sign in on this device.</p>
        <div class="space-y-2">
          <input id="change-current-password" type="password" placeholder="Current password" autocomplete="current-password" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/>
          <input id="change-new-password" type="password" placeholder="New password (min 6 chars)" autocomplete="new-password" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/>
          <input id="change-confirm-password" type="password" placeholder="Confirm new password" autocomplete="new-password" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/>
        </div>
        <button data-action="change-password" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm">Update Password</button>
      </div>
      ` : ''}

      ${!isResponder && state.userRole === 'user' && state.user?.email ? `
      <div class="bg-slate-900 rounded-xl border border-teal-800/50 p-4 space-y-3">
        <h3 class="text-sm font-bold text-teal-300">Become a Responder</h3>
        <p class="text-xs text-slate-500">Apply to receive and respond to local SOS alerts. An admin must approve your application.</p>
        <div>
          <label class="block text-xs text-slate-400 mb-1" for="apply-org">Organisation (optional)</label>
          <input id="apply-org" type="text" placeholder="e.g. Community Watch" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/>
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1" for="apply-job">Job role <span class="text-red-400">*</span></label>
          <select id="apply-job" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm">
            <option value="">Select your job...</option>
            ${RESPONDER_JOBS.map(j => `<option value="${esc(j)}">${esc(j)}</option>`).join('')}
          </select>
        </div>
        <button data-action="apply-as-responder" class="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-sm">Submit Responder Application</button>
      </div>
      ` : ''}

      ${isResponder ? `
      <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-slate-300">On-Duty Status</h3>
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-300">${duty.on ? 'On duty — receiving alerts' : 'Off duty'}</span>
          <div data-action="toggle-duty" role="switch" aria-checked="${duty.on}" tabindex="0" class="toggle-switch duty ${duty.on?'on':''}"></div>
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1.5" for="duty-radius">Response radius</label>
          <div class="flex gap-2">
            <select id="duty-radius" class="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm">
              ${ON_DUTY_RADIUS_OPTIONS.map(r => `<option value="${r}" ${r===duty.radiusKm?'selected':''}>${r} km</option>`).join('')}
            </select>
            <button data-action="save-duty-radius" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Save</button>
          </div>
        </div>
      </div>
      ` : ''}

      ${renderPinSettings()}

      <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-4">
        <h3 class="text-sm font-bold text-slate-300">Privacy Controls (POPIA)</h3>
        <div class="space-y-3">
          <div class="flex items-center justify-between"><span class="text-sm text-slate-300">Share location with responders</span><div data-action="toggle-privacy" role="switch" aria-checked="true" tabindex="0" class="toggle-switch on"></div></div>
          <div class="flex items-center justify-between"><span class="text-sm text-slate-300">Allow anonymous reports</span><div data-action="toggle-privacy" role="switch" aria-checked="true" tabindex="0" class="toggle-switch on"></div></div>
          <div class="flex items-center justify-between"><span class="text-sm text-slate-300">Store logs locally only</span><div data-action="toggle-privacy" role="switch" aria-checked="true" tabindex="0" class="toggle-switch on"></div></div>
        </div>
        <button data-action="download-my-data" class="w-full py-2.5 bg-slate-800 text-slate-200 rounded-lg text-sm font-medium">Download My Data</button>
        <button data-action="delete-all-data" class="w-full py-2.5 border border-red-800/50 text-red-400 rounded-lg text-sm font-medium">Delete All My Data</button>
      </div>

      <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-slate-300">Help &amp; Safety</h3>
        <ul class="text-xs text-slate-400 space-y-2 list-disc pl-4">
          <li><strong class="text-slate-300">SOS:</strong> Press and hold the red button for about 1 second, then confirm or abort.</li>
          <li><strong class="text-slate-300">Silent SOS:</strong> Sends an alert without sound or vibration.</li>
          <li><strong class="text-slate-300">Duress PIN:</strong> Cancels the alert on screen but silently escalates to responders.</li>
          <li><strong class="text-slate-300">Quick Exit:</strong> Clears local session data and leaves the app immediately.</li>
          <li>For life-threatening emergencies always call <strong class="text-white">10111</strong> (police) or <strong class="text-white">10177</strong> (ambulance).</li>
        </ul>
        <p class="text-[10px] text-slate-600 pt-1">SafeMesh v${APP_VERSION} · ${deviceLabel()}</p>
      </div>

      <button data-action="sign-out" class="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-bold">Sign Out</button>
    </div>`;
}

/* ============================================================
   RESPONDER DASHBOARD
   ============================================================ */
function renderResponderDashboard() {
  const { town, province } = state.responderFilter;
  const filtered = getIncidentsForTown(town, province);
  const myAccount = state.accounts.find(a => a.email === state.user?.email);
  // Prefer account cache, then session user object — never default to approved
  const status = myAccount?.responderStatus || state.user?.responderStatus || 'pending';
  const job = myAccount?.job || state.user?.job || 'Responder';
  const org = myAccount?.org || state.user?.org || 'Community Watch';
  const email = state.user?.email;
  const duty = ON_DUTY[email] || { on: false, radiusKm: 5 };

  if (status !== 'approved') {
    return `
      <div class="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div class="max-w-md w-full text-center space-y-4">
          <h2 class="text-xl font-bold text-white">${status === 'pending' ? 'Awaiting Admin Approval' : status === 'rejected' ? 'Application Rejected' : 'Access Revoked'}</h2>
          <p class="text-sm text-slate-400">${status === 'pending' ? 'Your responder account is under review. An admin will approve or reject shortly.' : 'Contact your community watch organisation for more information.'}</p>
          <button data-action="sign-out" class="w-full py-3 bg-slate-700 text-white rounded-xl font-bold">Sign Out</button>
        </div>
      </div>`;
  }

  const tabs = [
    { id:'feed', label:'Feed' },
    { id:'map', label:'Map' },
    { id:'bulletin', label:'Bulletin' },
    { id:'settings', label:'Settings' }
  ];
  let tabContent = '';
  if (state.responderTab === 'feed') tabContent = renderResponderFeed(filtered, town);
  else if (state.responderTab === 'map') tabContent = renderResponderMap(filtered, town);
  else if (state.responderTab === 'bulletin') tabContent = renderResponderBulletin(town);
  else if (state.responderTab === 'settings') tabContent = renderStaffSettings('responder');

  return `
    <div class="min-h-screen bg-slate-950 pb-24 has-nav">
      <header class="sticky-header bg-slate-900/95 border-b border-slate-800">
        <div class="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-bold text-white">SafeMesh</span>
            <span class="role-badge-responder text-[10px] px-2 py-0.5 rounded-full font-semibold">RESPONDER</span>
            <span class="${duty.on ? 'role-badge-onduty' : 'role-badge-offduty'} text-[10px] px-2 py-0.5 rounded-full font-semibold">${duty.on ? 'ON DUTY' : 'OFF DUTY'}</span>
          </div>
          <button data-action="quick-exit" class="px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-bold" aria-label="Quick exit">Exit</button>
        </div>
      </header>
      <div class="p-4 space-y-4 max-w-4xl mx-auto">
        <div class="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm font-bold text-white">${esc(state.user?.name)}</p>
              <p class="text-xs text-slate-500">${esc(org)}</p>
            </div>
            <span class="job-badge text-[10px] px-2 py-0.5 rounded-full font-semibold">${esc(job)}</span>
          </div>
          ${town && province ? `<p class="text-[11px] text-red-200 bg-red-950/40 border border-red-800/50 rounded-lg p-2 mt-2">Locked to ${esc(town)}, ${esc(province)}</p>` : ''}
          <div class="mt-2">${locationChip()}</div>
        </div>
        ${renderGpsRegionBanner()}
        ${tabContent}
      </div>
      ${renderNavBar(tabs, state.responderTab, 'data-resp-tab', 'acc-red')}
    </div>`;
}

function renderResponderFeed(filtered, town) {
  return `
    <div class="space-y-3">
      <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-slate-300">Command Region</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select id="resp-filter-province" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" aria-label="Filter province">
            <option value="">Select province...</option>
            ${SA_PROVINCES.map(p => `<option value="${esc(p)}" ${p===state.responderFilter.province?'selected':''}>${esc(p)}</option>`).join('')}
          </select>
          <select id="resp-filter-town" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" aria-label="Filter town">
            <option value="">Select town...</option>
            ${(SA_TOWNS_DATA[state.responderFilter.province] || []).map(t => `<option value="${esc(t)}" ${t===state.responderFilter.town?'selected':''}>${esc(t)}</option>`).join('')}
          </select>
        </div>
        <button data-action="apply-filter" class="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm">Apply Region</button>
      </div>

      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-300">${town ? `Feed · ${esc(town)}` : 'Live Feed'}</h3>
        <span class="text-xs text-slate-500">${filtered.length} incident${filtered.length!==1?'s':''}</span>
      </div>

      ${filtered.length === 0
        ? `<div class="bg-slate-900 rounded-xl border border-slate-800 p-8 text-center"><p class="text-sm text-slate-500">No incidents</p></div>`
        : '<div class="dev-grid">' + filtered.map(inc => {
            const status = safeStatus(inc.status);
            const statusClass = inc.isDuress ? 'duress' : status.toLowerCase().replace(' ','-');
            return `
            <div class="bg-slate-900 rounded-xl border ${inc.isDuress ? 'border-red-700/80 border-2' : 'border-slate-800'} p-3 space-y-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-bold ${inc.isDuress?'text-red-300':'text-white'}">${esc(inc.category)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full status-${statusClass}">${esc(status)}</span>
                    ${inc.isDuress ? '<span class="duress-badge text-[10px] px-2 py-0.5 rounded-full">DURESS</span>' : ''}
                  </div>
                  <p class="text-xs text-slate-500 mt-0.5">${esc(inc.user)}${inc.reporterRole === 'professional' ? ' <span class="text-emerald-400 font-bold">· HEALTH PRO</span>' : ''} · ${esc(timeAgo(inc.time))}${inc.area ? ' · ' + esc(inc.area) : ''}</p>
                </div>
              </div>
              <p class="text-xs text-slate-400">${esc(inc.description)}</p>
              <div class="text-[10px] text-slate-500">${incidentCoords(inc)[0].toFixed(4)}, ${incidentCoords(inc)[1].toFixed(4)}${inc.approxLocation ? ' · <span class="text-amber-400">≈ approximate (town centre — user GPS was unavailable)</span>' : ''}</div>

              ${inc.acknowledged ? `<div class="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-2 text-xs text-emerald-300">✓ Acknowledged by ${esc(inc.acknowledgedByOrg || 'responder')} · ${esc(timeAgo(new Date(inc.ackAt).toISOString()))}</div>` : ''}
              ${inc.dispatched ? `<div class="bg-blue-950/40 border border-blue-800/50 rounded-lg p-2 text-xs text-blue-300">${inc.dispatchUnit === 'On foot' ? '🚶 On foot' : '🚗 Vehicle'} · ${esc(inc.dispatchUnit||'')} · ETA ${inc.eta ?? '—'} min</div>` : ''}

              ${myActiveResponseIncidents([inc]).length ? renderRouteBlock(inc) : ''}

              ${(() => {
                const evList = evidenceForIncident(inc.id);
                if (!evList.length) return '';
                return `<div class="rounded-lg border border-blue-800/40 bg-blue-950/20 p-2 space-y-2">${renderEvidenceCards(evList, { canDelete: false })}</div>`;
              })()}

              <div class="flex flex-wrap gap-2">
                ${(status === 'Resolved' || status === 'False Alarm') ? `
                  <button data-action="responder-reopen" data-id="${inc.id}" class="flex-1 py-2.5 bg-slate-700 text-white rounded-lg text-xs font-bold">Reopen</button>
                ` : !inc.acknowledged ? `
                  <button data-action="open-ack" data-id="${inc.id}" class="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold">Acknowledge Alert</button>
                ` : !inc.dispatched ? `
                  <button data-action="open-ack" data-id="${inc.id}" class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">Dispatch Decision</button>
                ` : `
                  <button data-action="responder-advance" data-id="${inc.id}" class="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold">Advance</button>
                  <button data-action="responder-mark-resolved" data-id="${inc.id}" class="py-2.5 px-3 bg-emerald-600 text-white rounded-lg text-xs font-bold">Resolve</button>
                  <button data-action="responder-mark-false" data-id="${inc.id}" class="py-2.5 px-3 bg-slate-700 text-white rounded-lg text-xs font-bold">False Alarm</button>
                `}
              </div>
            </div>`;
          }).join('') + '</div>'}
    </div>`;
}

function renderResponderMap(filtered, town) {
  return `
    <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div class="p-3 border-b border-slate-800 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-slate-300">Map${town ? ` · ${esc(town)}` : ''}</h3>
          <button data-action="toggle-heatmap" class="px-2 py-1 text-[10px] rounded ${state.heatmapOn?'bg-red-600 text-white':'bg-slate-800 text-slate-400'}">${state.heatmapOn?'Heat ON':'Heat OFF'}</button>
        </div>
        ${renderMapSearchBox('responder')}
      </div>
      <div class="relative">
        <div id="responder-map" class="relative h-80"></div>
        ${state.heatmapOn ? `
        <div class="heat-legend">
          <p class="text-slate-400 mb-1">Density</p>
          <div class="heat-legend-bar"></div>
          <div class="flex justify-between text-slate-500 mt-0.5"><span>Low</span><span>High</span></div>
        </div>` : ''}
      </div>
    </div>`;
}

function renderUserBulletin() {
  const b = getBulletinFor(state.user?.town, state.user?.province);
  const emg = b && b.kind === 'emergency';
  return `
    <div class="p-4 space-y-4 pb-6">
      <div>
        <h2 class="text-xl font-bold text-white">Community Bulletin</h2>
        <p class="text-xs text-slate-500 mt-1">Official notices from responders and admins for ${esc(state.user?.town || 'your area')}${state.user?.province ? ', ' + esc(state.user.province) : ''}.</p>
      </div>
      ${b ? `
      <div class="${emg ? 'bg-red-950/50 border-red-700/60' : 'bg-emerald-950/40 border-emerald-700/50'} border rounded-xl p-4 space-y-2" role="status">
        <p class="text-xs font-bold ${emg ? 'text-red-400' : 'text-emerald-400'} uppercase">${emg ? 'Emergency alert' : 'Community notice'} · ${esc(b.town)}</p>
        <p class="text-sm ${emg ? 'text-red-100' : 'text-emerald-100'}">${esc(b.message)}</p>
        <p class="text-[11px] opacity-70">${esc(b.org)} · ${esc(timeAgo(new Date(b.at).toISOString()))}</p>
      </div>` : `
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-1">
        <p class="text-sm font-semibold text-slate-300">No bulletin right now</p>
        <p class="text-xs text-slate-500">When a responder or admin posts a notice for your town, it shows here.</p>
      </div>`}
    </div>`;
}

function renderStaffSettings(kind) {
  const u = state.user || {};
  const email = u.email;
  const acc = Object.assign({}, state.accounts.find(a => a.email === email) || {}, kind === 'professional' ? (state.me || {}) : {});
  const phone = u.phone || acc.phone || '—';
  const duty = ON_DUTY[email] || { on: false, radiusKm: 5 };
  const tracking = liveWatchId !== null;
  const dev = document.documentElement.dataset.device || 'laptop';
  const card = 'bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3';
  const inp = 'w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm';
  return `
    <div class="space-y-4 pb-6">
      <h2 class="text-xl font-bold text-white">Settings</h2>
      <div class="${card}">
        <p class="text-sm font-bold text-white">${esc(u.name || (kind === 'admin' ? 'Admin' : 'Responder'))}</p>
        <p class="text-xs text-slate-400">${esc(email || '')}</p>
        <p class="text-xs text-slate-400">Cellphone: ${esc(phone)}</p>
        ${kind === 'responder' ? `<p class="text-xs text-slate-400">${esc(u.org || acc.org || '')} · ${esc(u.job || acc.job || '')}</p>
        <p class="text-xs text-slate-400">${esc(u.town || '—')}, ${esc(u.province || '—')}</p>` : (kind === 'professional' ? `<p class="text-xs text-emerald-300">${esc(acc.industry || '')} · ${acc.proStatus === 'approved' ? 'Verified' : 'Awaiting verification'}</p>` : '<p class="text-xs text-purple-300">Administrator</p>')}
      </div>
      ${kind === 'professional' ? `
      <div class="${card}">
        <h3 class="text-sm font-bold text-slate-300">Availability</h3>
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-300">${acc.accepting === false ? 'Not accepting new chats' : 'Accepting chats'}</span>
          <div data-action="toggle-accepting" role="switch" aria-checked="${acc.accepting !== false}" tabindex="0" class="toggle-switch ${acc.accepting !== false ? 'on' : ''}"></div>
        </div>
      </div>` : ''}
      ${kind === 'responder' ? `
      <div class="${card}">
        <h3 class="text-sm font-bold text-slate-300">On-Duty Status</h3>
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-300">${duty.on ? 'On duty — receiving alerts' : 'Off duty'}</span>
          <div data-action="toggle-duty" role="switch" aria-checked="${duty.on}" tabindex="0" class="toggle-switch duty ${duty.on ? 'on' : ''}"></div>
        </div>
        <div class="flex gap-2">
          <select id="duty-radius" class="${inp} flex-1" aria-label="Response radius">
            ${ON_DUTY_RADIUS_OPTIONS.map(r => `<option value="${r}" ${r === duty.radiusKm ? 'selected' : ''}>${r} km</option>`).join('')}
          </select>
          <button data-action="save-duty-radius" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Save</button>
        </div>
      </div>
      <div class="${card}">
        <h3 class="text-sm font-bold text-slate-300">Verified Safe Houses</h3>
        <p class="text-[11px] text-slate-500">Add a verified safe location for people in your town. Admin may confirm pending entries.</p>
        <input id="sh-name" class="${inp}" placeholder="Name (e.g. Community Centre)" maxlength="120"/>
        <input id="sh-address" class="${inp}" placeholder="Street address" maxlength="200"/>
        <input id="sh-phone" class="${inp}" placeholder="Contact phone (optional)" maxlength="30"/>
        <textarea id="sh-notes" class="${inp}" rows="2" placeholder="Notes for users (hours, access…)" maxlength="500"></textarea>
        <button data-action="add-safehouse" class="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold">Add Safe House</button>
        <div class="space-y-2 pt-2">
          ${(SAFEHOUSES || []).filter(s => !u.town || (s.town || '').toLowerCase() === String(u.town || '').toLowerCase()).slice(0, 12).map(s => `
            <div class="bg-slate-800/60 border border-slate-700 rounded-lg p-2.5">
              <div class="flex justify-between gap-2">
                <div>
                  <p class="text-xs font-bold text-white">${esc(s.name)} ${shBadgeMini(s)}</p>
                  <p class="text-[11px] text-slate-400">${esc(s.address || '')} · ${esc(s.town || '')}</p>
                </div>
                <button data-action="delete-safehouse" data-id="${s.id}" class="text-[10px] text-red-400 font-bold px-2">Delete</button>
              </div>
            </div>`).join('') || '<p class="text-[11px] text-slate-500">No safe houses in your town yet.</p>'}
        </div>
      </div>` : ''}
      ${renderLiveCard(kind)}
      ${kind === 'professional' ? renderPinSettings() : ''}
      <div class="${card}">
        <h3 class="text-sm font-bold text-slate-300">Change Password</h3>
        <input id="change-current-password" type="password" placeholder="Current password" autocomplete="current-password" class="${inp}"/>
        <input id="change-new-password" type="password" placeholder="New password (min 6 chars)" autocomplete="new-password" class="${inp}"/>
        <input id="change-confirm-password" type="password" placeholder="Confirm new password" autocomplete="new-password" class="${inp}"/>
        <button data-action="change-password" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm">Update Password</button>
      </div>
      <button data-action="sign-out" class="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-bold">Sign Out</button>
    </div>`;
}

function renderResponderBulletin(town) {
  const t = state.responderFilter.town;
  const province = state.responderFilter.province;
  const current = t && province ? getBulletinFor(t, province) : null;
  return `
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
      <h3 class="text-sm font-bold text-slate-300">Bulletin${t ? ` · ${esc(t)}` : ''}</h3>
      <textarea id="broadcast-input" rows="3" placeholder="Broadcast a safety advisory..." class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white resize-none text-sm"></textarea>
      <button data-action="broadcast" class="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-sm">Broadcast</button>
      ${current ? `<div class="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-3"><p class="text-[10px] text-emerald-400 font-semibold uppercase">Current</p><p class="text-xs text-emerald-200 mt-1">${esc(current.message)}</p></div>` : ''}
    </div>`;
}

/* ============================================================
   ADMIN DASHBOARD
   ============================================================ */

/* ============================================================
   ADMIN: SAFE HOUSES
   ============================================================ */
function shState(h) { if (h.status === 'rejected') return 'rejected'; if (h.status === 'approved' || h.verified === true) return 'approved'; return 'pending'; }
function pendingSafehouses() { return (SAFEHOUSES || []).filter(h => shState(h) === 'pending'); }
function shBadgeMini(h) {
  const st = shState(h);
  return st === 'approved' ? '<span class="text-emerald-400">✔ verified</span>' : st === 'rejected' ? '<span class="text-red-400 text-[10px]">rejected</span>' : '<span class="text-amber-400 text-[10px]">pending</span>';
}
function renderSafehouseCard(h) {
  const st = shState(h);
  const badge = st === 'approved' ? '<span class="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">✔ Verified</span>'
    : st === 'rejected' ? '<span class="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-red-900/40 text-red-300 border border-red-700/50">✖ Rejected</span>'
    : '<span class="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/50">⏳ Awaiting verification</span>';
  const pin = (typeof h.lat === 'number' && typeof h.lng === 'number')
    ? `<a href="https://www.google.com/maps?q=${h.lat},${h.lng}" target="_blank" rel="noopener" class="text-[11px] text-blue-400 underline">View on map ↗</a>` : '<span class="text-[11px] text-slate-600">no map pin</span>';
  return `<div class="bg-slate-900 rounded-xl border ${st === 'pending' ? 'border-amber-700/50' : st === 'rejected' ? 'border-red-900/50' : 'border-emerald-800/40'} p-4 space-y-2">
    <div class="flex items-start justify-between gap-2"><div class="min-w-0"><p class="text-sm font-bold text-white break-words">${esc(h.name)}</p><p class="text-xs text-slate-400">${esc(h.address || 'No address')} · ${esc(h.town)}, ${esc(h.province)}</p></div>${badge}</div>
    ${h.notes ? `<p class="text-[11px] text-slate-500">${esc(h.notes)}</p>` : ''}
    <p class="text-[11px] text-slate-500">${h.phone ? '☎ ' + esc(h.phone) + ' · ' : ''}Added by ${esc(h.createdByName || h.createdBy || 'unknown')}${h.createdByRole ? ' (' + esc(h.createdByRole) + ')' : ''} · ${esc(timeAgo(new Date(h.createdAt || Date.now()).toISOString()))}${st === 'approved' && h.verifiedBy ? ' · verified by ' + esc(h.verifiedBy) : ''}</p>
    <div class="flex items-center justify-between gap-2 flex-wrap">${pin}
      <div class="flex gap-2">
        ${st !== 'approved' ? `<button data-action="approve-safehouse" data-id="${h.id}" class="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">✔ Verify</button>` : ''}
        ${st !== 'rejected' ? `<button data-action="reject-safehouse" data-id="${h.id}" class="px-3 py-2 bg-slate-700 text-white rounded-lg text-xs font-bold">✖ Reject</button>` : ''}
        <button data-action="delete-safehouse" data-id="${h.id}" class="px-3 py-2 bg-red-800 text-white rounded-lg text-xs font-bold">Delete</button>
      </div></div></div>`;
}
function renderAdminSafehouses() {
  const all = SAFEHOUSES || [];
  const cnt = { all: all.length, pending: all.filter(h => shState(h) === 'pending').length, approved: all.filter(h => shState(h) === 'approved').length, rejected: all.filter(h => shState(h) === 'rejected').length };
  const f = state.shFilter || 'all';
  const order = { pending: 0, approved: 1, rejected: 2 };
  const list = all.filter(h => f === 'all' || shState(h) === f).sort((a, b) => order[shState(a)] - order[shState(b)] || (b.createdAt || 0) - (a.createdAt || 0));
  const chip = (id, label) => `<button data-action="sh-filter" data-filter="${id}" class="keep-small px-3 py-1.5 rounded-full text-xs font-bold ${f === id ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'}">${label} (${cnt[id]})</button>`;
  const prov = state.shDraftProvince || '';
  const inp = 'w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm';
  return `<div class="space-y-4 pb-4">
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
      <h3 class="text-sm font-bold text-slate-300">Add a safe house <span class="text-[10px] text-emerald-400 font-semibold">· admin entries are verified automatically</span></h3>
      <input id="sh-name" class="${inp}" placeholder="Name (e.g. Community Centre)" maxlength="120"/>
      <input id="sh-address" class="${inp}" placeholder="Street address" maxlength="200"/>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select id="sh-province" class="${inp}" aria-label="Province"><option value="">Select province...</option>${SA_PROVINCES.map(p => `<option value="${esc(p)}" ${p === prov ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <select id="sh-town" class="${inp}" aria-label="Town"><option value="">Select town...</option>${(SA_TOWNS_DATA[prov] || []).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
      </div>
      <input id="sh-phone" class="${inp}" placeholder="Contact phone (optional)" maxlength="30"/>
      <textarea id="sh-notes" class="${inp}" rows="2" placeholder="Notes for users (hours, access…)" maxlength="500"></textarea>
      <button data-action="add-safehouse" class="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold">Add &amp; publish safe house</button>
    </div>
    <div class="flex flex-wrap gap-2">${chip('all', 'All')}${chip('pending', '⏳ Pending')}${chip('approved', '✔ Verified')}${chip('rejected', '✖ Rejected')}</div>
    ${list.length ? `<div class="dev-grid">${list.map(renderSafehouseCard).join('')}</div>` : '<div class="bg-slate-900 rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-500">No safe houses here yet.</div>'}
  </div>`;
}
async function addSafehouse() {
  const v = (id) => (document.getElementById(id)?.value || '').trim();
  const name = v('sh-name'), address = v('sh-address'), phone = v('sh-phone'), notes = v('sh-notes');
  const pickedProv = v('sh-province'), pickedTown = v('sh-town');
  const isAdmin = state.userRole === 'admin';
  const town = pickedTown || (isAdmin ? '' : (state.user?.town || state.responderFilter?.town || ''));
  const province = pickedProv || (isAdmin ? '' : (state.user?.province || state.responderFilter?.province || ''));
  if (!name) { showToast('Enter a name for the safe house', 'error'); return; }
  if (!town || !province) { showToast(isAdmin ? 'Choose the province and town' : 'Set your town/province first', 'error'); return; }
  let lat = null, lng = null;
  if (isAdmin) { const c = TOWN_COORDS[town.toLowerCase()]; if (c) { lat = c[0]; lng = c[1]; } }
  else if (state.userCoords) { lat = state.userCoords.lat; lng = state.userCoords.lng; }
  try {
    const res = await api.createSafehouse({ name, address, phone, notes, town, province, lat, lng });
    if (res.safehouse) { SAFEHOUSES.unshift(res.safehouse); persistSafehouses(); }
    ['sh-name', 'sh-address', 'sh-phone', 'sh-notes'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    showToast(isAdmin ? 'Safe house published & verified' : 'Safe house submitted for admin verification', 'success');
    safeRender();
  } catch (err) { showToast(err.message || 'Could not add safe house', 'error'); }
}
async function rejectSafehouse(id) {
  try {
    await api.updateSafehouse(id, { status: 'rejected' });
    const row = SAFEHOUSES.find(x => String(x.id) === String(id));
    if (row) { row.status = 'rejected'; row.verified = false; }
    persistSafehouses(); safeRender(); showToast('Safe house rejected', 'warn');
  } catch (err) { showToast(err.message || 'Reject failed', 'error'); }
}

/* ============================================================
   ADMIN: LOGS
   ============================================================ */
const LOG_CATS = [['all','All'],['auth','Sign-ins'],['account','Accounts'],['incident','Emergencies'],['safehouse','Safe houses'],['chat','Counselling'],['evidence','Evidence'],['duty','Duty & tracking'],['bulletin','Broadcasts'],['security','Security'],['system','System']];
const LOG_COLORS = { auth:'#60a5fa', account:'#c084fc', incident:'#f87171', safehouse:'#34d399', chat:'#2dd4bf', evidence:'#fbbf24', duty:'#22d3ee', bulletin:'#f472b6', security:'#fb7185', system:'#94a3b8' };
async function fetchAuditLogs(silent, limit) {
  if (state.auditLoading) return;
  state.auditLoading = true;
  try {
    const f = state.auditFilter, params = { limit: limit || 300 };
    if (f.category !== 'all') params.category = f.category;
    if (f.q) params.q = f.q;
    const r = await api.getLogs(params);
    state.auditLogs = r.logs || [];
    state.auditMeta = { total: r.total || 0, counts: r.counts || {}, all: r.all || 0 };
    if (!silent) safeRender();
    return r;
  } catch (e) { if (!silent) showToast(e.message || 'Could not load logs', 'error'); }
  finally { state.auditLoading = false; }
}
function applyLogFilter() {
  state.auditFilter.category = document.getElementById('log-category')?.value || 'all';
  state.auditFilter.q = (document.getElementById('log-search')?.value || '').trim();
  fetchAuditLogs();
}
async function exportLogsCsv() {
  const r = await fetchAuditLogs(true, 5000);
  const rows = (r && r.logs) || state.auditLogs;
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = ['time,category,action,actor,role,summary,ip,device'].concat(rows.map(l => [new Date(l.at).toISOString(), l.category, l.action, l.actor, l.role, l.summary, l.ip, l.device].map(q).join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `safemesh-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  showToast(`Exported ${rows.length} log entries`, 'success');
  safeRender();
}
function renderAdminLogs() {
  const f = state.auditFilter, m = state.auditMeta || {};
  const icon = { phone: '📱', tablet: '📲', computer: '💻', server: '🖥️', unknown: '❔' };
  return `<div class="space-y-3 pb-4">
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h3 class="text-sm font-bold text-slate-300">System Log <span class="text-[10px] text-slate-500 font-normal">· ${m.all || 0} entries recorded · live</span></h3>
        <div class="flex gap-2"><button data-action="logs-refresh" class="keep-small px-3 py-1.5 bg-slate-800 text-slate-200 rounded-lg text-xs font-bold">↻ Refresh</button><button data-action="logs-export" class="keep-small px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold">⬇ Export CSV</button></div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select id="log-category" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" aria-label="Category">${LOG_CATS.map(c => `<option value="${c[0]}" ${f.category === c[0] ? 'selected' : ''}>${c[1]}${c[0] !== 'all' && m.counts && m.counts[c[0]] ? ' (' + m.counts[c[0]] + ')' : ''}</option>`).join('')}</select>
        <input id="log-search" type="text" placeholder="Search name, email, IP, action…" value="${esc(f.q)}" class="sm:col-span-2 w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/>
      </div>
      <button data-action="logs-apply" class="w-full py-2 bg-slate-800 text-slate-200 rounded-lg text-xs font-bold">Apply filter</button>
      <p class="text-[11px] text-slate-500">Showing the newest ${state.auditLogs.length} of ${m.total || 0} matching entries. Passwords, PINs and chat messages are never written to the log.</p>
    </div>
    ${state.auditLogs.length ? state.auditLogs.map(l => {
      const c = LOG_COLORS[l.category] || '#94a3b8', hot = l.category === 'security' || /duress|sos/i.test(l.action);
      return `<div class="bg-slate-900 border ${hot ? 'border-red-800/60' : 'border-slate-800'} rounded-lg p-3 space-y-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style="background:${c}22;color:${c};border:1px solid ${c}55">${esc(l.category)}</span>
          <span class="text-[10px] text-slate-400">${esc(new Date(l.at).toLocaleString())}</span>
          <span class="text-[10px] text-slate-600">${icon[l.device] || ''} ${esc(l.ip || '')}</span>
        </div>
        <p class="text-sm text-slate-200 break-words">${esc(l.summary)}</p>
        <p class="text-[11px] text-slate-500">${esc(l.actor)} · ${esc(l.role)} · <span class="font-mono">${esc(l.action)}</span></p>
        ${l.details && Object.keys(l.details).length ? `<details class="text-[11px] text-slate-500"><summary class="cursor-pointer">details</summary><pre class="whitespace-pre-wrap break-all mt-1 text-slate-400">${esc(JSON.stringify(l.details, null, 1))}</pre></details>` : ''}
      </div>`;
    }).join('') : `<div class="bg-slate-900 rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-500">${state.auditLoading ? 'Loading…' : 'No log entries match.'}</div>`}
  </div>`;
}

function renderAdminPendingAll() {
  const others = pendingOthers(), resp = pendingResponders(), houses = pendingSafehouses();
  if (!others.length && !resp.length && !houses.length) return renderAdminPending();
  return `<div class="space-y-3 pb-4">
    ${others.length ? `<h3 class="text-sm font-bold text-slate-300">Admin &amp; Professional Verification (${others.length})</h3><div class="dev-grid">${others.map(a => `
    <div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
      <div class="flex items-center justify-between"><p class="text-sm font-bold text-white">${esc(a.name || a.email)}</p><span class="role-badge-pending text-[10px] px-2 py-0.5 rounded-full">${a.role === 'admin' ? 'ADMIN REQUEST' : 'PROFESSIONAL'}</span></div>
      <p class="text-xs text-slate-400">${esc(a.email)} · ${esc(a.phone || '')}</p>
      ${a.role === 'professional' ? `<p class="text-xs text-slate-300">${esc(a.industry)} · Reg. no: ${esc(a.license)}</p>` : '<p class="text-xs text-slate-500">Registered without the master key</p>'}
      <div class="flex gap-2"><button data-action="approve-account" data-email="${esc(a.email)}" class="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">Approve</button><button data-action="reject-account" data-email="${esc(a.email)}" class="flex-1 py-2 bg-red-700 text-white rounded-lg text-xs font-bold">Reject</button></div>
    </div>`).join('')}</div>` : ''}
    ${resp.length ? renderAdminPending() : ''}
    ${houses.length ? `<h3 class="text-sm font-bold text-slate-300 pt-2">Safe houses awaiting verification (${houses.length})</h3><div class="dev-grid">${houses.map(renderSafehouseCard).join('')}</div>` : ''}
  </div>`;
}

function renderAdminDashboard() {
  const pendingCount = pendingResponders().length + pendingOthers().length + pendingSafehouses().length;
  const tabs = [
    { id:'monitor', label:'Monitor' },
    { id:'pending', label:'Pending', badge: pendingCount || '' },
    { id:'safehouses', label:'Safe Houses' },
    { id:'responders', label:'Team' },
    { id:'broadcast', label:'Broadcast' },
    { id:'logs', label:'Logs' },
    { id:'health', label:'Health' },
    { id:'settings', label:'Settings' }
  ];
  let content = '';
  if (state.adminTab === 'pending') content = renderAdminPendingAll();
  else if (state.adminTab === 'monitor') content = renderAdminMonitor();
  else if (state.adminTab === 'safehouses') content = renderAdminSafehouses();
  else if (state.adminTab === 'responders') content = renderAdminResponders();
  else if (state.adminTab === 'broadcast') content = renderAdminBroadcast();
  else if (state.adminTab === 'logs') content = renderAdminLogs();
  else if (state.adminTab === 'health') content = renderAdminHealth();
  else if (state.adminTab === 'settings') content = renderStaffSettings('admin');

  return `
    <div class="min-h-screen bg-slate-950 pb-24 has-nav">
      <header class="sticky-header bg-slate-900/95 border-b border-slate-800">
        <div class="max-w-4xl mx-auto flex items-center justify-between px-4 py-3 gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-bold text-white">SafeMesh</span>
            <span class="role-badge-admin text-[10px] px-2 py-0.5 rounded-full font-semibold">ADMIN</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button data-admin-tab="pending" class="px-3 py-2 ${pendingCount > 0 ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300'} rounded-lg text-xs font-bold flex items-center gap-1.5" aria-label="View pending applications">
              Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
            <button data-action="quick-exit" class="px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold" aria-label="Quick exit">Exit</button>
          </div>
        </div>
      </header>
      <div class="p-4 space-y-4 max-w-4xl mx-auto">
        ${pendingCount > 0 && state.adminTab !== 'pending' ? `
          <button data-admin-tab="pending" class="w-full flex items-center justify-between gap-3 px-4 py-3 bg-amber-500/15 border border-amber-500/40 rounded-xl text-left">
            <div>
              <p class="text-sm font-bold text-amber-300">${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting for review</p>
              <p class="text-xs text-amber-200/70">Responders, professionals, admins and safe houses</p>
            </div>
            <span class="text-xs font-bold text-amber-300 shrink-0">View →</span>
          </button>
        ` : ''}
        ${content}
      </div>
      ${renderNavBar(tabs, state.adminTab, 'data-admin-tab', 'acc-purple')}
    </div>`;
}

/* ---------- responder vetting (admin) ---------- */
const vetKey = (email) => String(email).replace(/[^a-z0-9]/gi, '_');
function vettingFormHtml(acc) {
  const k = vetKey(acc.email);
  const sel = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs';
  const yn = (id, label) => `<div><label for="${id}" class="block text-[10px] text-slate-400 mb-1">${label}</label><select id="${id}" class="${sel}"><option value="">— choose —</option><option value="yes">Yes</option><option value="no">No</option></select></div>`;
  return `
    <div class="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
      <p class="text-[11px] font-bold text-amber-300">Vetting — required before approval</p>
      ${yn('vet-id-' + k, 'ID checked against an original document?')}
      ${yn('vet-ref-' + k, 'Referee, employer or organisation contacted?')}
      <div><label for="vet-num-${k}" class="block text-[10px] text-slate-400 mb-1">Clearance / accreditation reference</label>
        <input id="vet-num-${k}" type="text" maxlength="120" placeholder="e.g. SAPS clearance no., PSIRA / HPCSA / EMS reg., CPF letter ref" class="${sel}"/></div>
      <div><label for="vet-notes-${k}" class="block text-[10px] text-slate-400 mb-1">Notes (optional, never shown to the applicant)</label>
        <textarea id="vet-notes-${k}" rows="2" maxlength="500" class="${sel}"></textarea></div>
      <p class="text-[10px] text-slate-500">Approval is valid for 12 months, then the responder is suspended until re-vetted.</p>
    </div>`;
}
function readVetForm(email) {
  const k = vetKey(email), g = (id) => document.getElementById(id);
  return {
    idVerified: g('vet-id-' + k)?.value || '', refereeContacted: g('vet-ref-' + k)?.value || '',
    reference: (g('vet-num-' + k)?.value || '').trim(), notes: (g('vet-notes-' + k)?.value || '').trim(),
  };
}
function vettingBadge(acc) {
  const d = (t) => new Date(t).toISOString().slice(0, 10);
  if (acc.vettingLegacy) return `<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300">VETTING REQUIRED by ${acc.vettingExpiresAt ? d(acc.vettingExpiresAt) : 'soon'}</span>`;
  if (!acc.vettedAt) return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">Vetting not recorded</span>';
  if (!acc.vettingExpiresAt) return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300">VETTED</span>';
  const days = Math.ceil((acc.vettingExpiresAt - Date.now()) / 86400000);
  if (days <= 0) return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-300">VETTING EXPIRED</span>';
  if (days <= 30) return `<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300">RE-VET IN ${days} DAY${days === 1 ? '' : 'S'}</span>`;
  return `<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300">Vetted until ${d(acc.vettingExpiresAt)}</span>`;
}
async function adminRevetResponder(email) {
  if (!confirm("Have you checked this person's ID against an original document?")) return;
  if (!confirm('Have you contacted a referee, employer or their organisation?')) return;
  const reference = prompt('Clearance / accreditation reference (SAPS clearance no., PSIRA / HPCSA / EMS registration, organisation letter ref):');
  if (!reference || reference.trim().length < 3) { showToast('A reference is required to record vetting', 'error'); return; }
  try {
    await api.revetResponder(email, { idVerified: 'yes', refereeContacted: 'yes', reference: reference.trim() });
    await syncFromServer(); safeRender();
    showToast('Vetting recorded — valid for another 12 months', 'success');
  } catch (err) { showToast(err.message || 'Could not record vetting', 'error'); }
}

function renderAdminPending() {
  const pending = pendingResponders();
  if (!pending.length) return `
    <div class="bg-slate-900 rounded-xl border border-slate-800 p-8 text-center space-y-2">
      <p class="text-sm font-semibold text-white">Pending applications</p>
      <p class="text-sm text-slate-400">No responder applications waiting for review.</p>
    </div>`;
  return `
    <div class="flex items-center justify-between mb-3 gap-2">
      <h3 class="text-sm font-bold text-slate-300">Pending Applications (${pending.length})</h3>
      <span class="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">Needs review</span>
    </div>
    ${pending.map(acc => `
      <div class="bg-slate-900 rounded-xl border border-amber-700/40 p-4 space-y-3 mb-3">
        <div class="flex justify-between">
          <div>
            <p class="text-sm font-bold text-white">${esc(acc.name)}</p>
            <p class="text-xs text-slate-500">${esc(acc.email)}</p>
          </div>
          <span class="role-badge-pending text-[10px] px-2 py-0.5 rounded-full">PENDING</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="bg-slate-950 rounded-lg p-2"><p class="text-slate-500 text-[10px]">Org</p><p class="text-white">${esc(acc.org)}</p></div>
          <div class="bg-slate-950 rounded-lg p-2"><p class="text-slate-500 text-[10px]">Job</p><p class="text-teal-300">${esc(acc.job)}</p></div>
          <div class="bg-slate-950 rounded-lg p-2 col-span-2"><p class="text-slate-500 text-[10px]">Region</p><p class="text-white">${esc(acc.town)}, ${esc(acc.province)}</p></div>
        </div>
        ${vettingFormHtml(acc)}
        <div class="flex gap-2">
          <button data-action="admin-reject-responder" data-email="${esc(acc.email)}" class="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold">Reject</button>
          <button data-action="admin-approve-responder" data-email="${esc(acc.email)}" class="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold">Approve</button>
        </div>
      </div>`).join('')}`;
}

function renderAdminMonitor() {
  const { province, town } = state.adminFilter;
  let list = INCIDENTS.slice();
  if (province) list = list.filter(i => i.province.toLowerCase() === province.toLowerCase());
  if (town) list = list.filter(i => i.town.toLowerCase() === town.toLowerCase());
  return `
    <div class="space-y-3">
      <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-slate-300">Global Incident Monitor</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select id="admin-filter-province" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" aria-label="Filter province">
            <option value="">All provinces</option>
            ${SA_PROVINCES.map(p => `<option value="${esc(p)}" ${p===province?'selected':''}>${esc(p)}</option>`).join('')}
          </select>
          <select id="admin-filter-town" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" aria-label="Filter town">
            <option value="">All towns</option>
            ${province ? (SA_TOWNS_DATA[province] || []).map(t => `<option value="${esc(t)}" ${t===town?'selected':''}>${esc(t)}</option>`).join('') : ''}
          </select>
        </div>
        <div class="flex gap-2">
          <button data-action="apply-admin-filter" class="flex-1 py-2.5 bg-purple-600 text-white rounded-lg font-bold text-sm">Apply Filter</button>
          <button data-action="toggle-heatmap" class="px-3 py-2.5 ${state.heatmapOn?'bg-red-600':'bg-slate-700'} text-white rounded-lg text-xs font-bold">${state.heatmapOn?'Heat ON':'Heat OFF'}</button>
        </div>
        ${renderMapSearchBox('admin')}
      </div>

      <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div id="admin-map" class="relative h-72"></div>
      </div>

      ${list.length === 0 ? `<div class="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center"><p class="text-sm text-slate-500">No incidents match filter</p></div>`
        : '<div class="dev-grid">' + list.map(inc => {
            const status = safeStatus(inc.status);
            const statusClass = inc.isDuress ? 'duress' : status.toLowerCase().replace(' ','-');
            const isClosed = status === 'Resolved' || status === 'False Alarm';
            return `
            <div class="bg-slate-900 rounded-xl border border-slate-800 p-3 space-y-2">
              <div class="flex justify-between gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-bold text-white">${esc(inc.category)}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-full status-${statusClass}">${esc(status)}</span>
                  ${inc.isDuress ? '<span class="duress-badge text-[10px] px-2 py-0.5 rounded-full">DURESS</span>' : ''}
                </div>
              </div>
              <p class="text-xs text-slate-500">${esc(inc.area ? inc.area + ', ' : '')}${esc(inc.town)}, ${esc(inc.province)} · ${esc(timeAgo(inc.time))}${inc.reporterRole === 'professional' ? ' · <span class="text-emerald-400 font-bold">HEALTH PRO</span>' : ''}${inc.approxLocation ? ' · <span class="text-amber-400">≈ approx. location</span>' : ''}</p>
              ${inc.acknowledged ? `<p class="text-[10px] text-emerald-400">✓ Acknowledged</p>` : ''}
              ${inc.dispatched ? `<p class="text-[10px] text-blue-400">${inc.dispatchUnit === 'On foot' ? '🚶' : '🚗'} ${esc(inc.dispatchUnit||'')}</p>` : ''}
              ${(() => {
                const evList = evidenceForIncident(inc.id);
                if (!evList.length) return '';
                return `<div class="rounded-lg border border-blue-800/40 bg-blue-950/20 p-2">${renderEvidenceCards(evList, { canDelete: false })}</div>`;
              })()}
              <div class="flex flex-wrap gap-2 pt-1">
                ${!isClosed ? `<button data-action="admin-force-resolve" data-id="${inc.id}" class="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">Force Resolve</button>` : ''}
                <button data-action="admin-reassign" data-id="${inc.id}" class="py-2 px-3 bg-blue-600 text-white rounded-lg text-xs font-bold">Reassign</button>
                <button data-action="admin-delete-incident" data-id="${inc.id}" class="py-2 px-3 bg-red-700 text-white rounded-lg text-xs font-bold">Delete</button>
              </div>
            </div>`;
          }).join('') + '</div>'}
    </div>`;
}

function renderAdminResponders() {
  const approved = approvedResponders();
  const others = state.accounts.filter(a => a.role === 'responder' && a.responderStatus && !['approved','pending'].includes(a.responderStatus));
  const users = state.accounts.filter(a => a.role === 'user');
  const pros = state.accounts.filter(a => a.role === 'professional');
  return `
    <h3 class="text-sm font-bold text-slate-300 mb-3">Approved Responders (${approved.length})</h3>
    ${approved.length === 0 ? `<div class="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-500 mb-3">No approved responders yet</div>`
      : approved.map(acc => `
      <div class="bg-slate-900 rounded-xl border border-slate-800 p-3 space-y-2 mb-3">
        <div class="flex justify-between">
          <div>
            <p class="text-sm font-bold text-white">${esc(acc.name)}</p>
            <p class="text-xs text-slate-500">${esc(acc.email)}</p>
          </div>
          <span class="job-badge text-[10px] px-2 py-0.5 rounded-full font-semibold">${esc(acc.job || 'Responder')}</span>
        </div>
        <p class="text-xs text-slate-400">${esc(acc.org)} · ${esc(acc.town)}, ${esc(acc.province)}</p>
        <div>${vettingBadge(acc)}</div>
        <div class="flex gap-2 flex-wrap">
          <button data-action="admin-revet-responder" data-email="${esc(acc.email)}" class="flex-1 py-2 bg-amber-600/90 text-white rounded-lg text-xs font-bold">Renew vetting</button>
          <button data-action="admin-reset-password" data-email="${esc(acc.email)}" class="flex-1 py-2 bg-slate-800 text-slate-200 rounded-lg text-xs font-bold">Reset password</button>
          <button data-action="admin-revoke-responder" data-email="${esc(acc.email)}" class="flex-1 py-2 bg-red-950/40 border border-red-800/50 text-red-300 rounded-lg text-xs font-bold">Revoke access</button>
        </div>
      </div>`).join('')}
    <h3 class="text-sm font-bold text-slate-300 mb-3 mt-6">Health Professionals (${pros.length})</h3>
    ${pros.length === 0 ? `<div class="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-500 mb-3">No health professionals registered yet</div>`
      : pros.map(acc => `
      <div class="bg-slate-900 rounded-xl border border-slate-800 p-3 space-y-2 mb-3">
        <div class="flex justify-between">
          <div>
            <p class="text-sm font-bold text-white">${esc(acc.name || acc.email)}</p>
            <p class="text-xs text-slate-500">${esc(acc.email)}</p>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${acc.proStatus === 'approved' ? 'bg-emerald-900/40 text-emerald-300' : acc.proStatus === 'rejected' ? 'bg-red-900/30 text-red-300' : 'bg-amber-900/30 text-amber-300'}">${esc((acc.proStatus || 'pending').toUpperCase())}</span>
        </div>
        <p class="text-xs text-slate-400">${esc(acc.industry || 'Professional')}${acc.license ? ' · Reg: ' + esc(acc.license) : ''} · ${esc(acc.town || '')}, ${esc(acc.province || '')}</p>
        <div class="flex gap-2 flex-wrap">
          ${acc.proStatus !== 'approved' ? `<button data-action="approve-account" data-email="${esc(acc.email)}" class="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">Approve</button>` : ''}
          ${acc.proStatus !== 'rejected' ? `<button data-action="reject-account" data-email="${esc(acc.email)}" class="flex-1 py-2 bg-red-950/40 border border-red-800/50 text-red-300 rounded-lg text-xs font-bold">Reject</button>` : ''}
          <button data-action="admin-reset-password" data-email="${esc(acc.email)}" class="flex-1 py-2 bg-slate-800 text-slate-200 rounded-lg text-xs font-bold">Reset password</button>
        </div>
      </div>`).join('')}
    ${users.length ? `
      <h3 class="text-sm font-bold text-slate-300 mb-3 mt-6">Users (${users.length})</h3>
      ${users.map(acc => `
        <div class="bg-slate-900 rounded-xl border border-slate-800 p-3 space-y-2 mb-2">
          <div class="flex justify-between">
            <div>
              <p class="text-xs font-bold text-white">${esc(acc.name)}</p>
              <p class="text-[10px] text-slate-500">${esc(acc.email)}</p>
            </div>
            <span class="text-[10px] text-slate-400">${esc(acc.town || '')}, ${esc(acc.province || '')}</span>
          </div>
          <button data-action="admin-reset-password" data-email="${esc(acc.email)}" class="w-full py-2 bg-slate-800 text-slate-200 rounded-lg text-xs font-bold">Reset password</button>
        </div>`).join('')}
    ` : ''}
    ${others.length ? `
      <h3 class="text-sm font-bold text-slate-300 mb-3 mt-6">Revoked / Rejected</h3>
      ${others.map(acc => `
        <div class="bg-slate-900 rounded-xl border border-slate-800 p-3 flex justify-between mb-2">
          <div><p class="text-xs font-bold text-white">${esc(acc.name)}</p><p class="text-[10px] text-slate-500">${esc(acc.email)}</p></div>
          <div class="flex flex-col items-end gap-1.5">
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">${esc(acc.responderStatus.toUpperCase())}${acc.suspendedReason === 'vetting_expired' ? ' · VETTING EXPIRED' : ''}</span>
            ${acc.suspendedReason === 'vetting_expired' ? `<button data-action="admin-revet-responder" data-email="${esc(acc.email)}" class="px-3 py-1.5 bg-amber-600/90 text-white rounded-lg text-[11px] font-bold">Re-vet &amp; reinstate</button>` : ''}
          </div>
        </div>`).join('')}
    ` : ''}
    ${(() => {
      const pendingSH = (SAFEHOUSES || []).filter(s => s.status === 'pending' || s.verified === false);
      if (!pendingSH.length) return '';
      return `<h3 class="text-sm font-bold text-slate-300 mb-3 mt-6">Pending Safe Houses (${pendingSH.length})</h3>` +
        pendingSH.map(s => `
        <div class="bg-slate-900 rounded-xl border border-slate-800 p-3 space-y-2 mb-2">
          <p class="text-sm font-bold text-white">${esc(s.name)}</p>
          <p class="text-xs text-slate-400">${esc(s.address || '')} · ${esc(s.town || '')}, ${esc(s.province || '')}</p>
          <p class="text-[10px] text-slate-500">Added by ${esc(s.createdByName || s.createdBy || '')}</p>
          <div class="flex gap-2">
            <button data-action="approve-safehouse" data-id="${s.id}" class="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">Verify</button>
            <button data-action="delete-safehouse" data-id="${s.id}" class="flex-1 py-2 bg-red-950/40 border border-red-800/50 text-red-300 rounded-lg text-xs font-bold">Remove</button>
          </div>
        </div>`).join('');
    })()}`;
}

function renderAdminBroadcast() {
  return `
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
      <h3 class="text-sm font-bold text-slate-300">Town-Wide Broadcast</h3>
      <select id="admin-broadcast-province" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" aria-label="Broadcast province">
        <option value="">Select province...</option>
        ${SA_PROVINCES.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
      <select id="admin-broadcast-town" class="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" aria-label="Broadcast town">
        <option value="">Select town...</option>
      </select>
      <textarea id="admin-broadcast-message" rows="4" placeholder="Message to all residents..." class="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white resize-none text-sm"></textarea>
      <div class="grid grid-cols-2 gap-2">
        <button data-action="admin-broadcast" class="py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm">Send Bulletin</button>
        <button data-action="admin-emergency-alert" class="py-3 bg-red-600 text-white rounded-xl font-bold text-sm">Emergency Alert</button>
      </div>
    </div>`;
}

function renderAdminHealth() {
  const total = INCIDENTS.length;
  const active = INCIDENTS.filter(i => i.status !== 'Resolved' && i.status !== 'False Alarm').length;
  const duress = INCIDENTS.filter(i => i.isDuress && i.status !== 'Resolved').length;
  const responderCount = approvedResponders().length;
  const pendingCount = pendingResponders().length + pendingOthers().length;
  const userCount = state.accounts.filter(a => a.role === 'user').length;
  const queueLen = getQueueCount();
  const onlineCount = Object.values(ON_DUTY).filter(d => d.on).length;
  const evidenceCount = EVIDENCE.length;
  const storageBytes = getStorageBytes();
  const storageMB = (storageBytes / 1024 / 1024).toFixed(2);
  const storagePct = ((storageBytes / (5 * 1024 * 1024)) * 100).toFixed(1);
  const swSupported = 'serviceWorker' in navigator;
  const swActive = swSupported && !!navigator.serviceWorker.controller;

  return `
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
      <h3 class="text-sm font-bold text-slate-300">Platform Health</h3>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-slate-950 rounded-lg p-3"><p class="text-slate-500 text-[10px]">Total incidents</p><p class="text-lg font-bold text-white">${total}</p></div>
        <div class="bg-slate-950 rounded-lg p-3"><p class="text-slate-500 text-[10px]">Active now</p><p class="text-lg font-bold text-amber-400">${active}</p></div>
        <div class="bg-slate-950 rounded-lg p-3"><p class="text-slate-500 text-[10px]">Duress alerts</p><p class="text-lg font-bold text-red-400">${duress}</p></div>
        <div class="bg-slate-950 rounded-lg p-3"><p class="text-slate-500 text-[10px]">Responders</p><p class="text-lg font-bold text-emerald-400">${responderCount}</p></div>
        <div class="bg-slate-950 rounded-lg p-3"><p class="text-slate-500 text-[10px]">Pending apps</p><p class="text-lg font-bold text-amber-400">${pendingCount}</p></div>
        <div class="bg-slate-950 rounded-lg p-3"><p class="text-slate-500 text-[10px]">Users</p><p class="text-lg font-bold text-blue-400">${userCount}</p></div>
        <div class="bg-slate-950 rounded-lg p-3"><p class="text-slate-500 text-[10px]">On duty</p><p class="text-lg font-bold text-emerald-400">${onlineCount}</p></div>
        <div class="bg-slate-950 rounded-lg p-3"><p class="text-slate-500 text-[10px]">Evidence files</p><p class="text-lg font-bold text-purple-400">${evidenceCount}</p></div>
      </div>
    </div>

    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
      <h3 class="text-sm font-bold text-slate-300">System</h3>
      <div class="space-y-2 text-xs">
        <div class="flex justify-between"><span class="text-slate-400">Local storage</span><span class="${storageOK?'text-emerald-400':'text-red-400'} font-semibold">${storageOK?'OK':'Blocked'}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Network</span><span class="${navigator.onLine?'text-emerald-400':'text-amber-400'} font-semibold">${navigator.onLine?'Online':'Offline'}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">App mode</span><span class="text-emerald-400 font-semibold">Server-synced</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Offline shell</span><span class="${!swSupported?'text-slate-500':(swActive?'text-emerald-400':'text-amber-400')} font-semibold">${!swSupported?'Not supported':(swActive?'Active':'Registering…')}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Cross-tab sync</span><span class="${bc?'text-emerald-400':'text-amber-400'} font-semibold">${bc?'BroadcastChannel':'localStorage'}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Offline queue</span><span class="${queueLen>0?'text-amber-400':'text-slate-400'} font-semibold">${queueLen}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Storage used</span><span class="${parseFloat(storagePct) > 80 ? 'text-red-400' : 'text-slate-300'} font-semibold">${storageMB} MB (${storagePct}%)</span></div>
      </div>
      <div class="bg-slate-950 rounded-lg p-3 mt-2">
        <p class="text-[10px] text-slate-500 mb-1.5">Storage usage</p>
        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full ${parseFloat(storagePct) > 80 ? 'bg-red-500' : parseFloat(storagePct) > 50 ? 'bg-amber-500' : 'bg-emerald-500'}" style="width:${Math.min(100, parseFloat(storagePct))}%"></div>
        </div>
      </div>
    </div>

    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
      <h3 class="text-sm font-bold text-slate-300">Change Admin Password</h3>
      <p class="text-xs text-slate-500">Update the password for ${esc(state.user?.email || 'this admin account')}.</p>
      <input id="change-current-password" type="password" placeholder="Current password" autocomplete="current-password" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/>
      <input id="change-new-password" type="password" placeholder="New password (min 6 chars)" autocomplete="new-password" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/>
      <input id="change-confirm-password" type="password" placeholder="Confirm new password" autocomplete="new-password" class="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/>
      <button data-action="change-password" class="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-sm">Update Password</button>
    </div>

    <button data-action="sign-out" class="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-bold">Sign Out</button>`;
}

/* ============================================================
   MODALS
   ============================================================ */
function renderAbortModal() {
  if (!state.showAbortModal) return '';
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="abort-title">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      <div class="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 animate-slide-up">
        <div class="flex items-center justify-center">
          <div class="w-20 h-20 bg-red-600/20 rounded-full flex items-center justify-center border border-red-600/30 relative">
            <div class="absolute inset-0 rounded-full border-4 border-red-600/40 animate-pulse"></div>
            <span class="text-3xl font-black text-red-500">${state.abortCountdown}</span>
          </div>
        </div>
        <h3 id="abort-title" class="text-lg font-bold text-white text-center">Sending SOS in ${state.abortCountdown}s</h3>
        <div class="flex gap-3">
          <button data-action="abort-sos" class="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">Abort</button>
          <button data-action="confirm-sos" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold">Send Now</button>
        </div>
      </div>
    </div>`;
}

function renderResolveModal() {
  if (!state.showResolveModal || !state.resolveIncidentId) return '';
  const inc = getIncidentById(state.resolveIncidentId);
  if (!inc) { state.showResolveModal = false; return ''; }
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="resolve-title">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      <div class="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 animate-slide-up">
        <h3 id="resolve-title" class="text-lg font-bold text-white text-center">Responder says resolved</h3>
        <p class="text-sm text-slate-400 text-center">Is your situation actually resolved?</p>
        <div class="flex gap-3">
          <button data-action="user-need-more-help" data-id="${inc.id}" class="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">No, still need help</button>
          <button data-action="user-confirm-safe" data-id="${inc.id}" class="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold">Yes, I'm safe</button>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   ADMIN ACTIONS
   ============================================================ */
async function applyAsResponder() {
  if (!state.user?.email || state.userRole === 'guest') {
    showToast('Create an account first, then apply as a responder','error');
    return;
  }
  if (state.userRole === 'responder') {
    showToast('You already have a responder account','info');
    return;
  }
  if (state.userRole === 'admin') {
    showToast('Admin accounts cannot become responders','error');
    return;
  }
  const org = (document.getElementById('apply-org')?.value || '').trim() || 'Community Watch';
  const job = (document.getElementById('apply-job')?.value || '').trim();
  if (!job) {
    showToast('Please select your job role','error');
    return;
  }
  try {
    const data = await api.applyAsResponder({ org, job });
    if (data.token) setToken(data.token);
    const account = data.user || {};
    state.user = {
      ...state.user,
      org: account.org || org,
      job: account.job || job,
      responderStatus: account.responderStatus || 'pending',
    };
    state.userRole = 'responder';
    const idx = state.accounts.findIndex(a => a.email === state.user.email);
    if (idx >= 0) state.accounts[idx] = { ...state.accounts[idx], ...account, role: 'responder', responderStatus: 'pending', org, job };
    else state.accounts.push({ ...account, role: 'responder', responderStatus: 'pending', org, job, email: state.user.email });
    store.set('sm_accounts', state.accounts);
    state.currentView = 'responder-dashboard';
    state.responderTab = 'feed';
    persistSession();
    safeRender();
    showToast('Responder application submitted — waiting for admin approval','success');
  } catch (err) {
    showToast(err.message || 'Could not submit application', 'error');
  }
}

async function adminApproveResponder(email) {
  const v = readVetForm(email);
  if (v.idVerified !== 'yes') { showToast("Confirm you checked the applicant's ID against an original document", 'error'); return; }
  if (v.refereeContacted !== 'yes') { showToast('Contact a referee, employer or organisation before approving', 'error'); return; }
  if (v.reference.length < 3) { showToast('Enter the clearance or accreditation reference', 'error'); return; }
  try {
    await api.approveResponder(email, v);
    await syncFromServer();
    const acc = state.accounts.find(a => a.email === email);
    safeRender();
    showToast(`Approved ${acc?.name || email}`, 'success');
  } catch (err) { showToast(err.message || 'Approve failed', 'error'); }
}
async function adminRejectResponder(email) {
  try {
    await api.rejectResponder(email);
    await syncFromServer();
    safeRender();
    showToast('Rejected', 'info');
  } catch (err) { showToast(err.message || 'Reject failed', 'error'); }
}
async function adminRevokeResponder(email) {
  if (!confirm('Revoke this responder?')) return;
  try {
    await api.revokeResponder(email);
    await syncFromServer();
    safeRender();
    showToast('Revoked', 'warn');
  } catch (err) { showToast(err.message || 'Revoke failed', 'error'); }
}
async function adminForceResolve(id) {
  refreshAllFromStorage();
  const inc = getIncidentById(id);
  if (!inc) return;
  const patch = {
    status: 'Resolved',
    resolution: 'resolved',
    confirmedByUser: true,
    forcedBy: state.user?.email || 'admin',
  };
  Object.assign(inc, patch);
  // Clear active SOS UI for the owner if this client holds it
  if (state.sosIncidentId === id) {
    state.sosActive = false;
    state.sosIncidentId = null;
    state.silentSosActive = false;
    try { releaseWakeLock(); } catch {}
  }
  persistIncidents();
  try {
    await api.updateIncident(id, patch);
    showToast(`#${id} force-resolved`, 'success');
  } catch (err) {
    showToast(err.message || 'Resolved locally; server sync failed', 'warn');
  }
  safeRender();
}
async function adminReassign(id) {
  const inc = getIncidentById(id);
  if (!inc) return;
  const p = prompt('New province:', inc.province);
  if (!p) return;
  const t = prompt('New town:', inc.town);
  if (!t) return;
  const coords = TOWN_COORDS[t.toLowerCase()] || [inc.lat, inc.lng];
  try {
    await api.updateIncident(id, { province: p, town: t, lat: coords[0], lng: coords[1] });
    inc.province = p; inc.town = t; inc.lat = coords[0]; inc.lng = coords[1];
    persistIncidents(); safeRender();
    showToast(`Reassigned to ${t}, ${p}`, 'success');
  } catch (err) { showToast(err.message || 'Reassign failed', 'error'); }
}
async function adminDeleteIncident(id) {
  if (!confirm('Permanently delete?')) return;
  refreshAllFromStorage();
  INCIDENTS = INCIDENTS.filter(i => i.id !== id);
  persistIncidents();
  try { await api.deleteIncident(id); } catch {}
  safeRender();
  showToast(`Deleted`, 'warn');
}

/* ============================================================
   BROADCAST ACTIONS
   ============================================================ */
async function doBroadcast() {
  const msg = document.getElementById('broadcast-input').value;
  if (!msg) { showToast('Enter a message','error'); return; }
  const { town, province } = state.responderFilter;
  if (!town || !province) { showToast('Select a Command Region first','error'); return; }
  try {
    const data = await api.createBulletin({ message: msg, town, province, kind: 'community' });
    BULLETINS[bulletinKey(town, province)] = data.bulletin;
    persistBulletins();
    safeRender();
    showToast(`Broadcast sent to ${town}`);
  } catch (err) { showToast(err.message || 'Broadcast failed', 'error'); }
}
async function doAdminBroadcast() {
  const p = document.getElementById('admin-broadcast-province').value;
  const t = document.getElementById('admin-broadcast-town').value;
  const msg = document.getElementById('admin-broadcast-message').value;
  if (!p || !t || !msg) { showToast('Fill all fields','error'); return; }
  try {
    const data = await api.createBulletin({ message: msg, town: t, province: p, kind: 'community' });
    BULLETINS[bulletinKey(t, p)] = data.bulletin;
    persistBulletins();
    safeRender();
    showToast(`Bulletin sent to ${t}`, 'success');
  } catch (err) { showToast(err.message || 'Broadcast failed', 'error'); }
}
async function doAdminEmergencyAlert() {
  const p = document.getElementById('admin-broadcast-province').value;
  const t = document.getElementById('admin-broadcast-town').value;
  const msg = document.getElementById('admin-broadcast-message').value;
  if (!p || !t || !msg) { showToast('Fill all fields','error'); return; }
  const c = coordsForTown(t, p);
  const inc = {
    id: Date.now(), user: state.user?.name || 'Admin', ownerEmail: null, town: t, province: p,
    category: 'Admin Emergency Alert', status: 'Escalated', time: new Date().toISOString(),
    lat: c[0], lng: c[1], description: msg, approxLocation: true,
  };
  try {
    const b = await api.createBulletin({ message: msg, town: t, province: p, kind: 'emergency' });
    BULLETINS[bulletinKey(t, p)] = b.bulletin; persistBulletins();
    const r = await api.createIncident(inc);
    INCIDENTS.unshift(r && r.incident ? r.incident : inc); persistIncidents();
    safeRender(); showToast(`Emergency alert sent to ${t}`, 'error');
  } catch (err) { showToast(err.message || 'Emergency alert failed', 'error'); }
}

/* ============================================================
   FILTERS
   ============================================================ */
function applyResponderFilter() {
  const p = document.getElementById('resp-filter-province').value;
  const t = document.getElementById('resp-filter-town').value;
  if (!p || !t) { showToast('Select both','error'); return; }
  state.responderFilter = { province:p, town:t };
  persistSession();
  refreshAllFromStorage();
  safeRender(); showToast(`Filtered to ${t}, ${p}`);
}
function applyAdminFilter() {
  const p = document.getElementById('admin-filter-province').value;
  const t = document.getElementById('admin-filter-town').value;
  state.adminFilter = { province:p, town:t };
  refreshAllFromStorage();
  safeRender(); showToast(t ? `Filtered to ${t}` : (p ? `Filtered to ${p}` : 'Showing all'));
}

/* ============================================================
   DATA MANAGEMENT
   ============================================================ */
function deleteAllData() {
  if (!confirm('Delete all your local data? Cannot be undone.')) return;
  state.logs = [];
  state.emergencyContacts = [];
  state.personalPin = null;
  state.duressPin = null;
  state.fakeCallConfig = defaultFakeCallConfig();
  state.recConsent = false;
  state.sessionUser = null;
  EVIDENCE = [];
  try { Object.keys(localStorage).filter(k => k.indexOf('sm_') === 0 && k !== 'sm_token').forEach(k => localStorage.removeItem(k)); } catch {}
  INCIDENTS = []; BULLETINS = {};
  state.currentView = 'landing';
  state.user = null;
  state.userRole = null;
  broadcast('incidents'); broadcast('bulletins');
  safeRender(); showToast('All local data deleted','success');
}
function downloadMyData() {
  const myData = {
    exportedAt: new Date().toISOString(),
    popiaVersion: POPIA_VERSION,
    tosVersion: TOS_VERSION,
    profile: state.user,
    logs: state.logs,
    contacts: state.emergencyContacts,
    incidents: INCIDENTS.filter(i => incidentBelongsToMe(i)),
    evidenceCount: EVIDENCE.filter(e => e.ownerEmail === (state.user?.email || null)).length,
    note: 'Audio evidence files are not included in this export for size reasons. Use the Evidence Locker to download individually.'
  };
  const blob = new Blob([JSON.stringify(myData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `safemesh-my-data-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data export downloaded','success');
}

/* ============================================================
   OFFLINE QUEUE
   ============================================================ */
function getQueue() { return store.get('sm_pending_queue', []); }
function setQueue(q) { store.set('sm_pending_queue', q); }
function enqueueOfflineIncident(inc) {
  const q = getQueue(); q.push(inc); setQueue(q);
  flushOfflineQueue();
}
function flushOfflineQueue() {
  if (!navigator.onLine) return;
  const q = getQueue(); if (!q.length) return;
  const existing = new Set(INCIDENTS.map(i => i.id));
  let added = 0;
  q.forEach(inc => { if (!existing.has(inc.id)) { INCIDENTS.unshift(inc); added++; } });
  if (added) { persistIncidents(); showToast(`${added} queued alert${added!==1?'s':''} synced`, 'success'); }
  setQueue([]);
}
window.addEventListener('online', () => { flushOfflineQueue(); safeRender(); });
window.addEventListener('offline', () => { safeRender(); });

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(() => {
      // Refresh health panel if admin is viewing it
      if (state.currentView === 'admin-dashboard' && state.adminTab === 'health') safeRender();
    }).catch(() => {});
  });
}


/* ============================================================
   DEVICE DETECTION · GPS SEARCH · LIVE TRACKING · MOTION
   ============================================================ */
function detectDevice() {
  const ua = navigator.userAgent || '', touch = navigator.maxTouchPoints || 0;
  const w = window.innerWidth, h = window.innerHeight;
  let type;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (/Macintosh/i.test(ua) && touch > 1)) type = 'tablet';
  else if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)) type = 'phone';
  else type = w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'laptop';   // desktop browsers follow the window width
  const el = document.documentElement;
  el.dataset.device = type;                       // phone | tablet | laptop (laptops + desktop PCs)
  el.dataset.orientation = w > h ? 'landscape' : 'portrait';
  el.dataset.input = touch ? 'touch' : 'mouse';
  el.dataset.wide = w >= 1500 ? 'true' : 'false';
  el.dataset.short = h < 480 ? 'true' : 'false';
  return type;
}
detectDevice();
['resize','orientationchange'].forEach(ev => window.addEventListener(ev, () => { detectDevice(); updateLivePill(); }));
function deviceLabel() { return ({ phone: '📱 Phone view', tablet: '📲 Tablet view', laptop: '💻 Laptop / PC view' })[document.documentElement.dataset.device] || 'Auto'; }

function goToMapTarget(ctx) {
  setTimeout(() => { if (ctx === 'admin') initOrRefreshAdminMap(); else initOrRefreshResponderMap(); }, 30);
}
async function gpsSearch(context) {
  if (!navigator.geolocation) { showToast('GPS is not supported on this device','error'); return; }
  state.mapSearchContext = context; state.mapSearchLoading = true; safeRender();
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    state.userCoords = { lat, lng, acc: pos.coords.accuracy };
    let label = 'My location';
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 3500);
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=${lat}&lon=${lng}`, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(tm);
      if (r.ok) { const j = await r.json(); if (j.display_name) label = j.display_name.split(',').slice(0, 3).join(','); }
    } catch {}
    state.mapSearchTarget = { lat, lng, label };
    state.mapSearchQuery = label; state.mapSearchResults = []; state.mapSearchLoading = false;
    safeRender(); showToast('Centered on your GPS location'); goToMapTarget(context);
  }, (err) => {
    state.mapSearchLoading = false; safeRender();
    showToast(err.code === 1 ? 'Location permission denied — enable GPS access' : 'Could not get your location','error');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
}

/* Real-time tracking */
let liveWatchId = null, liveLayers = new WeakMap(), liveFirstFix = false;
function drawLive() {
  [leafletMap, adminMap, userMiniMap].forEach(m => {
    if (!m || typeof L === 'undefined' || !document.body.contains(m.getContainer())) return;
    let ly = liveLayers.get(m);
    if (liveWatchId === null || !state.userCoords) {
      if (ly) { try { m.removeLayer(ly.dot); m.removeLayer(ly.ring); } catch {} liveLayers.delete(m); }
      return;
    }
    const c = state.userCoords, ll = [c.lat, c.lng];
    if (!ly || !m.hasLayer(ly.dot)) {
      ly = {
        ring: L.circle(ll, { radius: c.acc || 30, color: '#3b82f6', weight: 1, fillOpacity: .12, interactive: false }).addTo(m),
        dot: L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="live-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), zIndexOffset: 1000, interactive: false }).addTo(m)
      };
      liveLayers.set(m, ly);
    } else { ly.dot.setLatLng(ll); ly.ring.setLatLng(ll); ly.ring.setRadius(c.acc || 30); }
    if (liveFirstFix && m !== userMiniMap) { try { m.flyTo(ll, Math.max(m.getZoom(), 15), { duration: .8 }); } catch {} }
  });
  liveFirstFix = false;
}
function startTracking() {
  if (!navigator.geolocation) { showToast('GPS is not supported on this device','error'); return; }
  if (liveWatchId !== null) return;
  // Secure context required in most browsers (HTTPS or localhost)
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
    showToast('Location needs HTTPS (or localhost). Open the app via a secure URL.','error');
    return;
  }
  liveFirstFix = true;
  liveWatchId = navigator.geolocation.watchPosition((pos) => {
    state.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
    state.gpsStatus = 'verified'; drawLive();
    refreshLiveWidgets(); detectRegionFromGPS(); shareResponderPosition();
    // Keep duty location fresh while on duty
    const email = state.user?.email;
    if (email && ON_DUTY[email]?.on) {
      ON_DUTY[email] = { ...ON_DUTY[email], lat: state.userCoords.lat, lng: state.userCoords.lng, updatedAt: Date.now() };
      persistDuty();
      api.setDuty({
        on: true,
        radiusKm: ON_DUTY[email].radiusKm || 5,
        lat: state.userCoords.lat,
        lng: state.userCoords.lng,
        town: state.responderFilter?.town || state.user?.town || '',
        province: state.responderFilter?.province || state.user?.province || '',
      }).catch(() => {});
    }
  }, (err) => {
    stopTracking();
    const msg = err && err.code === 1
      ? 'Location permission denied — open browser site settings and allow location for this site'
      : (err && err.code === 2 ? 'GPS position unavailable — try outdoors or enable device location' : 'GPS signal lost');
    state.gpsStatus = err && err.code === 1 ? 'denied' : 'error';
    showToast(msg, 'error');
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  updateLivePill(); showToast('Live location tracking on'); logEvt('tracking_on'); setTimeout(safeRender, 50);
}
function stopTracking() {
  if (liveWatchId !== null) { navigator.geolocation.clearWatch(liveWatchId); liveWatchId = null; logEvt('tracking_off'); }
  drawLive(); updateLivePill();
}
let livePill = null;
function updateLivePill() {
  if (!livePill) {
    livePill = document.createElement('button'); livePill.id = 'sm-live-pill'; livePill.type = 'button';
    livePill.addEventListener('click', () => liveWatchId === null ? startTracking() : stopTracking());
    document.body.appendChild(livePill);
  }
  const icon = { phone: '📱', tablet: '📲', laptop: '💻' }[document.documentElement.dataset.device] || '';
  const on = liveWatchId !== null;
  livePill.className = on ? 'on' : '';
  livePill.textContent = `${on ? '🔵 Live tracking ON' : '📍 Track my location'} · ${icon}`;
  const onDash = ['user-dashboard','responder-dashboard','admin-dashboard','pro-dashboard'].includes(state.currentView);
  const show = onDash && isLoggedInAccount();
  livePill.style.display = show ? 'block' : 'none';
  if (!show && liveWatchId !== null) stopTracking();   // never keep tracking after sign-out / on public pages
}

/* Hooks: animate view changes, keep live layers on re-render */
(function () {
  let lastView = null;
  const _sr = safeRender;
  safeRender = function () {
    _sr.apply(this, arguments);
    const root = document.getElementById('app');
    if (root && state.currentView !== lastView) {
      lastView = state.currentView;
      root.classList.remove('view-enter'); void root.offsetWidth; root.classList.add('view-enter');
      setTimeout(() => root.classList.remove('view-enter'), 900);
    }
    updateLivePill();
    const cl = document.getElementById('chat-log'); if (cl) cl.scrollTop = cl.scrollHeight;
  };
  ['initOrRefreshResponderMap','initOrRefreshAdminMap','initOrRefreshUserMiniMap'].forEach(n => {
    try { const f = window[n]; if (typeof f === 'function') window[n] = function () { const r = f.apply(this, arguments); drawLive(); return r; }; } catch {}
  });
})();

/* ============================================================
   COUNSELLING CHAT · PROFESSIONAL SIDE · ACCOUNT APPROVALS · EVIDENCE DB
   ============================================================ */
const EV_URLS = {};
function evSrc(ev) { return ev.dataUrl || EV_URLS[ev.id] || ''; }
function idbOpen() { return new Promise((res, rej) => { const r = indexedDB.open('safemesh-evidence', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbPut(id, blob) { try { const db = await idbOpen(); db.transaction('files','readwrite').objectStore('files').put(blob, id); } catch { showToast('Could not store large evidence file','error'); } }
async function idbDel(id) { try { const db = await idbOpen(); db.transaction('files','readwrite').objectStore('files').delete(id); } catch {} }
async function idbLoadAll() {
  try {
    const db = await idbOpen(); const st = db.transaction('files').objectStore('files');
    const keys = await new Promise(r => { const q = st.getAllKeys(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); });
    for (const k of keys) { const b = await new Promise(r => { const q = db.transaction('files').objectStore('files').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); if (b) EV_URLS[k] = URL.createObjectURL(b); }
    if (keys.length) safeRender();
  } catch {}
}
idbLoadAll();

function pendingOthers() { return state.accounts.filter(a => (a.role === 'professional' && a.proStatus === 'pending') || (a.role === 'admin' && a.adminStatus === 'pending')); }

async function deleteSafehouse(id) {
  if (!confirm('Remove this safe house?')) return;
  try {
    await api.deleteSafehouse(id);
    SAFEHOUSES = SAFEHOUSES.filter(s => String(s.id) !== String(id));
    persistSafehouses();
    safeRender();
    showToast('Safe house removed', 'info');
  } catch (err) {
    showToast(err.message || 'Delete failed', 'error');
  }
}
async function approveSafehouse(id) {
  try {
    await api.updateSafehouse(id, { status: 'approved', verified: true });
    const row = SAFEHOUSES.find(s => String(s.id) === String(id));
    if (row) { row.status = 'approved'; row.verified = true; }
    persistSafehouses();
    safeRender();
    showToast('Safe house verified', 'success');
  } catch (err) {
    showToast(err.message || 'Approve failed', 'error');
  }
}

async function setAcctStatus(email, status) {
  try {
    await api.setAcctStatus(email, status);
    await syncFromServer();
    showToast(status === 'approved' ? 'Account approved' : 'Account rejected', status === 'approved' ? 'success' : 'warn');
    safeRender();
  } catch (err) { showToast(err.message || 'Update failed', 'error'); }
}


/* ============================================================
   MY ACCOUNT (kept fresh from the server)
   ============================================================ */
function mergeMe(u) {
  state.me = u;
  if (!state.user) return;
  ['responderStatus','proStatus','adminStatus','accepting','hasPins','org','job','industry','phone','name'].forEach(k => { if (u[k] !== undefined) state.user[k] = u[k]; });
  if (state.userRole !== 'admin') {
    const i = state.accounts.findIndex(a => a.email === u.email);
    if (i >= 0) state.accounts[i] = { ...state.accounts[i], ...u };
    else state.accounts.push({ ...u });
  }
}

/* ============================================================
   COUNSELLING CHAT (server is the single source of truth)
   ============================================================ */
let CHATS = [], _chatsInit = false;
function chatsAll() { return CHATS; }
function myChatSide() { return state.userRole === 'professional' ? 'pro' : 'user'; }
function threadKey(m) { return String(state.userRole === 'professional' ? m.u : m.p).toLowerCase(); }
function activeThreadEmail() { return String((state.userRole === 'professional' ? state.chatWith : state.chatPro) || '').toLowerCase(); }
function inChatView() {
  return (state.userRole === 'professional' && state.currentView === 'pro-dashboard' && state.proTab === 'clients') ||
         (state.userRole === 'user' && state.currentView === 'user-dashboard' && state.activeTab === 'counselling');
}
function unreadIn(email) {
  const me = myChatSide(), e = email ? String(email).toLowerCase() : '';
  return CHATS.filter(m => m.from !== me && !m.readAt && (!e || threadKey(m) === e)).length;
}
function playChatBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!_alertAudioCtx || _alertAudioCtx.state === 'closed') _alertAudioCtx = new AC();
    const ctx = _alertAudioCtx; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 740;
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.38);
  } catch {}
  try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch {}
}
function markThreadRead(email) {
  const e = String(email || '').toLowerCase(); if (!e) return;
  const me = myChatSide(); let any = false;
  CHATS.forEach(m => { if (m.from !== me && !m.readAt && threadKey(m) === e) { m.readAt = Date.now(); any = true; } });
  if (any) api.markChatRead(e).catch(() => {});
}
function handleChatSync(next) {
  const prevIds = new Set(CHATS.map(m => String(m.id)));
  const me = myChatSide();
  const fresh = _chatsInit ? next.filter(m => !prevIds.has(String(m.id)) && m.from !== me) : [];
  CHATS = next; _chatsInit = true;
  const open = activeThreadEmail(), viewing = inChatView();
  if (fresh.length) {
    const last = fresh[fresh.length - 1];
    const sameThread = viewing && open && threadKey(last) === open;
    if (!sameThread) {
      const who = state.userRole === 'professional' ? (last.uName || last.u) : (last.pName || last.p);
      showToast('💬 New message from ' + who, 'info');
      playChatBeep();
    }
  }
  if (viewing && open) markThreadRead(open);
}
async function sendChat() {
  const inp = document.getElementById('chat-input'); const text = (inp?.value || '').trim(); if (!text) return;
  const me = state.user?.email;
  if (!me || !isLoggedInAccount()) { showToast('Create an account to use counselling chat','error'); return; }
  const isPro = state.userRole === 'professional';
  const u = isPro ? state.chatWith : me, p = isPro ? me : state.chatPro; if (!u || !p) return;
  const tmp = { id: 'tmp-' + Date.now(), u: String(u).toLowerCase(), p: String(p).toLowerCase(), from: isPro ? 'pro' : 'user', text: text.slice(0, 2000), at: Date.now(), pending: true, readAt: null };
  CHATS = [...CHATS, tmp]; inp.value = ''; safeRender();
  try {
    await api.sendChat(isPro ? { text: tmp.text, userEmail: u } : { text: tmp.text, proEmail: p });
    const res = await api.getChats();
    if (res && Array.isArray(res.messages)) CHATS = res.messages;
    safeRender();
  } catch (err) {
    CHATS = CHATS.filter(m => m.id !== tmp.id); safeRender();
    const i2 = document.getElementById('chat-input'); if (i2) i2.value = text;
    showToast(err.message || 'Message could not be sent', 'error');
  }
}
async function toggleAccepting() {
  try {
    const r = await api.toggleAccepting();
    if (state.me) state.me.accepting = r.accepting;
    if (state.user) state.user.accepting = r.accepting;
    const a = state.accounts.find(x => x.email === state.user?.email); if (a) a.accepting = r.accepting;
    safeRender();
    showToast(r.accepting ? 'You are accepting new chats' : 'You are not accepting new chats', 'info');
  } catch (err) { showToast(err.message || 'Could not update availability', 'error'); }
}
function chatThread(u, p, label, sub) {
  const ul = String(u).toLowerCase(), pl = String(p).toLowerCase();
  const msgs = chatsAll().filter(m => String(m.u).toLowerCase() === ul && String(m.p).toLowerCase() === pl);
  const mine = state.userRole === 'professional' ? 'pro' : 'user';
  return `<div class="flex flex-col" style="height:calc(100dvh - 11rem)">
    <div class="flex items-center gap-3 pb-3 border-b border-slate-800"><button data-action="close-chat" class="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold">← Back</button><div><p class="text-sm font-bold text-white">${esc(label)}</p><p class="text-[11px] text-slate-500">${esc(sub)}</p></div></div>
    <div id="chat-log" class="flex-1 overflow-y-auto py-3 space-y-2">${msgs.length ? msgs.map(m => `<div class="flex ${m.from === mine ? 'justify-end' : 'justify-start'}"><div class="max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.from === mine ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200'} ${m.pending ? 'opacity-60' : ''}">${esc(m.text)}<p class="text-[10px] opacity-60 mt-0.5">${m.pending ? 'sending…' : new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${m.from === mine && m.readAt ? ' · seen' : ''}</p></div></div>`).join('') : '<p class="text-center text-xs text-slate-500 pt-6">No messages yet — say hello.</p>'}</div>
    <div class="flex gap-2 pt-2"><input id="chat-input" type="text" maxlength="2000" placeholder="Type a message…" autocomplete="off" class="flex-1 px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"/><button data-action="send-chat" class="px-4 bg-blue-600 text-white rounded-lg text-sm font-bold">Send</button></div>
  </div>`;
}
function renderCounselling() {
  if (!state.user?.email || state.userRole === 'guest') return '<div class="p-6 text-center text-sm text-slate-400">Create an account to chat with a mental health professional.</div>';
  const pros = state.accounts.filter(a => a.role === 'professional' && a.proStatus === 'approved');
  const cur = pros.find(a => a.email === state.chatPro);
  const me = String(state.user.email).toLowerCase();
  const hasThread = (email) => chatsAll().some(m => String(m.u).toLowerCase() === me && String(m.p).toLowerCase() === String(email).toLowerCase());
  if (cur) return `<div class="p-4">${chatThread(state.user.email, cur.email, cur.name || cur.email, cur.industry)}</div>`;
  return `<div class="p-4 space-y-4 pb-6">
    <div><h2 class="text-xl font-bold text-white">Counselling</h2><p class="text-xs text-slate-500 mt-1">Choose a verified professional to chat with in confidence.</p></div>
    <div class="bg-amber-950/30 border border-amber-700/40 rounded-xl p-3 text-xs text-amber-200">In danger or crisis? Call 10111, or Lifeline 0861 322 322 / SADAG 0800 567 567. Chat is not for emergencies.</div>
    ${pros.length ? `<div class="dev-grid">${pros.map(a => { const un = unreadIn(a.email); return `<div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3"><div><p class="text-sm font-bold text-white">${esc(a.name || a.email)} <span class="text-[10px] text-emerald-400">✔ Verified</span>${un ? ` <span class="ml-1 text-[10px] bg-amber-500 text-slate-900 font-bold rounded-full px-1.5">${un} new</span>` : ''}</p><p class="text-xs text-slate-400">${esc(a.industry)}${a.town ? ' · ' + esc(a.town) : ''}</p><p class="text-[11px] ${a.accepting === false ? 'text-amber-400' : 'text-emerald-400'}">${a.accepting === false ? 'Not accepting new chats' : 'Available'}</p></div>${(a.accepting === false && !hasThread(a.email)) ? '<span class="px-4 py-2 bg-slate-800 text-slate-500 rounded-lg text-xs font-bold">Unavailable</span>' : `<button data-action="open-chat" data-email="${esc(a.email)}" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">${hasThread(a.email) ? 'Continue' : 'Chat'}</button>`}</div>`; }).join('')}</div>` : '<div class="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-sm text-slate-400">No verified professionals are available yet.</div>'}
  </div>`;
}
function renderProDashboard() {
  const me = Object.assign({}, state.user || {}, state.me || {}, { email: state.user?.email });
  const tab = state.proTab || 'clients';
  const unread = unreadIn();
  const tabs = [
    { id:'clients', label:'Clients', badge: unread || '' },
    { id:'sos', label:'SOS', badge: '', badgeClass:'red' },
    { id:'resources', label:'Resources' },
    { id:'settings', label:'Settings' }
  ];
  const approved = me.proStatus === 'approved';
  let body;
  if (me.proStatus === 'rejected') body = '<div class="p-6 text-center space-y-3"><h2 class="text-lg font-bold text-white">Application rejected</h2><p class="text-sm text-slate-400">An admin could not verify your registration details.</p><button data-action="sign-out" class="px-5 py-2.5 bg-slate-800 text-slate-200 rounded-lg font-bold text-sm">Sign Out</button></div>';
  else if (!approved) body = '<div class="p-6 text-center space-y-3"><h2 class="text-lg font-bold text-white">Awaiting verification</h2><p class="text-sm text-slate-400">An admin is checking your registration number. You can chat with users and use SOS once approved.</p><button data-action="pro-refresh" class="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-sm">Check status now</button> <button data-action="sign-out" class="px-5 py-2.5 bg-slate-800 text-slate-200 rounded-lg font-bold text-sm">Sign Out</button></div>';
  else if (tab === 'settings') body = `<div class="p-4">${renderStaffSettings('professional')}</div>`;
  else if (tab === 'sos') body = renderProSOS();
  else if (tab === 'resources') body = `<div class="p-4 space-y-3 pb-6"><h2 class="text-xl font-bold text-white">Resources</h2><div class="dev-grid">${[['Lifeline SA','0861 322 322','Counselling & crisis'],['SADAG Suicide Crisis','0800 567 567','24h mental health'],['GBV Command Centre','0800 428 428','Gender-based violence'],['Police / SAPS','10111','Emergencies']].map(r => `<div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-center"><div><p class="text-sm font-bold text-white">${r[0]}</p><p class="text-xs text-slate-500">${r[2]}</p></div><a href="tel:${r[1].replace(/\s/g,'')}" class="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">${r[1]}</a></div>`).join('')}</div></div>`;
  else if (state.chatWith) { const cw = String(state.chatWith).toLowerCase(); const m0 = chatsAll().find(m => String(m.u).toLowerCase() === cw); body = `<div class="p-4">${chatThread(state.chatWith, me.email, (m0 && m0.uName) || state.chatWith, 'Client')}</div>`; }
  else {
    const mine = String(me.email || '').toLowerCase();
    const threads = {};
    chatsAll().filter(m => String(m.p).toLowerCase() === mine).forEach(m => { threads[String(m.u).toLowerCase()] = m; });
    const list = Object.values(threads).sort((a, b) => b.at - a.at);
    body = `<div class="p-4 space-y-3 pb-6"><h2 class="text-xl font-bold text-white">Clients</h2>${pinsBanner()}${list.length ? `<div class="dev-grid">${list.map(m => { const un = unreadIn(m.u); return `<button data-action="open-chat" data-email="${esc(m.u)}" class="w-full text-left bg-slate-900 border ${un ? 'border-amber-500/60' : 'border-slate-800'} rounded-xl p-4"><div class="flex justify-between items-center gap-2"><p class="text-sm font-bold text-white">${esc(m.uName || m.u)}</p>${un ? `<span class="text-[10px] bg-amber-500 text-slate-900 font-bold rounded-full px-2 py-0.5">${un} new</span>` : ''}</div><p class="text-xs text-slate-400 truncate">${esc(m.text)}</p><p class="text-[10px] text-slate-600 mt-1">${esc(timeAgo(new Date(m.at).toISOString()))}</p></button>`; }).join('')}</div>` : '<div class="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-sm text-slate-400">No clients have messaged you yet.</div>'}</div>`;
  }
  return `<div class="min-h-screen pb-24 has-nav bg-slate-950"><header class="sticky-header px-4 py-3 border-b border-slate-800 bg-slate-900/95"><div class="max-w-4xl mx-auto flex items-center justify-between gap-2"><div class="min-w-0"><p class="text-xs text-emerald-400 font-bold uppercase">Mental Health Professional</p><p class="text-sm text-white font-bold truncate">${esc(state.user?.name || me.email || '')} · ${esc(me.industry || '')}</p></div><button data-action="quick-exit" class="px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-bold shrink-0" aria-label="Quick exit">Exit</button></div></header><div class="max-w-4xl mx-auto">${body}</div>
    ${renderNavBar(tabs, tab, 'data-pro-tab', 'acc-green')}
    ${renderAbortModal()}${renderResolveModal()}</div>`;
}
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'chat-input' && e.key === 'Enter') { e.preventDefault(); sendChat(); } });
window.addEventListener('storage', e => { if (e.key && e.key.indexOf('sm_chats') > -1) safeRender(); });

/* Polling fallback: keeps sides in sync even if cross-tab events don't fire (e.g. file:// pages) */
(function () {
  let sig = '';
  setInterval(() => {
    try {
      const v = state.currentView;
      if (!['pro-dashboard','user-dashboard','responder-dashboard','admin-dashboard'].includes(v) || !state.user) return;
      const ae = document.activeElement;
      if (ae && ['INPUT','TEXTAREA','SELECT'].includes(ae.tagName) && ae.value) return;
      const raw = [localStorage.getItem('sm_accounts'), localStorage.getItem('sm_chats'), localStorage.getItem(INCIDENTS_KEY), localStorage.getItem('sm_bulletins')].join('|');
      const accRaw = localStorage.getItem('sm_accounts');
      const accStale = false; // accounts now come from the server, never overwrite them from a stale local copy
      if ((sig && raw !== sig) || accStale) { refreshAllFromStorage(); safeRender(); }
      sig = raw;
    } catch {}
  }, 2000);
})();


/* ============================================================
   NAVIGATION (one component, 3 layouts via CSS: phone / tablet / laptop+PC)
   ============================================================ */
const NAV_ICONS = { home:'🏠', report:'📝', bulletin:'📢', counselling:'💬', directory:'📖', tools:'🧰', settings:'⚙️',
  feed:'🚨', map:'🗺️', monitor:'🛰️', pending:'⏳', safehouses:'🛡️', responders:'👥', broadcast:'📣', logs:'📜', health:'🩺',
  clients:'💬', sos:'🆘', resources:'📞' };
function renderNavBar(items, active, attr, accent) {
  return `<nav class="nav-bar ${accent}" role="tablist" aria-label="Main navigation">${items.map(it => `
    <button ${attr}="${it.id}" role="tab" aria-selected="${active === it.id}" class="nav-item ${active === it.id ? 'active' : ''}">
      <span class="ico" aria-hidden="true">${NAV_ICONS[it.id] || '•'}</span><span class="lbl">${esc(it.label)}</span>${it.badge ? `<span class="nav-badge ${it.badgeClass || ''}">${it.badge}</span>` : ''}
    </button>`).join('')}</nav>`;
}


/* ============================================================
   LIVE LOCATION WIDGETS (status line, kept maps, pro/admin card)
   ============================================================ */
function liveStatusText() {
  const c = state.userCoords;
  if (!c) return 'No GPS fix yet — switch tracking on or tap “Refresh my location”.';
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `📍 ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · ±${Math.round(c.acc || 0)} m · updated ${t}`;
}
function renderLiveCard(kind) {
  const tracking = liveWatchId !== null;
  const showMap = kind === 'professional' || kind === 'admin';
  return `<div class="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
    <h3 class="text-sm font-bold text-slate-300">Live Location</h3>
    <div>${locationChip()}</div>
    <div class="flex items-center justify-between">
      <span class="text-sm text-slate-300">${tracking ? 'Tracking ON — position updates live' : 'Tracking OFF'}</span>
      <div data-action="toggle-tracking" role="switch" aria-checked="${tracking}" tabindex="0" class="toggle-switch ${tracking ? 'on' : ''}"></div>
    </div>
    <p id="live-status" class="live-status text-[11px] text-slate-400">${liveStatusText()}</p>
    ${showMap ? '<div id="live-map" data-keep-map="pro" class="keep-map h-56 rounded-lg overflow-hidden"></div>' : ''}
    <button data-action="retry-gps" class="w-full py-2 bg-slate-800 text-blue-300 rounded-lg text-xs font-bold border border-slate-700">📍 Refresh my location</button>
    <p class="text-[11px] text-slate-500">${deviceLabel()} · layout adjusts automatically.</p>
  </div>`;
}
function responderDistanceLine(inc) {
  if (typeof inc.responderLat !== 'number' || typeof inc.responderLng !== 'number') return '';
  const [ilat, ilng] = incidentCoords(inc);
  const d = haversineKm(inc.responderLat, inc.responderLng, ilat, ilng);
  return `<p class="text-xs text-blue-300">📍 Responder is about ${d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km'} away</p>`;
}
let _lastShare = 0;
function shareResponderPosition() {
  if (state.userRole !== 'responder' || !state.userCoords || Date.now() - _lastShare < 15000) return;
  const mine = myActiveResponseIncidents(INCIDENTS);
  if (!mine.length) return;
  _lastShare = Date.now();
  mine.forEach(inc => {
    inc.responderLat = state.userCoords.lat; inc.responderLng = state.userCoords.lng; inc.responderAt = Date.now();
    api.updateIncident(inc.id, { responderLat: inc.responderLat, responderLng: inc.responderLng, responderAt: inc.responderAt }).catch(() => {});
  });
}
function myActiveResponseIncidents(list) {
  const me = String(state.user?.email || '').toLowerCase();
  return (list || []).filter(i => i.acknowledged && String(i.acknowledgedBy || '').toLowerCase() === me && !['Resolved', 'False Alarm'].includes(i.status));
}
function refreshLiveWidgets() {
  const el = document.getElementById('live-status'); if (el) el.textContent = liveStatusText();
  document.querySelectorAll('[data-keep-map]').forEach(m => {
    try { if (m._smMap) { if (m.dataset.keepMap === 'route') updateRouteMap(m); else updateProMap(m); } } catch {}
  });
}
function updateProMap(el) {
  const map = el._smMap, ly = el._smLayers, c = state.userCoords;
  if (!c) { if (el._smFresh) { map.setView([-28.5, 24.7], 5); } return; }
  const ll = [c.lat, c.lng];
  if (!ly.ring) {
    ly.ring = L.circle(ll, { radius: c.acc || 30, color: '#3b82f6', weight: 1, fillOpacity: .12, interactive: false }).addTo(map);
    ly.dot = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="live-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
  } else { ly.ring.setLatLng(ll); ly.ring.setRadius(c.acc || 30); ly.dot.setLatLng(ll); }
  if (el._smFresh || liveWatchId !== null) { map.setView(ll, Math.max(map.getZoom(), 15), { animate: false }); el._smFresh = false; }
}

/* ============================================================
   PROFESSIONAL: SOS TAB
   ============================================================ */
function renderProSOS() {
  const myActive = INCIDENTS.find(i => incidentBelongsToMe(i) && i.status !== 'Resolved' && i.status !== 'False Alarm' && !i.hiddenFromOwner && !i.isDuress);
  if (myActive) {
    const inc = myActive;
    const [incLat, incLng] = incidentCoords(inc);
    return `<div class="p-4 space-y-4 pb-6">
      <div class="bg-red-950/40 border border-red-800/50 rounded-xl p-3 flex items-center gap-3" role="alert">
        <div class="w-10 h-10 rounded-full bg-red-600/30 flex items-center justify-center animate-pulse text-lg">🚨</div>
        <div class="flex-1"><p class="text-sm font-bold text-red-400">EMERGENCY ACTIVE</p><p class="text-xs text-slate-400">${esc(inc.category)} · ${esc(safeStatus(inc.status))}</p></div>
      </div>
      <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-2">
        <p class="text-xs uppercase text-slate-500 font-semibold">Responder Status</p>
        ${inc.acknowledged ? `<p class="text-sm text-emerald-400 font-bold">✓ Acknowledged by ${esc(inc.acknowledgedByOrg || 'responder')}</p>` : '<p class="text-sm text-amber-400 font-bold">Waiting for acknowledgment…</p>'}
        ${inc.dispatched ? `<p class="text-sm text-blue-400 font-bold">${inc.dispatchUnit === 'On foot' ? '🚶 Responding on foot' : '🚗 Vehicle dispatched'} · ETA ${inc.eta ?? '—'} min</p>` : ''}
        ${responderDistanceLine(inc)}
      </div>
      <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden"><div id="user-mini-map" class="relative h-56 bg-slate-900" data-lat="${incLat}" data-lng="${incLng}" data-rlat="${typeof inc.responderLat === 'number' ? inc.responderLat : ''}" data-rlng="${typeof inc.responderLng === 'number' ? inc.responderLng : ''}"></div></div>
      <div class="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
        <h3 class="text-sm font-bold text-slate-300">Secure Stand-Down</h3>
        <p class="text-xs text-slate-500">Enter your PIN to cancel this alert.</p>
        <div class="flex gap-2">
          <input id="stand-down-pin" type="password" maxlength="6" inputmode="numeric" placeholder="••••" autocomplete="off" class="flex-1 px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-center text-lg tracking-widest"/>
          <button data-action="stand-down" class="px-5 py-3 bg-slate-700 text-white rounded-lg font-bold text-sm">Confirm</button>
        </div>
      </div>
    </div>`;
  }
  return `<div class="p-4 space-y-5 pb-6">
    <div class="text-center space-y-2">
      <h2 class="text-xl font-bold text-white">Emergency SOS</h2>
      <p class="text-xs text-slate-400">Health professionals can be in danger too. Responders in your area are alerted instantly and see you as a verified health professional.</p>
      ${locationChip()}
    </div>
    ${pinsBanner()}
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
      <div class="flex items-center justify-center gap-2 text-emerald-400"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span class="text-xs font-semibold">Ready — press &amp; hold SOS in an emergency</span></div>
      <div class="flex flex-col items-center">
        <button id="sos-btn" data-action="start-sos" class="sos-btn" aria-label="Emergency SOS — press and hold">
          <svg class="text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
          <span class="text-white font-black sos-text tracking-wider">SOS</span>
          <span class="text-red-200 sos-sub mt-1">${state.countdown > 0 ? `Sending in ${state.countdown}...` : 'Press & Hold'}</span>
        </button>
      </div>
      <button data-action="silent-sos" class="w-full py-3 bg-slate-800 text-slate-200 rounded-xl font-bold text-xs">Silent SOS</button>
      <p class="text-[11px] text-slate-500 text-center">Cancel with your stand-down PIN. Use your duress PIN if someone forces you to cancel.</p>
    </div>
  </div>`;
}


/* ============================================================
   RESPONDER ROUTE MAP  (distance + direction to the user after you acknowledge)
   ============================================================ */
const routeCache = {};
function bearingDeg(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180, y = Math.sin((lng2 - lng1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function compassName(b) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(b / 45) % 8]; }
function fmtDist(km) { return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km'; }
function stepText(st) {
  const m = st.maneuver || {}, t = m.type, mod = m.modifier || '';
  let verb = 'Continue';
  if (t === 'depart') verb = 'Head ' + compassName(m.bearing_after || 0);
  else if (t === 'arrive') verb = 'Arrive at the user';
  else if (t === 'roundabout' || t === 'rotary') verb = 'Take the roundabout';
  else if (mod && mod !== 'straight') verb = 'Turn ' + mod;
  return `${verb}${st.name ? ' onto ' + st.name : ''} · ${fmtDist((st.distance || 0) / 1000)}`;
}
function renderRouteBlock(inc) {
  const me = state.userCoords, [ilat, ilng] = incidentCoords(inc);
  const walking = inc.dispatchUnit === 'On foot';
  const nav = `https://www.google.com/maps/dir/?api=1&destination=${ilat},${ilng}&travelmode=${walking ? 'walking' : 'driving'}`;
  if (!me) {
    return `<div class="rounded-xl border border-blue-800/50 bg-blue-950/20 p-3 space-y-2">
      <p class="text-xs text-blue-200">📍 Share your location to see your distance and the route to the user.</p>
      <div class="flex gap-2"><button data-action="retry-gps" class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Share my location</button>
      <a href="${nav}" target="_blank" rel="noopener" class="px-3 py-2 bg-slate-800 text-blue-300 rounded-lg text-xs font-bold">Navigate ↗</a></div></div>`;
  }
  const rc = routeCache[inc.id], straight = haversineKm(me.lat, me.lng, ilat, ilng);
  const dist = rc && rc.distKm != null ? rc.distKm : straight;
  const mins = rc && rc.durMin != null ? rc.durMin : Math.max(1, Math.round(straight / (walking ? 5 : 40) * 60));
  const dir = compassName(bearingDeg(me.lat, me.lng, ilat, ilng));
  const road = !!(rc && rc.road);
  return `<div class="rounded-xl border border-blue-800/50 bg-blue-950/20 overflow-hidden">
    <div class="p-3 flex items-center justify-between gap-2 flex-wrap">
      <div>
        <p class="text-[10px] uppercase text-blue-300 font-bold">Route to the user</p>
        <p class="text-sm font-bold text-white">${fmtDist(dist)} away · ~${mins} min ${walking ? 'on foot' : 'by vehicle'}</p>
        <p class="text-[11px] text-slate-400">Head <b class="text-blue-300">${dir}</b> · ${road ? 'road route' : 'straight-line distance'}${rc && rc.pending ? ' · finding route…' : ''}</p>
      </div>
      <a href="${nav}" target="_blank" rel="noopener" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Navigate ↗</a>
    </div>
    <div id="route-map-${inc.id}" data-keep-map="route" data-inc="${inc.id}" class="keep-map h-56 w-full"></div>
    ${rc && rc.steps && rc.steps.length ? `<ol class="p-3 space-y-1 text-[11px] text-slate-300 list-decimal list-inside">${rc.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
  </div>`;
}
async function fetchRoute(inc) {
  const me = state.userCoords; if (!me) return;
  const [ilat, ilng] = incidentCoords(inc);
  const walking = inc.dispatchUnit === 'On foot';
  const c = routeCache[inc.id];
  if (c) {
    if (c.pending) return;
    if (c.failedAt && Date.now() - c.failedAt < 60000) return;
    if (c.fromLat !== undefined && Date.now() - c.at < 30000 && haversineKm(c.fromLat, c.fromLng, me.lat, me.lng) < 0.05) return;
  }
  routeCache[inc.id] = { ...(c || {}), pending: true };
  const path = `${me.lng},${me.lat};${ilng},${ilat}?overview=full&geometries=geojson&steps=true`;
  const urls = walking
    ? [`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${path}`, `https://router.project-osrm.org/route/v1/driving/${path}`]
    : [`https://router.project-osrm.org/route/v1/driving/${path}`, `https://routing.openstreetmap.de/routed-car/route/v1/driving/${path}`];
  for (const u of urls) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(u, { signal: ctl.signal }); clearTimeout(tm);
      if (!r.ok) continue;
      const j = await r.json(); const rt = j.routes && j.routes[0]; if (!rt) continue;
      const km = rt.distance / 1000;
      routeCache[inc.id] = {
        at: Date.now(), fromLat: me.lat, fromLng: me.lng, distKm: km, road: true,
        durMin: walking ? Math.max(1, Math.round(km / 5 * 60)) : Math.max(1, Math.round(rt.duration / 60)),
        coords: rt.geometry.coordinates.map(p => [p[1], p[0]]),
        steps: ((rt.legs && rt.legs[0] && rt.legs[0].steps) || []).slice(0, 4).map(stepText),
      };
      safeRender();
      return;
    } catch {}
  }
  routeCache[inc.id] = { ...(c || {}), pending: false, failedAt: Date.now(), at: Date.now(), fromLat: me.lat, fromLng: me.lng };
  safeRender();
}
function updateRouteMap(el) {
  const id = Number(el.dataset.inc), inc = getIncidentById(id); if (!inc) return;
  const map = el._smMap, ly = el._smLayers, [ilat, ilng] = incidentCoords(inc), me = state.userCoords;
  const vIcon = L.divIcon({ className: '', html: '<div class="sm-pin-wrap"><div class="sm-pin pending">!</div></div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  if (!ly.victim) ly.victim = L.marker([ilat, ilng], { icon: vIcon }).addTo(map).bindPopup(esc(inc.user) + ' needs help'); else ly.victim.setLatLng([ilat, ilng]);
  let pts = [[ilat, ilng]];
  if (me) {
    const ll = [me.lat, me.lng];
    if (!ly.me) ly.me = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="live-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), zIndexOffset: 900 }).addTo(map).bindPopup('You'); else ly.me.setLatLng(ll);
    const rc = routeCache[id], real = !!(rc && rc.coords && rc.coords.length);
    const coords = real ? rc.coords : [ll, [ilat, ilng]];
    if (ly.line) { try { map.removeLayer(ly.line); } catch {} }
    ly.line = L.polyline(coords, { color: '#3b82f6', weight: 5, opacity: .9, dashArray: real ? null : '8 8' }).addTo(map);
    pts = real ? coords.concat([ll]) : [ll, [ilat, ilng]];
    fetchRoute(inc);
  }
  const sig = (me ? me.lat.toFixed(3) + me.lng.toFixed(3) : 'x') + ((routeCache[id] && routeCache[id].coords) ? routeCache[id].coords.length : 0);
  if (el._smFresh || el._smSig !== sig) {
    try { map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 16, animate: false }); } catch {}
    el._smSig = sig; el._smFresh = false;
  }
}

/* Maps that must survive the 3-second re-render (they are moved back into the new DOM) */
const keptMaps = new Set();
function initKeepMaps() {
  if (typeof L === 'undefined') return;
  document.querySelectorAll('[data-keep-map]').forEach(el => {
    try {
      if (!el._smMap) {
        el._smMap = L.map(el, { zoomControl: true, attributionControl: true, center: [-28.5, 24.7], zoom: 6, scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(el._smMap);
        el._smLayers = {}; el._smFresh = true; keptMaps.add(el);
      }
      if (el.dataset.keepMap === 'route') updateRouteMap(el); else updateProMap(el);
      setTimeout(() => { try { el._smMap.invalidateSize(); } catch {} }, 60);
    } catch (e) { console.warn('keep map', e); }
  });
  keptMaps.forEach(el => { if (!document.body.contains(el)) { try { el._smMap.remove(); } catch {} keptMaps.delete(el); } });
}
function snapshotForm() {
  const snap = {};
  document.querySelectorAll('#app input[id], #app textarea[id], #app select[id]').forEach(el => {
    if (['file', 'checkbox', 'radio', 'hidden'].includes(el.type)) return;
    if (el.value !== '') snap[el.id] = el.value;
  });
  return snap;
}
function restoreForm(snap) {
  Object.keys(snap).forEach(id => {
    const el = document.getElementById(id); if (!el || el.value === snap[id]) return;
    if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === snap[id])) return;
    try { el.value = snap[id]; } catch {}
  });
}
function centerNavActive(prevScroll) {
  const nb = document.querySelector('.nav-bar'); if (!nb || document.documentElement.dataset.device === 'laptop') return;
  if (typeof prevScroll === 'number') nb.scrollLeft = prevScroll;
  const a = nb.querySelector('.nav-item.active'); if (!a || nb.scrollWidth <= nb.clientWidth) return;
  if (a.offsetLeft < nb.scrollLeft || a.offsetLeft + a.offsetWidth > nb.scrollLeft + nb.clientWidth) nb.scrollLeft = a.offsetLeft - (nb.clientWidth - a.offsetWidth) / 2;
}
(function () {
  const _sr3 = safeRender;
  safeRender = function () {
    const keep = {};
    document.querySelectorAll('[data-keep-map]').forEach(el => { if (el.id) keep[el.id] = el; });
    const nb0 = document.querySelector('.nav-bar'), navScroll = nb0 ? nb0.scrollLeft : undefined;
    const snap = snapshotForm();
    _sr3.apply(this, arguments);
    restoreForm(snap);
    Object.keys(keep).forEach(id => {
      const ph = document.getElementById(id);
      if (ph && ph !== keep[id]) ph.replaceWith(keep[id]);
    });
    initKeepMaps();
    centerNavActive(navScroll);
  };
})();

/* ============================================================
   BOOT
   ============================================================ */
registerServiceWorker();
render();
