(() => {
  // ---------- Config ----------
  const SUPABASE_URL = "https://tkarylpzztjwgrphbwun.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrYXJ5bHB6enRqd2dycGhid3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTYyNDgsImV4cCI6MjA5MjA5MjI0OH0.R_devzEAhz6Y4XU1KDwrmG5GAZQnVhZ8pi2ELBjrr9s";
  const STORAGE_BUCKET = "chat-images";
  // Fix 2 (2025-04-22) — default avatar. Users who never upload a profile
  // picture (or whose avatar_url is blank in the DB) render this instead
  // of a hidden / blank image. Also written to the DB on onboarding save
  // and on first login for accounts with no avatar, so downstream queries
  // never see a NULL avatar_url.
  const DEFAULT_AVATAR_URL = "emptyprofile.png";
  const resolveAvatarUrl = (url) => {
    const s = (url == null ? "" : String(url)).trim();
    return s ? s : DEFAULT_AVATAR_URL;
  };
  const SUPPORT_URL = "https://discord.gg/dFv2tYRNH8/dFv2tYRNH8/";
  const RESTRICTION_KEY = "chat_restriction_until";
  const RESTRICTION_MS = 5 * 60 * 60 * 1000;
  const REVEAL_MAX = 56;
  const REVEAL_THRESHOLD = 6;
  const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "🔥"];
  const FULL_EMOJIS = [
    "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💖","💕","💔","💯","💢",
    "👍","👎","👏","🙌","🙏","🤝","💪","🫡","👀","✨","⭐","🌟","🎉","🎊",
    "🔥","💧","🌈","☀️","🌙","⚡","❄️","🍀","🌹","🎁","🏆","🥇","🎵","📌",
    "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰",
    "😍","🤩","😘","😗","☺️","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑",
    "🤗","🤭","🫢","🫣","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😏",
    "😒","🙄","😬","😮\u200d💨","🤥","🫨","😌","😔","😪","🤤","😴","😷","🤒","🤕",
    "🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐",
    "😕","🫤","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰",
    "😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠",
    "🤬","😈","👿","💀","☠️","💩","🤡","👻","👽","👾","🤖","🎃","😺","😸",
    "🐶","🐱","🦄","🐙","🦋","🌸","🌼","🍎","🍕","🍔","🍩","🍰","☕","🍺"
  ];

  // ---------- "Remember Me" storage bridge ----------
  // Supabase's default storage adapter is localStorage, which persists
  // across browser restarts. When the user unchecks "Remember me" at
  // signin, we demote the auth token to sessionStorage on tab close
  // (see the pagehide handler below). On the NEXT page load we copy it
  // back into localStorage BEFORE createClient runs, so Supabase can
  // still read it for same-tab refreshes. If the user closed the tab
  // entirely, sessionStorage is empty and the user is signed out on
  // next visit — which is exactly what "don't remember me" means.
  const REMEMBER_ME_KEY = "relay-remember-me";
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token") && !localStorage.getItem(k)) {
        localStorage.setItem(k, sessionStorage.getItem(k));
      }
    }
  } catch(_) {}

  const { createClient } = window.supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 10 } }
  });

  // Matching pagehide half of the Remember Me bridge: if the user opted
  // OUT, move the Supabase auth token from localStorage to sessionStorage
  // so it survives an in-tab refresh but NOT a tab close / browser
  // restart. pagehide fires reliably on close, navigation, and refresh.
  window.addEventListener("pagehide", () => {
    try {
      if (localStorage.getItem(REMEMBER_ME_KEY) !== "false") return;
      const toMove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) toMove.push(k);
      }
      for (const k of toMove) {
        const v = localStorage.getItem(k);
        if (v != null) sessionStorage.setItem(k, v);
        localStorage.removeItem(k);
      }
    } catch(_) {}
  });

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const loginEl = $("login"), loginBtn = $("login-btn"), loginLabel = $("login-label"), loginErr = $("login-err");
  const authForm = $("auth-form"), authEmail = $("auth-email"), authPassword = $("auth-password"), authSubmit = $("auth-submit");
  const authTermsAgree = $("auth-terms-agree"), authTermsErr = $("auth-terms-err");
  const authTitle = $("auth-title"), authSub = $("auth-sub"), authInfo = $("auth-info");
  const authTabs = document.querySelectorAll(".auth-tab");
  const authSupportLink = $("auth-support-link");
  const onboardingEl = $("onboarding");
  const obProgress = $("ob-progress"), obStepLabel = $("ob-step-label"), obBack = $("ob-back"), obNext = $("ob-next"), obSkip = $("ob-skip"), obErr = $("ob-err");
  const obAvatarPreview = $("ob-avatar-preview"), obAvatarPick = $("ob-avatar-pick"), obAvatarInput = $("ob-avatar-input");
  const obUsername = $("ob-username"), obBio = $("ob-bio"), obPronouns = $("ob-pronouns"), obRegion = $("ob-region");
  const obPassword = $("ob-password"), obPasswordConfirm = $("ob-password-confirm");
  const obPasswordToggle = $("ob-password-toggle"), obPasswordConfirmToggle = $("ob-password-confirm-toggle");
  const obPasswordGenerate = $("ob-password-generate");
  const obPasswordChecklist = $("ob-password-checklist");
  const obPasswordStrengthFill = $("ob-password-strength-fill");
  const obPasswordStrengthLabel = $("ob-password-strength-label");
  const obNewsletter = $("ob-newsletter");
  const authRemember = $("auth-remember");
  const obSteps = document.querySelectorAll("#onboarding .ob-step");
  const chatEl = $("chat");
  const meBtn = $("me-btn"), meAvatar = $("me-avatar"), meName = $("me-name");
  const messagesEl = $("messages");
  const inputEl = $("input"), sendBtn = $("send"), uploadBtn = $("upload-btn"), fileInput = $("file-input");
  const mentionBox = $("mention-box");
  const previewEl = $("preview"), previewImg = $("preview-img"), previewRm = $("preview-rm");
  const profileBackdrop = $("profile-backdrop");
  const profileAvatar = $("profile-avatar"), profileName = $("profile-name"), profileSub = $("profile-sub");
  const profileBanner = $("profile-banner");
  const profileBio = $("profile-bio");
  const profileSince = $("profile-since"), profileUid = null;
  const profileBioSection = $("profile-bio-section"), profileLinkedSection = $("profile-linked-section");
  const profileClose = $("profile-close"), profileLogout = $("profile-logout"), profileEdit = $("profile-edit");
  const profileMenuBtn = $("profile-menu-btn"), profileMenu = $("profile-menu"), profileMenuReport = $("profile-menu-report");
  const profileDiscord = $("profile-discord"), profileDiscordStatus = $("profile-discord-status");
  const profileDiscordLink = $("profile-discord-link");
  const profileDiscordErr = $("profile-discord-err");
  const editBackdrop = $("edit-backdrop");
  const editAvatarPreview = $("edit-avatar-preview"), editAvatarPick = $("edit-avatar-pick"), editAvatarInput = $("edit-avatar-input");
  const editUsername = $("edit-username"), editUsernameHint = $("edit-username-hint");
  const editBio = $("edit-bio"), editPronouns = $("edit-pronouns"), editRegion = $("edit-region");
  const editBannerColor = $("edit-banner-color"), editBannerColorText = $("edit-banner-color-text"), editBannerReset = $("edit-banner-reset");
  const editErr = $("edit-err"), editCancel = $("edit-cancel"), editSave = $("edit-save");
  const restrictionEl = $("restriction"), restrictionText = $("restriction-text"), supportLink = $("support-link");
  const toastsEl = $("toasts");
  const replyPreview = $("reply-preview"), rpName = $("rp-name"), rpText = $("rp-text"), rpClose = $("rp-close");
  const ctxMenu = $("ctx-menu");
  const drawerEl = $("drawer");
  const reactionPicker = $("reaction-picker");
  const imageViewer = $("image-viewer"), ivImg = $("iv-img"), ivClose = $("iv-close");

  supportLink.href = SUPPORT_URL;
  if (authSupportLink) authSupportLink.href = SUPPORT_URL;

  // ---------- Regions (predefined dropdown, global coverage) ----------
  // Mapping from region display name -> flag emoji. "Other" has no flag.
  // Non-country entries (Hong Kong, Macau, Puerto Rico, Palestine, Taiwan)
  // are included where commonly expected. Missing entries simply render
  // without a flag, which is a clean visual fallback.
  const REGION_FLAGS = {
    "Afghanistan":"🇦🇫","Albania":"🇦🇱","Algeria":"🇩🇿","Andorra":"🇦🇩","Angola":"🇦🇴","Argentina":"🇦🇷","Armenia":"🇦🇲","Australia":"🇦🇺","Austria":"🇦🇹","Azerbaijan":"🇦🇿",
    "Bahamas":"🇧🇸","Bahrain":"🇧🇭","Bangladesh":"🇧🇩","Barbados":"🇧🇧","Belarus":"🇧🇾","Belgium":"🇧🇪","Belize":"🇧🇿","Benin":"🇧🇯","Bhutan":"🇧🇹","Bolivia":"🇧🇴",
    "Bosnia and Herzegovina":"🇧🇦","Botswana":"🇧🇼","Brazil":"🇧🇷","Brunei":"🇧🇳","Bulgaria":"🇧🇬","Burkina Faso":"🇧🇫","Burundi":"🇧🇮",
    "Cambodia":"🇰🇭","Cameroon":"🇨🇲","Canada":"🇨🇦","Cape Verde":"🇨🇻","Central African Republic":"🇨🇫","Chad":"🇹🇩","Chile":"🇨🇱","China":"🇨🇳","Colombia":"🇨🇴","Comoros":"🇰🇲",
    "Congo (Brazzaville)":"🇨🇬","Congo (Kinshasa)":"🇨🇩","Costa Rica":"🇨🇷","Côte d'Ivoire":"🇨🇮","Croatia":"🇭🇷","Cuba":"🇨🇺","Cyprus":"🇨🇾","Czechia":"🇨🇿",
    "Denmark":"🇩🇰","Djibouti":"🇩🇯","Dominica":"🇩🇲","Dominican Republic":"🇩🇴",
    "Ecuador":"🇪🇨","Egypt":"🇪🇬","El Salvador":"🇸🇻","Equatorial Guinea":"🇬🇶","Eritrea":"🇪🇷","Estonia":"🇪🇪","Eswatini":"🇸🇿","Ethiopia":"🇪🇹",
    "Fiji":"🇫🇯","Finland":"🇫🇮","France":"🇫🇷","Gabon":"🇬🇦","Gambia":"🇬🇲","Georgia":"🇬🇪","Germany":"🇩🇪","Ghana":"🇬🇭","Greece":"🇬🇷","Grenada":"🇬🇩","Guatemala":"🇬🇹","Guinea":"🇬🇳","Guinea-Bissau":"🇬🇼","Guyana":"🇬🇾",
    "Haiti":"🇭🇹","Honduras":"🇭🇳","Hong Kong":"🇭🇰","Hungary":"🇭🇺",
    "Iceland":"🇮🇸","India":"🇮🇳","Indonesia":"🇮🇩","Iran":"🇮🇷","Iraq":"🇮🇶","Ireland":"🇮🇪","Israel":"🇮🇱","Italy":"🇮🇹","Jamaica":"🇯🇲","Japan":"🇯🇵","Jordan":"🇯🇴",
    "Kazakhstan":"🇰🇿","Kenya":"🇰🇪","Kiribati":"🇰🇮","Kosovo":"🇽🇰","Kuwait":"🇰🇼","Kyrgyzstan":"🇰🇬",
    "Laos":"🇱🇦","Latvia":"🇱🇻","Lebanon":"🇱🇧","Lesotho":"🇱🇸","Liberia":"🇱🇷","Libya":"🇱🇾","Liechtenstein":"🇱🇮","Lithuania":"🇱🇹","Luxembourg":"🇱🇺",
    "Macau":"🇲🇴","Madagascar":"🇲🇬","Malawi":"🇲🇼","Malaysia":"🇲🇾","Maldives":"🇲🇻","Mali":"🇲🇱","Malta":"🇲🇹","Marshall Islands":"🇲🇭","Mauritania":"🇲🇷","Mauritius":"🇲🇺","Mexico":"🇲🇽","Micronesia":"🇫🇲","Moldova":"🇲🇩","Monaco":"🇲🇨","Mongolia":"🇲🇳","Montenegro":"🇲🇪","Morocco":"🇲🇦","Mozambique":"🇲🇿","Myanmar":"🇲🇲",
    "Namibia":"🇳🇦","Nauru":"🇳🇷","Nepal":"🇳🇵","Netherlands":"🇳🇱","New Zealand":"🇳🇿","Nicaragua":"🇳🇮","Niger":"🇳🇪","Nigeria":"🇳🇬","North Korea":"🇰🇵","North Macedonia":"🇲🇰","Norway":"🇳🇴",
    "Oman":"🇴🇲","Pakistan":"🇵🇰","Palau":"🇵🇼","Palestine":"🇵🇸","Panama":"🇵🇦","Papua New Guinea":"🇵🇬","Paraguay":"🇵🇾","Peru":"🇵🇪","Philippines":"🇵🇭","Poland":"🇵🇱","Portugal":"🇵🇹","Puerto Rico":"🇵🇷","Qatar":"🇶🇦",
    "Romania":"🇷🇴","Russia":"🇷🇺","Rwanda":"🇷🇼",
    "Saint Kitts and Nevis":"🇰🇳","Saint Lucia":"🇱🇨","Saint Vincent and the Grenadines":"🇻🇨","Samoa":"🇼🇸","San Marino":"🇸🇲","São Tomé and Príncipe":"🇸🇹","Saudi Arabia":"🇸🇦","Senegal":"🇸🇳","Serbia":"🇷🇸","Seychelles":"🇸🇨","Sierra Leone":"🇸🇱","Singapore":"🇸🇬","Slovakia":"🇸🇰","Slovenia":"🇸🇮","Solomon Islands":"🇸🇧","Somalia":"🇸🇴","South Africa":"🇿🇦","South Korea":"🇰🇷","South Sudan":"🇸🇸","Spain":"🇪🇸","Sri Lanka":"🇱🇰","Sudan":"🇸🇩","Suriname":"🇸🇷","Sweden":"🇸🇪","Switzerland":"🇨🇭","Syria":"🇸🇾",
    "Taiwan":"🇹🇼","Tajikistan":"🇹🇯","Tanzania":"🇹🇿","Thailand":"🇹🇭","Timor-Leste":"🇹🇱","Togo":"🇹🇬","Tonga":"🇹🇴","Trinidad and Tobago":"🇹🇹","Tunisia":"🇹🇳","Turkey":"🇹🇷","Turkmenistan":"🇹🇲","Tuvalu":"🇹🇻",
    "Uganda":"🇺🇬","Ukraine":"🇺🇦","United Arab Emirates":"🇦🇪","United Kingdom":"🇬🇧","United States":"🇺🇸","Uruguay":"🇺🇾","Uzbekistan":"🇺🇿",
    "Vanuatu":"🇻🇺","Vatican City":"🇻🇦","Venezuela":"🇻🇪","Vietnam":"🇻🇳","Yemen":"🇾🇪","Zambia":"🇿🇲","Zimbabwe":"🇿🇼"
  };
  function regionFlagFor(name) {
    const key = String(name == null ? "" : name).trim();
    if (!key) return "";
    return REGION_FLAGS[key] || "";
  }
  const REGIONS = [
    "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan",
    "Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia",
    "Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi",
    "Cambodia","Cameroon","Canada","Cape Verde","Central African Republic","Chad","Chile","China","Colombia","Comoros",
    "Congo (Brazzaville)","Congo (Kinshasa)","Costa Rica","Côte d'Ivoire","Croatia","Cuba","Cyprus","Czechia",
    "Denmark","Djibouti","Dominica","Dominican Republic",
    "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia",
    "Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana",
    "Haiti","Honduras","Hong Kong","Hungary",
    "Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan",
    "Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan",
    "Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg",
    "Macau","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar",
    "Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway",
    "Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Puerto Rico","Qatar",
    "Romania","Russia","Rwanda",
    "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","São Tomé and Príncipe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria",
    "Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu",
    "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan",
    "Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe","Other"
  ];
  function populateRegionSelect(sel) {
    if (!sel || sel.dataset.populated === "1") return;
    sel.dataset.populated = "1";
    const placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = "Select a region (optional)";
    sel.appendChild(placeholder);
    for (const r of REGIONS) {
      const o = document.createElement("option");
      o.value = r;
      const flag = regionFlagFor(r);
      o.textContent = flag ? (flag + "  " + r) : r;
      sel.appendChild(o);
    }
  }
  populateRegionSelect(obRegion);
  populateRegionSelect(editRegion);

  // Expose reveal-max CSS var
  document.documentElement.style.setProperty("--reveal-max", REVEAL_MAX + "px");

  // ---------- State ----------
  let me = null;
  const messagesById = new Map();
  const rowsById = new Map();
  const reactionsByMsg = new Map();
  const reactionsByKey = new Set();
  const profileCache = new Map(); // user_id -> { first_seen, username, avatar_url }
  let channel = null, reactChannel = null;
  // Typing indicator channels (ephemeral broadcasts, never persisted).
  let publicTypingChannel = null;
  let dmTypingChannel = null;
  let groupTypingChannel = null;
  let lastDateLabel = null, lastSenderId = null;
  let pendingImage = null;
  let restrictionTimer = null;
  let uploading = false;
  let replyTo = null;
  let ctxTargetId = null, drawerTargetId = null, pickerTargetId = null;
  let activeRow = null; // row with visible inline actions on tap
  // Moderation + presence state
  const moderatorIds = new Set();     // user_id -> is moderator
  const bannedIds = new Set();        // user_id -> is banned
  const presenceMap = new Map();      // user_id -> { last_seen: ms, online: boolean }
  let myIsModerator = false;
  let myIsBanned = false;
  function isModeratorId(uid) { return !!uid && moderatorIds.has(uid); }

  // ---------- Utils ----------
  const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function fmtTime(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  function fmtDayLabel(d) {
    const now = new Date();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "Today";
    if (d.toDateString() === yest.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  function fmtDate(d) { return d.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }); }

  // Regex that finds @username tokens (letters/digits/underscore/dot, 2–32 chars).
  const MENTION_RE = /(^|[\s(\[{.,!?;:'"/\\-])@([A-Za-z0-9_.]{2,32})(?=$|[\s)\]}.,!?;:'"/\\-])/g;

  function renderTextWithMentions(container, content) {
    container.textContent = "";
    const text = String(content || "");
    let lastIdx = 0;
    let match;
    MENTION_RE.lastIndex = 0;
    while ((match = MENTION_RE.exec(text)) !== null) {
      const leading = match[1] || "";
      const username = match[2];
      const fullStart = match.index + leading.length;
      if (fullStart > lastIdx) container.appendChild(document.createTextNode(text.slice(lastIdx, fullStart)));
      const span = document.createElement("span");
      span.className = "mention";
      span.textContent = "@" + username;
      span.dataset.username = username;
      span.setAttribute("role", "button");
      span.setAttribute("tabindex", "0");
      span.title = "View @" + username;
      span.addEventListener("click", (e) => { e.stopPropagation(); openProfileByUsername(username); });
      span.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProfileByUsername(username); }
      });
      container.appendChild(span);
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) container.appendChild(document.createTextNode(text.slice(lastIdx)));
  }

  async function openProfileByUsername(username) {
    const clean = String(username || "").trim();
    if (!clean) return;
    try {
      const { data, error } = await sb.from("profiles")
        .select("user_id, username, avatar_url")
        .ilike("username", clean)
        .limit(1);
      if (error) throw error;
      const row = (data && data[0]) || null;
      if (row) {
        openProfileFor({ id: row.user_id, user_id: row.user_id, username: row.username, avatar_url: row.avatar_url });
      } else {
        toast("No user @" + clean, "warn");
      }
    } catch (err) {
      console.error("[Error] Lookup by username failed", err);
    }
  }
  function atBottom(el, threshold = 140) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }
  function scrollToBottom() { requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }); }
  function extractIdentity(user) {
    const md = (user && user.user_metadata) || {};
    const username =
      (md.custom_claims && md.custom_claims.global_name) ||
      md.full_name || md.name || md.user_name || md.preferred_username || md.nickname ||
      (user.email ? user.email.split("@")[0] : "User");
    const avatar_url = md.avatar_url || md.picture || "";
    return { id: user.id, username, avatar_url };
  }
  function snippetFromMessage(m) {
    if (!m) return "";
    if (m.content && m.content.trim()) return m.content;
    if (m.image_url) return "📷 Photo";
    return "Message";
  }

  // ---------- Toasts ----------
  function toast(message, kind = "default", ttl = 2200) {
    const t = document.createElement("div");
    t.className = "toast" + (kind !== "default" ? " " + kind : "");
    t.textContent = message;
    toastsEl.appendChild(t);
    setTimeout(() => { t.classList.add("fade-out"); setTimeout(() => t.remove(), 220); }, ttl);
  }

  // ---------- Sound ----------
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); } catch(_){}
    return audioCtx;
  }
  function playTone({ freq = 660, duration = 0.12, type = "sine", gain = 0.04, freqEnd = null }) {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") { try { ctx.resume(); } catch(_) {} }
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + duration + 0.02);
  }
  const playSent = () => playTone({ freq: 520, freqEnd: 880, duration: 0.14, gain: 0.05 });
  const playReceived = () => playTone({ freq: 420, freqEnd: 560, duration: 0.14, gain: 0.04 });
  ["click","keydown","touchstart"].forEach(ev => {
    window.addEventListener(ev, () => { ensureAudio(); if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); }, { once: true, passive: true });
  });

  // ---------- Devtools protection ----------
  function blocked() { toast("Action blocked", "warn", 1400); }
  document.addEventListener("keydown", (e) => {
    if (e.key === "F12") { e.preventDefault(); blocked(); return; }
    const key = (e.key || "").toUpperCase();
    const isInspector = (e.ctrlKey || e.metaKey) && e.shiftKey && ["I","J","C"].includes(key);
    if (isInspector) { e.preventDefault(); blocked(); return; }
    if ((e.ctrlKey || e.metaKey) && key === "U") { e.preventDefault(); blocked(); }
  });
  // Context menu: if target is a message row, show our custom menu; else block.
  document.addEventListener("contextmenu", (e) => {
    const row = e.target && e.target.closest && e.target.closest(".row[data-id]");
    if (row) {
      e.preventDefault();
      openCtxMenu(row.dataset.id, e.clientX, e.clientY);
    } else {
      e.preventDefault();
      blocked();
    }
  });

  // ---------- Link / spacing detection ----------
  const LINK_REGEXES = [
    /\bhttps?:\/\//i,
    /(^|[^a-z0-9])www\./i,
    /\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|app|dev|co|me|info|biz|tv|link|site|online|shop|store|club|pro|live|fun|ly)\b/i
  ];
  const hasLink = (s) => LINK_REGEXES.some(rx => rx.test(s));
  function hasExcessiveSpacing(s) {
    if (/\s{6,}/.test(s)) return true;
    for (const l of s.split(/\r?\n/)) if (l.length > 0 && /^\s+$/.test(l)) return true;
    return false;
  }

  // ---------- Restriction ----------
  function getRestrictionUntil() {
    const v = parseInt(localStorage.getItem(RESTRICTION_KEY) || "0", 10);
    return Number.isFinite(v) ? v : 0;
  }
  function setRestriction(ms = RESTRICTION_MS) {
    localStorage.setItem(RESTRICTION_KEY, String(Date.now() + ms));
    applyRestrictionUI();
  }
  function clearRestrictionIfExpired() {
    const u = getRestrictionUntil();
    if (u && u <= Date.now()) { localStorage.removeItem(RESTRICTION_KEY); applyRestrictionUI(); }
  }
  function fmtRemaining(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
  function applyRestrictionUI() {
    const until = getRestrictionUntil();
    const active = until > Date.now();
    if (active) {
      restrictionEl.classList.add("open");
      inputEl.disabled = true;
      inputEl.placeholder = "Messaging disabled";
      sendBtn.disabled = true;
      uploadBtn.disabled = true;
      const tick = () => {
        const remaining = getRestrictionUntil() - Date.now();
        if (remaining <= 0) {
          if (restrictionTimer) { clearInterval(restrictionTimer); restrictionTimer = null; }
          clearRestrictionIfExpired(); return;
        }
        restrictionText.textContent = `Messaging disabled for ${fmtRemaining(remaining)} (links not allowed)`;
      };
      tick();
      if (!restrictionTimer) restrictionTimer = setInterval(tick, 1000);
    } else {
      restrictionEl.classList.remove("open");
      inputEl.disabled = false;
      inputEl.placeholder = "Message...";
      uploadBtn.disabled = false;
      updateSendDisabled();
      if (restrictionTimer) { clearInterval(restrictionTimer); restrictionTimer = null; }
    }
  }
  const isRestricted = () => getRestrictionUntil() > Date.now();

  // ---------- Rendering ----------
  function ensurePlaceholderCleared() {
    const p = messagesEl.querySelector(".loading, .empty");
    if (p) p.remove();
  }

  function getOrCreateSegment() {
    // All rows live inside a single .msg-col segment
    let col = messagesEl.querySelector(".msg-col");
    if (!col) {
      col = document.createElement("div");
      col.className = "msg-col";
      messagesEl.appendChild(col);
    }
    return col;
  }

  function buildRow(m) {
    const createdAt = new Date(m.created_at);
    const isMe = me && m.user_id === me.id;

    const row = document.createElement("div");
    row.className = "row " + (isMe ? "me" : "other");
    row.dataset.id = m.id;
    row.dataset.userId = m.user_id;

    if (!isMe) {
      const avBtn = document.createElement("button");
      avBtn.className = "avatar-btn";
      avBtn.type = "button";
      avBtn.setAttribute("aria-label", "Open profile");
      const img = document.createElement("img");
      img.className = "avatar";
      // Fix 2 — fall back to DEFAULT_AVATAR_URL when the row has no
      // avatar_url, and swap to it on load error as well, so the letter
      // placeholder only shows if even the default image fails to load.
      img.alt = ""; img.loading = "lazy"; img.src = resolveAvatarUrl(m.avatar_url);
      let _rowAvatarFallbackTried = false;
      img.onerror = () => {
        if (!_rowAvatarFallbackTried && img.src.indexOf(DEFAULT_AVATAR_URL) === -1) {
          _rowAvatarFallbackTried = true;
          img.src = DEFAULT_AVATAR_URL;
          return;
        }
        console.warn("[Warning] Missing avatar for", m.user_id);
        img.style.display = "none";
        const fb = document.createElement("div");
        fb.className = "avatar";
        Object.assign(fb.style, {
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: "700", color: "#fff", background: "#8e8e93"
        });
        fb.textContent = (m.username || "?").trim().charAt(0).toUpperCase() || "?";
        avBtn.appendChild(fb);
      };
      avBtn.appendChild(img);
      // Moderator badge only on chat rows. Presence dots are reserved for the
      // profile preview per spec — do NOT render them in the chat list.
      if (isModeratorId(m.user_id)) {
        const mb = document.createElement("span");
        mb.className = "mod-badge";
        mb.title = "Moderator";
        mb.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>' +
          '<polyline points="9 12 11 14 15 10"/></svg>';
        avBtn.appendChild(mb);
      }
      avBtn.addEventListener("click", (e) => { e.stopPropagation(); openProfileFor(m); });
      row.appendChild(avBtn);
    }

    const stack = document.createElement("div");
    stack.className = "stack";

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap";

    const hasImage = !!m.image_url;
    const hasText = !!(m.content && m.content.length);
    const bubble = document.createElement("div");
    bubble.className = "bubble" + (hasImage && !hasText ? " image-only" : (hasImage && hasText ? " has-image image-with-caption" : ""));
    bubble.dataset.id = m.id;

    if (m.reply_to_id) {
      const snip = document.createElement("button");
      snip.type = "button";
      snip.className = "reply-snippet";
      const parent = messagesById.get(m.reply_to_id);
      if (parent) {
        snip.innerHTML =
          `<span class="reply-to">${escapeHtml(parent.username || "User")}</span>` +
          `<span class="reply-text">${escapeHtml(snippetFromMessage(parent))}</span>`;
      } else {
        snip.className += " missing";
        snip.innerHTML = `<span class="reply-to">Reply</span><span class="reply-text">Original message unavailable</span>`;
      }
      snip.addEventListener("click", (e) => { e.stopPropagation(); jumpToMessage(m.reply_to_id); });
      bubble.appendChild(snip);
    }

    if (hasImage) {
      const mi = document.createElement("img");
      mi.className = "msg-image";
      mi.alt = ""; mi.loading = "lazy"; mi.src = m.image_url;
      mi.addEventListener("click", (e) => { e.stopPropagation(); openImageViewer(m.image_url); });
      mi.onerror = () => {
        console.warn("[Warning] Broken image", m.image_url);
        const fb = document.createElement("div");
        fb.textContent = "Image failed to load";
        fb.style.cssText = "color:var(--muted);font-size:12px;padding:8px 2px;";
        mi.replaceWith(fb);
      };
      bubble.appendChild(mi);
    }
    if (hasText) {
      const textNode = document.createElement("span");
      textNode.className = "msg-text";
      renderTextWithMentions(textNode, m.content);
      bubble.appendChild(textNode);
    }

    // Double-click → reaction picker
    bubble.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const r = bubble.getBoundingClientRect();
      openReactionPicker(m.id, r.left + r.width / 2, r.top);
    });

    wrap.appendChild(bubble);

    // Inline actions (reply + overflow/3-dot)
    const actions = document.createElement("div");
    actions.className = "inline-actions";

    const replyBtn = document.createElement("button");
    replyBtn.type = "button"; replyBtn.title = "Reply"; replyBtn.setAttribute("aria-label", "Reply");
    replyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v2"/></svg>`;
    replyBtn.addEventListener("click", (e) => { e.stopPropagation(); setReplyTo(m); });

    const moreBtn = document.createElement("button");
    moreBtn.type = "button"; moreBtn.title = "More"; moreBtn.setAttribute("aria-label", "More actions");
    moreBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`;
    moreBtn.addEventListener("click", (e) => { e.stopPropagation(); openDrawerFor(m.id); });

    actions.appendChild(replyBtn);
    actions.appendChild(moreBtn);
    wrap.appendChild(actions);

    stack.appendChild(wrap);

    const reactsEl = document.createElement("div");
    reactsEl.className = "reactions";
    reactsEl.dataset.msgId = m.id;
    stack.appendChild(reactsEl);

    row.appendChild(stack);

    const rowTime = document.createElement("div");
    rowTime.className = "row-time";
    rowTime.textContent = fmtTime(createdAt);
    row.appendChild(rowTime);

    return row;
  }

  function renderMessage(m, { animate = true } = {}) {
    if (rowsById.has(m.id)) {
      console.warn("[Warning] Duplicate prevented", m.id);
      return;
    }
    messagesById.set(m.id, m);
    ensurePlaceholderCleared();

    const col = getOrCreateSegment();

    const createdAt = new Date(m.created_at);
    const dayKey = createdAt.toDateString();
    if (lastDateLabel !== dayKey) {
      const div = document.createElement("div");
      div.className = "day-divider";
      div.innerHTML = `<strong>${escapeHtml(fmtDayLabel(createdAt))}</strong>`;
      col.appendChild(div);
      lastDateLabel = dayKey;
      lastSenderId = null;
    }
    const isMe = me && m.user_id === me.id;
    const showName = m.user_id !== lastSenderId;
    lastSenderId = m.user_id;

    if (showName) {
      const n = document.createElement("div");
      n.className = "name-small" + (isMe ? " me" : "");
      n.textContent = m.username || "User";
      n.role = "button";
      n.tabIndex = 0;
      n.title = "View profile";
      n.addEventListener("click", () => openProfileFor(m));
      n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProfileFor(m); } });
      col.appendChild(n);
    }

    const row = buildRow(m);
    if (!animate) row.style.animation = "none";
    col.appendChild(row);
    rowsById.set(m.id, row);

    renderReactionsFor(m.id);
  }

  function clearMessages() {
    rowsById.clear();
    messagesById.clear();
    reactionsByMsg.clear();
    reactionsByKey.clear();
    lastDateLabel = null;
    lastSenderId = null;
    messagesEl.innerHTML = "";
  }

  async function loadHistory() {
    messagesEl.innerHTML = '<div class="loading">Loading messages…</div>';
    // Moderation + presence loading runs in parallel with message history so the
    // chat still renders even if one of the new tables is missing / unreachable.
    loadModerators().catch(()=>{});
    loadBannedSelf().catch(()=>{});
    startPresenceLoop();
    const [msgsRes, reactsRes] = await Promise.all([
      sb.from("messages").select("*").order("created_at", { ascending: true }).limit(500),
      sb.from("message_reactions").select("*").limit(5000)
    ]);
    clearMessages();
    if (msgsRes.error) {
      console.error("[Error] Load failed", msgsRes.error);
      messagesEl.innerHTML = '<div class="empty">Could not load messages: ' + escapeHtml(msgsRes.error.message) + '</div>';
      return;
    }
    const msgs = msgsRes.data || [];
    for (const m of msgs) messagesById.set(m.id, m);
    if (reactsRes.data) for (const r of reactsRes.data) addReactionToState(r);
    if (msgs.length === 0) {
      messagesEl.innerHTML = '<div class="empty">No messages yet. Say hi!</div>';
      return;
    }
    for (const m of msgs) renderMessage(m, { animate: false });
    // Always show the "add emoji" chip for every rendered row
    for (const id of rowsById.keys()) renderReactionsFor(id);
    scrollToBottom();
  }

  // ---------- Reactions ----------
  function addReactionToState(r) {
    const key = `${r.message_id}|${r.user_id}|${r.emoji}`;
    if (reactionsByKey.has(key)) return false;
    reactionsByKey.add(key);
    let byEmoji = reactionsByMsg.get(r.message_id);
    if (!byEmoji) { byEmoji = new Map(); reactionsByMsg.set(r.message_id, byEmoji); }
    let users = byEmoji.get(r.emoji);
    if (!users) { users = new Set(); byEmoji.set(r.emoji, users); }
    users.add(r.user_id);
    return true;
  }
  function removeReactionFromState(r) {
    const key = `${r.message_id}|${r.user_id}|${r.emoji}`;
    if (!reactionsByKey.has(key)) return false;
    reactionsByKey.delete(key);
    const byEmoji = reactionsByMsg.get(r.message_id);
    if (!byEmoji) return false;
    const users = byEmoji.get(r.emoji);
    if (!users) return false;
    users.delete(r.user_id);
    if (users.size === 0) byEmoji.delete(r.emoji);
    if (byEmoji.size === 0) reactionsByMsg.delete(r.message_id);
    return true;
  }
  function renderReactionsFor(msgId) {
    const row = rowsById.get(msgId);
    if (!row) return;
    const container = row.querySelector(".reactions");
    if (!container) return;
    container.innerHTML = "";
    const byEmoji = reactionsByMsg.get(msgId);
    if (byEmoji && byEmoji.size > 0) {
      for (const [emoji, users] of byEmoji) {
        if (users.size === 0) continue;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "reaction" + (me && users.has(me.id) ? " mine" : "");
        chip.title = Array.from(users).join(", ");
        chip.innerHTML = `<span>${emoji}</span><span class="count">${users.size}</span>`;
        chip.addEventListener("click", (e) => { e.stopPropagation(); toggleReaction(msgId, emoji); });
        container.appendChild(chip);
      }
    }
    // Always append the gray "add emoji" chip
    const add = document.createElement("button");
    add.type = "button";
    add.className = "reaction add-emoji";
    add.setAttribute("aria-label", "Add reaction");
    add.title = "Add reaction";
    add.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M19 3v4M21 5h-4" stroke-linecap="round"/></svg>`;
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = add.getBoundingClientRect();
      openReactionPicker(msgId, r.left + r.width / 2, r.top, { full: true });
    });
    container.appendChild(add);
  }
  // Context for action menus / pickers: 'main' (public chat) or 'dm' (private).
  // Set by the row that opened the picker/menu. toggleReaction + handleAction
  // use this to route to the correct tables + state maps.
  let currentActionMode = "main";
  async function toggleReaction(msgId, emoji) {
    if (currentActionMode === "dm" && typeof toggleDmReaction === "function") {
      return toggleDmReaction(msgId, emoji);
    }
    if (currentActionMode === "group" && typeof toggleGroupReaction === "function") {
      return toggleGroupReaction(msgId, emoji);
    }
    if (!me) return;
    if (!myEmailVerified) { toast("Verify your email to react", "warn"); updateVerifyBanner(); return; }
    const key = `${msgId}|${me.id}|${emoji}`;
    const had = reactionsByKey.has(key);
    if (had) {
      const ok = removeReactionFromState({ message_id: msgId, user_id: me.id, emoji });
      if (ok) renderReactionsFor(msgId);
      const { error } = await sb.from("message_reactions")
        .delete().eq("message_id", msgId).eq("user_id", me.id).eq("emoji", emoji);
      if (error) {
        console.error("[Error] Remove reaction failed", error);
        toast("Could not remove reaction", "error");
        addReactionToState({ message_id: msgId, user_id: me.id, emoji });
        renderReactionsFor(msgId);
      }
    } else {
      const ok = addReactionToState({ message_id: msgId, user_id: me.id, emoji });
      if (!ok) { console.warn("[Warning] Duplicate reaction prevented"); return; }
      renderReactionsFor(msgId);
      const { error } = await sb.from("message_reactions").insert({ message_id: msgId, user_id: me.id, emoji });
      if (error && !/duplicate key|conflict|23505/i.test(error.message || "")) {
        console.error("[Error] Add reaction failed", error);
        toast("Could not add reaction", "error");
        removeReactionFromState({ message_id: msgId, user_id: me.id, emoji });
        renderReactionsFor(msgId);
      }
    }
  }

  // ---------- Emoji categories (iPhone-style full picker) ----------
  const EMOJI_CATEGORIES = [
    { id: "smileys", label: "Smileys", tab: "😀", emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😋","😛","😜","🤪","😝","🤗","🤔","🤐","😐","😒","🙄","😏","😌","😴","😪","😮","🥵","🥶","🤯","🥳","😎","🤓","🧐","😕","😟","🙁","😮","😲","🥺","😢","😭","😱","😓","😩","😫","😤","😡","😠","🤬","😈","👿","💀","💩","🤡","👻","👽","👾","🤖"] },
    { id: "people", label: "People", tab: "👋", emojis: ["👋","🤚","✋","🖖","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","👊","✊","👏","🙌","👐","🤲","🤝","🙏","💪","🦾","👂","👃","👀","👅","👄","👶","🧒","👦","👧","🧑","👨","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🙇","🤦","🤷"] },
    { id: "animals", label: "Animals", tab: "🐶", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐢","🐍","🦎","🐙","🦑","🦐","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐆","🦓","🦒","🐘","🦏","🐪","🦙","🐄","🐮","🐎","🐖","🐑","🐐","🦌","🐕","🐈","🐇","🐁","🦔"] },
    { id: "food", label: "Food", tab: "🍎", emojis: ["🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥒","🌶️","🌽","🥕","🥔","🍞","🥖","🧀","🥚","🍳","🥞","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🥪","🌮","🌯","🥗","🍝","🍜","🍣","🍱","🍤","🍙","🍚","🍘","🍧","🍨","🍦","🧁","🍰","🎂","🍭","🍬","🍫","🍿","🍩","🍪","🍯","🥛","☕","🍵","🥤","🍶","🍺","🍻","🍷","🥃","🍸","🍹"] },
    { id: "activities", label: "Activities", tab: "⚽", emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🏑","🥍","🏏","⛳","🏹","🎣","🥊","🥋","🎽","⛸️","🎿","🏂","🪂","🏋️","🤼","🤸","🤺","🤾","🏌️","🏇","🧘","🏄","🏊","🚴","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🎲","🎯","🎳","🎮"] },
    { id: "travel", label: "Travel", tab: "🚗", emojis: ["🚗","🚕","🚙","🚌","🏎️","🚓","🚑","🚒","🚜","🛵","🏍️","🚲","🛴","🚂","🚆","🚇","🚊","✈️","🛫","🛬","🚁","🛸","🚀","⛵","🚤","🛳️","🚢","⚓","⛽","🚧","🗺️","🗽","🏰","🎡","🎢","🎠","⛲","🏖️","🏝️","🌋","⛰️","🏕️","⛺","🏠","🏡","🏛️","⛪","🕌"] },
    { id: "objects", label: "Objects", tab: "💡", emojis: ["💡","🔦","🕯️","💸","💵","💰","💳","💎","🔧","🔨","🛠️","🔩","⚙️","🧲","💣","🔪","🛡️","⚗️","🔭","🔬","💊","💉","🧬","🌡️","🧹","🚪","🛏️","🧸","🎁","🎈","🎀","🎊","🎉","✉️","📧","💌","📦","📜","📄","📊","📈","📅","📋","📁","📎","📐","✂️","📝","✏️","🔍","🔒"] },
    { id: "symbols", label: "Symbols", tab: "❤️", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💯","💢","💥","💫","💦","💨","💬","💭","✨","⭐","🌟","🌠","🌈","☀️","☁️","⛅","🌧️","❄️","☃️","⚡","🔥","✅","❌","⭕","❗","❓","⚠️","🔔","🎵","🎶","♻️","🔟"] },
    { id: "flags", label: "Flags", tab: "🏳️", emojis: ["🏳️","🏴","🏁","🚩","🎌","🏳️\u200d🌈","🏴\u200d☠️"] }
  ];
  let lastEmojiCategory = "smileys";

  // ---------- Reaction picker ----------
  function openReactionPicker(msgId, cx, cy, { full = false } = {}) {
    pickerTargetId = msgId;
    reactionPicker.innerHTML = "";
    reactionPicker.classList.toggle("full", !!full);
    if (full) {
      // Category tab row
      const cats = document.createElement("div");
      cats.className = "cats";
      const grid = document.createElement("div");
      grid.className = "grid";
      const renderGrid = (catId) => {
        lastEmojiCategory = catId;
        const cat = EMOJI_CATEGORIES.find(c => c.id === catId) || EMOJI_CATEGORIES[0];
        grid.innerHTML = "";
        for (const e of cat.emojis) {
          const b = document.createElement("button");
          b.type = "button"; b.textContent = e;
          b.addEventListener("click", () => {
            if (pickerTargetId) toggleReaction(pickerTargetId, e);
            closeReactionPicker();
          });
          grid.appendChild(b);
        }
        cats.querySelectorAll(".cat-btn").forEach(el => {
          el.classList.toggle("active", el.dataset.cat === catId);
        });
      };
      for (const cat of EMOJI_CATEGORIES) {
        const cb = document.createElement("button");
        cb.type = "button";
        cb.className = "cat-btn";
        cb.dataset.cat = cat.id;
        cb.textContent = cat.tab;
        cb.title = cat.label;
        cb.setAttribute("aria-label", cat.label);
        cb.addEventListener("click", (ev) => {
          ev.stopPropagation();
          renderGrid(cat.id);
        });
        cats.appendChild(cb);
      }
      reactionPicker.appendChild(cats);
      reactionPicker.appendChild(grid);
      const initial = EMOJI_CATEGORIES.find(c => c.id === lastEmojiCategory) ? lastEmojiCategory : "smileys";
      renderGrid(initial);
    } else {
      for (const e of QUICK_EMOJIS) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = e;
        b.addEventListener("click", () => {
          if (pickerTargetId) toggleReaction(pickerTargetId, e);
          closeReactionPicker();
        });
        reactionPicker.appendChild(b);
      }
      // Trailing 3-line icon → opens full picker for the same message
      const more = document.createElement("button");
      more.type = "button";
      more.className = "more";
      more.setAttribute("aria-label", "More emojis");
      more.title = "More emojis";
      more.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
      more.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = pickerTargetId;
        const r = reactionPicker.getBoundingClientRect();
        closeReactionPicker();
        if (id) openReactionPicker(id, r.left + r.width / 2, r.top + r.height / 2, { full: true });
      });
      reactionPicker.appendChild(more);
    }
    reactionPicker.style.visibility = "hidden";
    reactionPicker.classList.add("open");
    const rect = reactionPicker.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = cx - rect.width / 2;
    let y = cy - rect.height - 10;
    if (y < 8) y = cy + 20;
    x = Math.max(8, Math.min(vw - rect.width - 8, x));
    y = Math.max(8, Math.min(vh - rect.height - 8, y));
    reactionPicker.style.left = x + "px";
    reactionPicker.style.top = y + "px";
    reactionPicker.style.visibility = "";
  }
  function closeReactionPicker() {
    reactionPicker.classList.remove("open");
    reactionPicker.classList.remove("full");
    pickerTargetId = null;
    currentActionMode = "main";
  }

  // Toggle visibility of image-only action buttons based on target message.
  function applyImageOnlyActions(container, msg) {
    if (!container) return;
    const isImg = !!(msg && msg.image_url);
    const nodes = container.querySelectorAll("[data-image-only]");
    for (const node of nodes) node.hidden = !isImg;
    // Moderator-only actions. For non-moderators these nodes are already
    // removed from the DOM on sign-in (see purgeModeratorControls). For
    // moderators, only show them when the target isn't the viewer's own
    // message to prevent accidental self-ban.
    const modNodes = container.querySelectorAll("[data-mod-only]");
    const canMod = !!myIsModerator && msg && me && msg.user_id !== me.id;
    for (const node of modNodes) node.hidden = !canMod;
    // Fix 6 — self-delete: only visible on the viewer's own messages.
    // Main-chat rows use user_id; DM rows use sender_id — accept either.
    const selfNodes = container.querySelectorAll("[data-self-only]");
    const ownerId = msg ? (msg.user_id || msg.sender_id) : null;
    const canSelf = !!(ownerId && me && ownerId === me.id);
    for (const node of selfNodes) node.hidden = !canSelf;
  }

  // Hard-remove every moderation control from the DOM for non-moderators.
  // This runs once after we know the viewer's is_moderator flag, so there is
  // no way for a non-mod to surface these controls via DevTools, URL hash, or
  // any UI path. Back-end RPCs are the authoritative gate, but this keeps
  // the client surface clean too.
  function purgeModeratorControls() {
    if (myIsModerator) return;
    const nodes = document.querySelectorAll("[data-mod-only]");
    for (const n of nodes) n.remove();
  }

  // ---------- Context menu (desktop right-click) ----------
  function openCtxMenu(msgId, x, y) {
    ctxTargetId = msgId;
    const lookup = (currentActionMode === "dm") ? (typeof dmMessagesById !== "undefined" ? dmMessagesById.get(msgId) : null)
                  : (currentActionMode === "group") ? (typeof groupMessagesById !== "undefined" ? groupMessagesById.get(msgId) : null)
                  : messagesById.get(msgId);
    applyImageOnlyActions(ctxMenu, lookup);
    ctxMenu.style.visibility = "hidden";
    ctxMenu.classList.add("open");
    const rect = ctxMenu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let nx = x, ny = y;
    if (nx + rect.width + 8 > vw) nx = vw - rect.width - 8;
    if (ny + rect.height + 8 > vh) ny = vh - rect.height - 8;
    ctxMenu.style.left = Math.max(8, nx) + "px";
    ctxMenu.style.top = Math.max(8, ny) + "px";
    ctxMenu.style.visibility = "";
  }
  function closeCtxMenu() { ctxMenu.classList.remove("open"); ctxTargetId = null; if (!reactionPicker.classList.contains("open")) currentActionMode = "main"; }

  function extFromUrl(url) {
    try {
      const u = new URL(url, location.href);
      const path = u.pathname;
      const m = /\.([A-Za-z0-9]{1,5})$/.exec(path);
      if (m) return m[1].toLowerCase();
    } catch (_) {}
    return "png";
  }
  async function downloadMessageImage(msg) {
    if (!msg || !msg.image_url) return;
    const url = msg.image_url;
    const ext = extFromUrl(url);
    const filename = "chat-image-" + (msg.id || "msg") + "-" + Date.now() + "." + ext;
    try {
      const res = await fetch(url, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error("http " + res.status);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch(_){} }, 2000);
    } catch (err) {
      console.error("[Error] Image download failed", err);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  function handleAction(act, id) {
    if (currentActionMode === "dm" && typeof handleDmAction === "function") {
      return handleDmAction(act, id);
    }
    if (currentActionMode === "group" && typeof handleGroupAction === "function") {
      return handleGroupAction(act, id);
    }
    const m = messagesById.get(id);
    if (!m) return;
    if (act === "reply") setReplyTo(m);
    else if (act === "react") {
      const row = rowsById.get(id);
      const bubble = row && row.querySelector(".bubble");
      const target = bubble || row;
      const r = target.getBoundingClientRect();
      openReactionPicker(id, r.left + r.width / 2, r.top);
    } else if (act === "download") {
      // Logic-level guard: only image messages are downloadable.
      if (!m.image_url) return;
      downloadMessageImage(m);
    } else if (act === "report") {
      toast("Message reported. Thanks for letting us know.", "default", 2200);
      console.log("[Report]", m);
    } else if (act === "mod-delete") {
      // Logic-level guard: only moderators can mod-delete.
      if (!myIsModerator) return;
      moderatorDeleteMessage(m);
    } else if (act === "mod-ban") {
      if (!myIsModerator) return;
      moderatorBanUser(m);
    } else if (act === "self-delete") {
      // Logic-level guard: only the owner can self-delete.
      if (!me || m.user_id !== me.id) return;
      selfDeleteMessage(m);
    }
  }

  async function selfDeleteMessage(m) {
    if (!m || !me || m.user_id !== me.id) return;
    if (!confirm("Delete this message? This cannot be undone.")) return;
    try {
      const { error } = await sb.from("messages").delete().eq("id", m.id).eq("user_id", me.id);
      if (error) throw error;
      // Optimistic removal; realtime DELETE will reconcile for other clients.
      const row = rowsById.get(m.id);
      if (row) row.remove();
      rowsById.delete(m.id);
      messagesById.delete(m.id);
    } catch (err) {
      console.error("[Self] delete failed", err);
      toast("Could not delete: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  async function moderatorDeleteMessage(m) {
    if (!myIsModerator || !m) return;
    if (!confirm("Delete this message?\n\nThis action is logged.")) return;
    const { error } = await sb.rpc("moderator_delete_message", { p_message: m.id });
    if (error) { console.error("[Mod] delete failed", error); toast(error.message || "Delete failed", "error"); return; }
    // Optimistically remove from UI; realtime DELETE event will confirm.
    const row = rowsById.get(m.id);
    if (row) row.remove();
    rowsById.delete(m.id);
    messagesById.delete(m.id);
    // Best-effort audit log for the moderator panel. Ignored if the table
    // isn't set up; never blocks the user-facing action.
    try {
      await sb.from("moderator_logs").insert({
        actor_id: me && me.id,
        action_type: "delete_message",
        target_user_id: m.user_id || null,
        target_message_id: m.id,
        details: {
          username: m.username || null,
          content_preview: typeof m.content === "string" ? m.content.slice(0, 140) : null,
          had_image: !!m.image_url
        }
      });
    } catch (_) {}
    toast("Message deleted", "default", 1600);
  }

  async function moderatorBanUser(m) {
    if (!myIsModerator || !m) return;
    const uname = m.username ? ("@" + m.username) : "this user";
    if (!confirm("Ban " + uname + "?\n\nThey will no longer be able to send messages.")) return;
    const { error } = await sb.rpc("moderator_ban_user", { p_user: m.user_id });
    if (error) { console.error("[Mod] ban failed", error); toast(error.message || "Ban failed", "error"); return; }
    bannedIds.add(m.user_id);
    try {
      await sb.from("moderator_logs").insert({
        actor_id: me && me.id,
        action_type: "ban_user",
        target_user_id: m.user_id || null,
        target_message_id: m.id || null,
        details: { username: m.username || null }
      });
    } catch (_) {}
    toast("User banned", "default", 1800);
  }
  ctxMenu.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = ctxTargetId;
    closeCtxMenu();
    if (!id) return;
    handleAction(act, id);
  });

  // ---------- Bottom drawer (mobile) ----------
  function openDrawerFor(msgId) {
    drawerTargetId = msgId;
    const lookup = (currentActionMode === "dm") ? (typeof dmMessagesById !== "undefined" ? dmMessagesById.get(msgId) : null)
                  : (currentActionMode === "group") ? (typeof groupMessagesById !== "undefined" ? groupMessagesById.get(msgId) : null)
                  : messagesById.get(msgId);
    applyImageOnlyActions(drawerEl, lookup);
    drawerEl.classList.add("open");
  }
  function closeDrawer() { drawerEl.classList.remove("open"); drawerTargetId = null; if (!reactionPicker.classList.contains("open")) currentActionMode = "main"; }
  drawerEl.addEventListener("click", (e) => {
    if (e.target.dataset && e.target.dataset.close !== undefined) { closeDrawer(); return; }
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    // Stop the click from bubbling to the document-level handler,
    // which would otherwise immediately close the picker we are about to open.
    e.stopPropagation();
    const act = btn.dataset.act;
    const id = drawerTargetId;
    if (!id) { closeDrawer(); return; }
    // Run the action FIRST, then close the drawer. Closing first would reset
    // currentActionMode to "main", causing DM actions (self-delete, reply,
    // report, react) to be routed to the main-chat handler and silently drop.
    handleAction(act, id);
    closeDrawer();
  });

  // Click-outside cleanup for menus/pickers
  document.addEventListener("click", (e) => {
    if (!ctxMenu.contains(e.target)) closeCtxMenu();
    if (!reactionPicker.contains(e.target) && !e.target.closest(".reaction.add-emoji")) closeReactionPicker();
    // Close active row actions if clicking outside any row
    if (activeRow && !e.target.closest(".row")) { activeRow.classList.remove("show-actions"); activeRow = null; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCtxMenu(); closeReactionPicker(); closeDrawer(); closeImageViewer(); cancelReply();
      if (activeRow) { activeRow.classList.remove("show-actions"); activeRow = null; }
    }
  });
  messagesEl.addEventListener("scroll", () => {
    closeCtxMenu(); closeReactionPicker();
    if (activeRow) { activeRow.classList.remove("show-actions"); activeRow = null; }
  });

  // ---------- Reply ----------
  function setReplyTo(m) {
    replyTo = m;
    rpName.textContent = m.username || "User";
    rpText.textContent = snippetFromMessage(m);
    replyPreview.classList.add("open");
    inputEl.focus();
    updateSendDisabled();
  }
  function cancelReply() {
    if (!replyTo) return;
    replyTo = null;
    replyPreview.classList.remove("open");
    updateSendDisabled();
  }
  rpClose.addEventListener("click", cancelReply);

  function jumpToMessage(id) {
    const row = rowsById.get(id);
    if (!row) {
      console.warn("[Warning] Missing reply target", id);
      toast("Original message not found", "warn", 1400);
      return;
    }
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.remove("msg-highlight");
    void row.offsetWidth;
    row.classList.add("msg-highlight");
    setTimeout(() => row.classList.remove("msg-highlight"), 1400);
  }

  // ---------- Swipe-to-reveal (fixed cap, snap back on release) ----------
  // Generalized: attaches to main chat, DM room, and group room containers.
  function attachSwipeReveal(container) {
    if (!container || container._swipeAttached) return;
    container._swipeAttached = true;
    let active = false;
    let startX = 0, startY = 0;
    let lastX = 0;
    let locked = false;
    let pointerId = null;
    let rafId = 0;

    function setReveal(px) {
      const v = Math.max(0, Math.min(REVEAL_MAX, px));
      document.documentElement.style.setProperty("--reveal", v + "px");
    }
    function setDragging(on) {
      container.querySelectorAll(".row, .name-small").forEach(el => el.classList.toggle("dragging", on));
    }
    function snapBack() {
      setDragging(false);
      document.documentElement.style.setProperty("--reveal", "0px");
    }
    function hardReset() {
      active = false;
      locked = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (pointerId != null) { try { container.releasePointerCapture(pointerId); } catch(_){} }
      pointerId = null;
      snapBack();
    }

    container.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest(".reaction, .reply-snippet, .bubble img.msg-image, button, a, .inline-actions")) return;
      active = true;
      locked = false;
      startX = e.clientX; startY = e.clientY; lastX = e.clientX;
      pointerId = e.pointerId;
    });

    container.addEventListener("pointermove", (e) => {
      if (!active || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!locked) {
        if (Math.abs(dx) > REVEAL_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
          locked = true;
          setDragging(true);
          try { container.setPointerCapture(e.pointerId); } catch(_){}
        } else if (Math.abs(dy) > REVEAL_THRESHOLD) {
          active = false;
          return;
        } else {
          return;
        }
      }
      e.preventDefault();
      lastX = e.clientX;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const delta = Math.abs(lastX - startX);
        setReveal(delta);
      });
    }, { passive: false });

    function end() {
      if (!active && !locked && !pointerId) { snapBack(); return; }
      active = false;
      if (locked) {
        locked = false;
        try { container.releasePointerCapture(pointerId); } catch(_){}
      }
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      pointerId = null;
      snapBack();
    }
    container.addEventListener("pointerup", end);
    container.addEventListener("pointercancel", end);
    container.addEventListener("pointerleave", () => { if (active) end(); });
    // Safety net: release any stuck state from lost pointer events
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("blur", hardReset);
    document.addEventListener("visibilitychange", () => { if (document.hidden) hardReset(); });
  }
  attachSwipeReveal(messagesEl);
  const _dmMsgsEl    = document.getElementById("dm-room-messages");
  const _groupMsgsEl = document.getElementById("group-room-messages");
  if (_dmMsgsEl)    attachSwipeReveal(_dmMsgsEl);
  if (_groupMsgsEl) attachSwipeReveal(_groupMsgsEl);

  // ---------- Tap-to-show-actions (mobile friendly) ----------
  messagesEl.addEventListener("click", (e) => {
    // Avoid toggling when clicking interactive children
    if (e.target.closest(".reaction, .reply-snippet, .avatar-btn, .inline-actions, button, a, img.msg-image")) return;
    const row = e.target.closest(".row[data-id]");
    if (!row) return;
    if (activeRow && activeRow !== row) activeRow.classList.remove("show-actions");
    row.classList.toggle("show-actions");
    activeRow = row.classList.contains("show-actions") ? row : null;
  });

  // ---------- Realtime ----------
  function subscribeRealtime() {
    if (channel) { try { sb.removeChannel(channel); } catch(_){} channel = null; }
    if (reactChannel) { try { sb.removeChannel(reactChannel); } catch(_){} reactChannel = null; }

    channel = sb.channel("public:messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new;
        if (!m || rowsById.has(m.id)) { if (m) console.warn("[Warning] Duplicate prevented", m.id); return; }
        const wasAtBottom = atBottom(messagesEl);
        const isMine = me && m.user_id === me.id;
        renderMessage(m);
        if (wasAtBottom || isMine) scrollToBottom();
        if (!isMine) playReceived();
        // Author just sent a message → clear any lingering typing indicator
        // for them immediately (server broadcast may still be in flight).
        if (m && m.user_id) publicTyping.handleBroadcast("typing:stop", { user_id: m.user_id });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const old = payload.old;
        if (!old || !old.id) return;
        const row = rowsById.get(old.id);
        if (row) row.remove();
        rowsById.delete(old.id);
        messagesById.delete(old.id);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.log("[Realtime] Connected (messages)");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Realtime] Disconnected:", status);
          toast("Reconnecting to realtime…", "warn", 1500);
          setTimeout(subscribeRealtime, 1500);
        }
      });

    // Public-chat typing: ephemeral realtime broadcasts — no DB writes.
    if (publicTypingChannel) { try { sb.removeChannel(publicTypingChannel); } catch (_) {} publicTypingChannel = null; }
    publicTyping.clearAllRemote();
    publicTypingChannel = sb.channel("public:typing", { config: { broadcast: { self: false, ack: false } } })
      .on("broadcast", { event: "typing:start" }, ({ payload }) => publicTyping.handleBroadcast("typing:start", payload))
      .on("broadcast", { event: "typing:stop"  }, ({ payload }) => publicTyping.handleBroadcast("typing:stop",  payload))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.log("[Realtime] Connected (typing)");
      });

    reactChannel = sb.channel("public:reactions")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) => {
        const r = payload.new;
        if (!r) return;
        if (addReactionToState(r)) renderReactionsFor(r.message_id);
        else console.warn("[Warning] Duplicate reaction prevented");
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) => {
        const r = payload.old;
        if (!r) return;
        if (removeReactionFromState(r)) renderReactionsFor(r.message_id);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.log("[Realtime] Connected (reactions)");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Realtime] Reactions disconnected:", status);
        }
      });
  }

  // ---------- Auth ----------
  const MAX_USERNAME_CHANGES = 3;
  // Username constraint: length only (3–32 chars). Any characters allowed,
  // including Unicode / emoji. Leading and trailing whitespace is trimmed
  // before length is measured.
  const USERNAME_MIN = 3;
  const USERNAME_MAX = 32;
  function isValidUsername(v) {
    const s = String(v == null ? "" : v).trim();
    // Use Array.from to count by Unicode code points (emoji count as 1).
    const len = Array.from(s).length;
    return len >= USERNAME_MIN && len <= USERNAME_MAX;
  }
  const USERNAME_LENGTH_MESSAGE = "Username must be 3\u201332 characters.";
  let authMode = "signin";

  function setLoginError(text, opts) {
    loginErr.textContent = "";
    if (!text) return;
    if (opts && opts.withSignupLink) {
      loginErr.append(document.createTextNode(text + " "));
      const a = document.createElement("a");
      a.href = "#"; a.textContent = "Sign up here.";
      a.addEventListener("click", (e) => { e.preventDefault(); setAuthMode("signup"); });
      loginErr.appendChild(a);
    } else {
      loginErr.textContent = text;
    }
  }

  function mapAuthError(err, ctx) {
    const raw = (err && (err.message || err.error_description || "")) + "";
    const status = err && (err.status || err.statusCode);
    const lower = raw.toLowerCase();
    if (/invalid login credentials|invalid.*credentials|invalid.*grant/.test(lower)) {
      // Supabase returns the same "Invalid login credentials" for both wrong-password
      // and account-not-found, so we treat the signin path as "credentials not correct"
      // and direct the user to sign up if they don't have an account.
      return ctx === "signin"
        ? { text: "The credentials you entered are not correct.", signupLink: true, accountNotFound: true }
        : { text: raw || "Authentication failed." };
    }
    if (/user not found|no user found|user does not exist/.test(lower)) {
      return { text: "No account exists with these credentials.", signupLink: true, accountNotFound: true };
    }
    if (/already registered|already.*exists|already.*signed up/.test(lower)) {
      return { text: "An account with that email already exists. Try signing in." };
    }
    if (/email not confirmed|confirm.*email/.test(lower)) {
      return { text: "Please confirm your email before signing in (check your inbox)." };
    }
    if (/signups? (are )?disabled|not allowed/.test(lower)) {
      return { text: "Sign-ups are currently disabled for this provider." };
    }
    if (/rate limit|too many/.test(lower)) {
      return { text: "Too many attempts. Please wait a moment and try again." };
    }
    if (status === 0 || /network|failed to fetch/.test(lower)) {
      return { text: "Network error — check your connection and try again." };
    }
    return { text: raw || "Authentication failed." };
  }

  function setAuthMode(mode) {
    authMode = mode === "signup" ? "signup" : "signin";
    authTabs.forEach(t => t.classList.toggle("active", t.dataset.mode === authMode));
    // Toggle the signup-mode CSS class so the password input hides on signup.
    // Signup is email-only: we create the Supabase account with a random
    // password at end of onboarding and send the verification email then.
    if (authForm) authForm.classList.toggle("signup-mode", authMode === "signup");
    if (authPassword) {
      // When switching to signup, clear any typed password so browser autofill
      // doesn't submit it; also relax required/minlength so the hidden field
      // can't block submission.
      if (authMode === "signup") {
        authPassword.value = "";
        authPassword.removeAttribute("required");
        authPassword.setAttribute("aria-hidden", "true");
      } else {
        authPassword.setAttribute("required", "");
        authPassword.removeAttribute("aria-hidden");
      }
    }
    loginErr.textContent = "";
    authInfo.textContent = "";
    if (authMode === "signup") {
      authTitle.textContent = "Create your account";
      authSub.textContent = "Sign up with email to join Relay.";
      authSubmit.textContent = "Sign Up";
      authPassword.setAttribute("autocomplete", "new-password");
    } else {
      authTitle.textContent = "Welcome back";
      authSub.textContent = "Sign in to continue to Relay.";
      authSubmit.textContent = "Sign In";
      authPassword.setAttribute("autocomplete", "current-password");
    }
  }
  authTabs.forEach(t => t.addEventListener("click", () => setAuthMode(t.dataset.mode)));

  // Restore the user's "Remember me" preference on page load. Default is
  // CHECKED (remember) — matches the HTML default. If they previously
  // unchecked it, respect that choice.
  try {
    if (authRemember && localStorage.getItem(REMEMBER_ME_KEY) === "false") {
      authRemember.checked = false;
    }
  } catch(_) {}

  // Captcha was removed from this app. We intentionally keep a no-op
  // `resetHcaptcha` so any legacy defensive `try { resetHcaptcha() } catch(_){}`
  // call sites continue to work if they're ever re-added. The global
  // onHcaptcha* callbacks are not re-declared; they are no longer referenced.
  function resetHcaptcha() { /* captcha removed — no-op */ }

  // --- Pre-auth signup state -------------------------------------------
  // When a user submits the signup form (email + captcha + terms), we DON'T
  // call sb.auth.signUp yet. Instead we stash their email + captcha token
  // here and transition them straight into onboarding. At the end of
  // onboarding, finishOnboarding() calls signUp with the stashed token and
  // all profile data — so the verification email is sent only after the
  // user has completed their profile setup.
  //
  // This is required because Supabase signUp triggers the confirmation email
  // and creates the auth.users row. If we called it on the auth page, the
  // user would see "check your inbox" before onboarding — reversing the flow
  // the spec mandates.
  let _pendingSignup = null;            // { email, agreedAt }
  let _pendingProfile = null;           // holds avatarFile across signUp\u2192onSignedIn
  let _forcePendingVerifyModal = false; // forces verify modal even when `me` is null

  function _generateRandomPassword() {
    // 32 random bytes → base64 → ~43 chars. Kept as a safety fallback for
    // code paths that still call it (none currently); the user-entered
    // password from onboarding step 6 is what actually gets used.
    const bytes = new Uint8Array(32);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/[^A-Za-z0-9]/g, "").slice(0, 40) + "Aa1!";
  }

  // ---------- Password step helpers (onboarding step 6) -----------------
  // Requirement regexes used by both the live checklist and the final
  // server-bound validation in validateOnboardingStep/finishOnboarding.
  const _PWD_RULES = {
    length:  (s) => s.length >= 8,
    upper:   (s) => /[A-Z]/.test(s),
    lower:   (s) => /[a-z]/.test(s),
    number:  (s) => /[0-9]/.test(s),
    special: (s) => /[^A-Za-z0-9]/.test(s)
  };
  // Returns { length, upper, lower, number, special, metCount, allMet }.
  function _pwdRulesPass(pw) {
    const s = String(pw || "");
    const r = {};
    let metCount = 0;
    for (const k of Object.keys(_PWD_RULES)) {
      r[k] = _PWD_RULES[k](s);
      if (r[k]) metCount += 1;
    }
    r.metCount = metCount;
    r.allMet = metCount === 5;
    return r;
  }
  // Weak 0–2 met, Medium 3–4 met, Strong = 5/5 met AND ≥ 12 chars.
  function _pwdStrength(pw) {
    const r = _pwdRulesPass(pw);
    if (r.metCount >= 5 && String(pw).length >= 12) return { level: "strong", label: "Strong" };
    if (r.metCount >= 3) return { level: "medium", label: "Medium" };
    if (r.metCount >= 1) return { level: "weak", label: "Weak" };
    return { level: "", label: "Enter a password" };
  }
  // Build a password that meets ALL requirements and is safely random.
  // Uses crypto.getRandomValues for all character picks.
  function _generateSecurePassword(len) {
    const L = Math.max(16, Math.min(32, len || 20));
    const sets = {
      upper:   "ABCDEFGHJKLMNPQRSTUVWXYZ",
      lower:   "abcdefghijkmnpqrstuvwxyz",
      number:  "23456789",
      special: "!@#$%^&*()-_=+[]{};:,.?"
    };
    const all = sets.upper + sets.lower + sets.number + sets.special;
    const rand = (n) => {
      const buf = new Uint32Array(1);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      return buf[0] % n;
    };
    // Guarantee one of each required class.
    const pick = (set) => set[rand(set.length)];
    let chars = [ pick(sets.upper), pick(sets.lower), pick(sets.number), pick(sets.special) ];
    while (chars.length < L) chars.push(all[rand(all.length)]);
    // Fisher–Yates shuffle so the guaranteed chars aren't always at the start.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      const tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
    }
    return chars.join("");
  }
  function _updatePasswordChecklistUI() {
    if (!obPasswordChecklist) return;
    const pw = (obPassword && obPassword.value) || "";
    const cp = (obPasswordConfirm && obPasswordConfirm.value) || "";
    const rules = _pwdRulesPass(pw);
    const items = obPasswordChecklist.querySelectorAll("li");
    items.forEach((li) => {
      const rule = li.dataset.rule;
      let ok = false, touched = false;
      if (rule === "match") {
        touched = pw.length > 0 || cp.length > 0;
        ok = touched && pw.length > 0 && pw === cp;
      } else if (rules[rule] !== undefined) {
        touched = pw.length > 0;
        ok = !!rules[rule];
      }
      li.classList.toggle("ok", ok);
      li.classList.toggle("bad", !ok && touched);
    });
    // Strength meter.
    if (obPasswordStrengthFill && obPasswordStrengthLabel) {
      const s = _pwdStrength(pw);
      if (s.level) {
        obPasswordStrengthFill.setAttribute("data-level", s.level);
        obPasswordStrengthLabel.setAttribute("data-level", s.level);
        obPasswordStrengthLabel.textContent = "Strength: " + s.label;
      } else {
        obPasswordStrengthFill.removeAttribute("data-level");
        obPasswordStrengthLabel.removeAttribute("data-level");
        obPasswordStrengthLabel.textContent = "Enter a password";
      }
    }
  }

  // --- Terms agreement gating (applies to email + OAuth sign-in/sign-up) ---
  // After the captcha removal, the only gating signal is the terms checkbox.
  // Both the email submit and the Google button stay disabled until the user
  // agrees to the Terms / Privacy / Contact policies.
  function refreshAuthTermsState() {
    const agreed = !!(authTermsAgree && authTermsAgree.checked);
    if (authSubmit) authSubmit.disabled = !agreed;
    if (loginBtn) loginBtn.disabled = !agreed;
    if (agreed && authTermsErr) authTermsErr.textContent = "";
  }
  if (authTermsAgree) authTermsAgree.addEventListener("change", refreshAuthTermsState);
  refreshAuthTermsState();

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErr.textContent = "";
    authInfo.textContent = "";
    if (authTermsErr) authTermsErr.textContent = "";
    if (!authTermsAgree || !authTermsAgree.checked) {
      if (authTermsErr) authTermsErr.textContent = "Please agree to the Terms, Privacy, and Contact policies to continue.";
      return;
    }
    const email = (authEmail.value || "").trim();
    const password = authPassword.value || "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setLoginError("Enter a valid email."); return; }
    // Signin still requires a password; signup doesn't (field is hidden).
    if (authMode !== "signup" && password.length < 6) { setLoginError("Password must be at least 6 characters."); return; }
    authSubmit.disabled = true;
    const prevLabel = authSubmit.textContent;
    authSubmit.textContent = authMode === "signup" ? "Continuing…" : "Signing in…";
    ensureAudio();
    try {
      if (authMode === "signup") {
        // ONBOARDING-FIRST FLOW: do NOT call sb.auth.signUp here. Stash the
        // email, transition into onboarding, and create the account at end
        // of onboarding (so the verification email is sent AFTER the user
        // has filled out their profile).
        _pendingSignup = { email, agreedAt: Date.now() };
        authSubmit.textContent = prevLabel;
        authSubmit.disabled = false;
        // Transition to onboarding pre-auth. startOnboarding(null) seeds
        // with blank defaults; profile is collected to pendingProfile and
        // upserted after signUp succeeds in finishOnboarding.
        try { hideLogin(); } catch(_) {}
        try { startOnboarding(null); } catch(e2) {
          console.error("[Signup] Failed to start onboarding", e2);
          setLoginError("Could not start onboarding. Please refresh and try again.");
          _pendingSignup = null;
          try { showLogin(); } catch(_) {}
        }
        return; // skip finally-block widget reset
      }
      // Persist the "Remember me" preference BEFORE calling signIn. The
      // Supabase client will write its auth token to localStorage during
      // signIn; our pagehide handler will decide at tab-close time
      // whether to demote that token to sessionStorage based on this key.
      try {
        if (authRemember) {
          localStorage.setItem(REMEMBER_ME_KEY, authRemember.checked ? "true" : "false");
        }
      } catch(_) {}
      const { error } = await sb.auth.signInWithPassword({
        email, password
      });
      if (error) throw error;
    } catch (err) {
      console.error("[Error] Email auth failed", err);
      const mapped = mapAuthError(err, authMode);
      setLoginError(mapped.text, { withSignupLink: mapped.signupLink && authMode === "signin" });
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = prevLabel;
      refreshAuthTermsState();
    }
  });

  loginBtn.addEventListener("click", async () => {
    loginErr.textContent = "";
    if (authTermsErr) authTermsErr.textContent = "";
    if (!authTermsAgree || !authTermsAgree.checked) {
      if (authTermsErr) authTermsErr.textContent = "Please agree to the Terms, Privacy, and Contact policies to continue.";
      return;
    }
    loginBtn.disabled = true;
    loginLabel.textContent = "Redirecting…";
    ensureAudio();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) {
      console.error("[Error] Sign-in failed", error);
      const mapped = mapAuthError(error, authMode);
      setLoginError(mapped.text);
      loginBtn.disabled = false;
      loginLabel.textContent = "Continue with Google";
      refreshAuthTermsState();
    }
  });

  function showLogin() {
    loginEl.style.display = "";
    onboardingEl.style.display = "none";
    chatEl.style.display = "none";
    // Strict separation: ensure the logged-in-only 3-dot menu is not in the DOM.
    try { unmountHeaderMenu(); } catch(_) {}
    // Reset the auth terms agreement (don't carry consent across sessions).
    try {
      if (authTermsAgree) authTermsAgree.checked = false;
      if (authTermsErr) authTermsErr.textContent = "";
      refreshAuthTermsState();
    } catch(_) {}
  }
  function showOnboarding() {
    loginEl.style.display = "none";
    onboardingEl.style.display = "flex";
    chatEl.style.display = "none";
    // Onboarding is still pre-main-app; keep the menu out of DOM until showChat().
    try { unmountHeaderMenu(); } catch(_) {}
  }
  function showChat() {
    loginEl.style.display = "none";
    onboardingEl.style.display = "none";
    chatEl.style.display = "flex";
    // Logged-in only: inject the 3-dot menu into the header.
    try { mountHeaderMenu(); } catch(_) {}
  }

  // --- Logged-in header 3-dot menu (dynamically mounted, never in DOM while logged out) ---
  let headerMenuBtnEl = null;
  let headerMenuDrawerEl = null;
  let headerMenuOutsideHandler = null;
  let headerMenuKeyHandler = null;
  function mountHeaderMenu() {
    if (headerMenuBtnEl) return; // already mounted
    const bar = chatEl.querySelector("header.bar");
    if (!bar || !meBtn) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-menu-btn";
    btn.id = "header-menu-btn";
    btn.setAttribute("aria-label", "More");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.title = "More";
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>';
    bar.insertBefore(btn, meBtn);
    btn.addEventListener("click", toggleHeaderMenu);
    headerMenuBtnEl = btn;
  }
  function unmountHeaderMenu() {
    closeHeaderMenu();
    if (headerMenuBtnEl && headerMenuBtnEl.parentNode) headerMenuBtnEl.parentNode.removeChild(headerMenuBtnEl);
    headerMenuBtnEl = null;
    if (headerMenuDrawerEl && headerMenuDrawerEl.parentNode) headerMenuDrawerEl.parentNode.removeChild(headerMenuDrawerEl);
    headerMenuDrawerEl = null;
  }
  function buildHeaderMenuDrawer() {
    const d = document.createElement("div");
    d.className = "header-menu-drawer";
    d.id = "header-menu-drawer";
    d.setAttribute("role", "menu");
    d.innerHTML = `
      <button type="button" class="header-menu-item" data-hm="friends-list" role="menuitem">
        <span class="hm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        <span>Friends</span>
      </button>
      <button type="button" class="header-menu-item" data-hm="account-center" role="menuitem">
        <span class="hm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="3.4"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><circle cx="18" cy="6.5" r="2.2"/><circle cx="18" cy="14" r="2.2"/><circle cx="18" cy="21" r="2.2"/></svg></span>
        <span>Account Center</span>
      </button>
      <button type="button" class="header-menu-item" data-hm="settings" role="menuitem">
        <span class="hm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
        <span>Settings</span>
      </button>
      <div class="header-menu-divider" role="separator"></div>
      <button type="button" class="header-menu-item" data-hm="tp-toggle" role="menuitem" aria-haspopup="true" aria-expanded="false">
        <span class="hm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg></span>
        <span>Terms &amp; Privacy</span>
        <span class="hm-caret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></span>
      </button>
      <div class="header-menu-sub" id="header-menu-sub" role="menu">
        <a class="header-menu-item" href="terms.html" target="_blank" rel="noopener" role="menuitem">
          <span class="hm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
          <span>Terms</span>
        </a>
        <a class="header-menu-item" href="privacy.html" target="_blank" rel="noopener" role="menuitem">
          <span class="hm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
          <span>Privacy</span>
        </a>
      </div>
      <a class="header-menu-item" href="contact.html" target="_blank" rel="noopener" role="menuitem" data-hm="contact">
        <span class="hm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></span>
        <span>Contact</span>
      </a>
      <a class="header-menu-item" href="${SUPPORT_URL || 'https://discord.gg/dFv2tYRNH8/'}" target="_blank" rel="noopener" role="menuitem" data-hm="support">
        <span class="hm-icon"><svg viewBox="0 0 71 55" aria-hidden="true"><path fill="currentColor" d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.6 40.6 0 0 0-1.8 3.7 53.9 53.9 0 0 0-16.2 0A37.4 37.4 0 0 0 25.5.5a.2.2 0 0 0-.2-.1 58.4 58.4 0 0 0-14.6 4.5.2.2 0 0 0-.1.1C1.3 18.7-.8 32 .2 45.2a.2.2 0 0 0 .1.2 58.7 58.7 0 0 0 17.7 9 .2.2 0 0 0 .2 0 42.1 42.1 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1-.8a.2.2 0 0 1 .2 0 42 42 0 0 0 35.7 0 .2.2 0 0 1 .2 0l1 .8a.2.2 0 0 1 0 .4 36.3 36.3 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.3 47.3 0 0 0 3.6 5.9.2.2 0 0 0 .2 0 58.5 58.5 0 0 0 17.7-9 .2.2 0 0 0 .1-.2c1.2-15.3-2.1-28.5-8.8-40.2a.2.2 0 0 0-.1-.1ZM23.7 37.2c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 3.9-2.8 7.1-6.4 7.1Zm23.7 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 3.9-2.8 7.1-6.4 7.1Z"/></svg></span>
        <span>Support</span>
      </a>
    `;
    // Sub-menu toggle
    const tpBtn = d.querySelector('[data-hm="tp-toggle"]');
    const sub = d.querySelector('#header-menu-sub');
    if (tpBtn && sub) {
      tpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = sub.classList.toggle("open");
        tpBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    // Item click (excluding sub-toggle) closes the drawer
    d.querySelectorAll(".header-menu-item").forEach(el => {
      if (el.dataset.hm === "tp-toggle") return;
      el.addEventListener("click", (e) => {
        if (el.dataset.hm === "friends-list") {
          e.preventDefault();
          closeHeaderMenu();
          openFriendsList();
          return;
        }
        if (el.dataset.hm === "account-center") {
          e.preventDefault();
          closeHeaderMenu();
          if (typeof openAccountCenter === "function") openAccountCenter();
          return;
        }
        if (el.dataset.hm === "settings") {
          e.preventDefault();
          closeHeaderMenu();
          if (typeof openSettings === "function") openSettings();
          return;
        }
        closeHeaderMenu();
      });
    });
    return d;
  }
  function positionHeaderMenuDrawer() {
    if (!headerMenuBtnEl || !headerMenuDrawerEl) return;
    const r = headerMenuBtnEl.getBoundingClientRect();
    const drawerWidth = Math.max(headerMenuDrawerEl.offsetWidth, 220);
    const pad = 8;
    let left = r.left + r.width / 2 - drawerWidth / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - drawerWidth - pad));
    const top = r.bottom + 8;
    headerMenuDrawerEl.style.left = left + "px";
    headerMenuDrawerEl.style.top = top + "px";
  }
  function toggleHeaderMenu(e) {
    if (e) e.stopPropagation();
    if (!headerMenuBtnEl) return;
    if (headerMenuDrawerEl && headerMenuDrawerEl.classList.contains("open")) {
      closeHeaderMenu();
    } else {
      openHeaderMenu();
    }
  }
  function openHeaderMenu() {
    if (!headerMenuBtnEl) return;
    if (!headerMenuDrawerEl) {
      headerMenuDrawerEl = buildHeaderMenuDrawer();
      document.body.appendChild(headerMenuDrawerEl);
    }
    // Reset sub-menu state on open
    const sub = headerMenuDrawerEl.querySelector("#header-menu-sub");
    if (sub) sub.classList.remove("open");
    const tpBtn = headerMenuDrawerEl.querySelector('[data-hm="tp-toggle"]');
    if (tpBtn) tpBtn.setAttribute("aria-expanded", "false");
    positionHeaderMenuDrawer();
    headerMenuDrawerEl.classList.add("open");
    headerMenuBtnEl.setAttribute("aria-expanded", "true");
    if (!headerMenuOutsideHandler) {
      headerMenuOutsideHandler = (ev) => {
        if (!headerMenuDrawerEl) return;
        if (headerMenuDrawerEl.contains(ev.target)) return;
        if (headerMenuBtnEl && headerMenuBtnEl.contains(ev.target)) return;
        closeHeaderMenu();
      };
      document.addEventListener("pointerdown", headerMenuOutsideHandler, true);
    }
    if (!headerMenuKeyHandler) {
      headerMenuKeyHandler = (ev) => { if (ev.key === "Escape") closeHeaderMenu(); };
      document.addEventListener("keydown", headerMenuKeyHandler);
    }
    window.addEventListener("resize", positionHeaderMenuDrawer);
    window.addEventListener("scroll", positionHeaderMenuDrawer, true);
  }
  function closeHeaderMenu() {
    if (headerMenuDrawerEl) {
      headerMenuDrawerEl.classList.remove("open");
      const sub = headerMenuDrawerEl.querySelector("#header-menu-sub");
      if (sub) sub.classList.remove("open");
    }
    if (headerMenuBtnEl) headerMenuBtnEl.setAttribute("aria-expanded", "false");
    if (headerMenuOutsideHandler) {
      document.removeEventListener("pointerdown", headerMenuOutsideHandler, true);
      headerMenuOutsideHandler = null;
    }
    if (headerMenuKeyHandler) {
      document.removeEventListener("keydown", headerMenuKeyHandler);
      headerMenuKeyHandler = null;
    }
    window.removeEventListener("resize", positionHeaderMenuDrawer);
    window.removeEventListener("scroll", positionHeaderMenuDrawer, true);
  }

  const UNIQUE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  function generateUserUniqueId() {
    const buf = new Uint32Array(16);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    let out = "";
    for (let i = 0; i < 16; i++) out += UNIQUE_ID_ALPHABET[buf[i] % UNIQUE_ID_ALPHABET.length];
    return out;
  }

  function formatSbError(err, fallback) {
    if (!err) return fallback || "Unknown error";
    const parts = [];
    if (err.message) parts.push(err.message);
    if (err.details && err.details !== err.message) parts.push(err.details);
    if (err.hint) parts.push("Hint: " + err.hint);
    if (err.code) parts.push("(code " + err.code + ")");
    if (err.code === "42501") {
      parts.push("This looks like a row-level-security policy blocking the write. Ensure the `profiles` table allows authenticated users to insert/update their own row.");
    } else if (err.code === "42P01") {
      parts.push("The `profiles` table is missing. Run the setup SQL in the Supabase dashboard.");
    } else if (err.code === "42703") {
      parts.push("A column in the `profiles` table is missing. Run the setup SQL in the Supabase dashboard.");
    }
    return parts.join(" — ") || fallback || "Save failed";
  }

  async function upsertOwnProfile(extra) {
    if (!me) throw new Error("Not signed in");
    // Refresh the current session to guarantee we still have the authenticated user id.
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session || !session.user) throw new Error("Your session has expired. Please sign in again.");
      if (session.user.id !== me.id) me.id = session.user.id;
    } catch (e) {
      if (e && e.message && /session/i.test(e.message)) throw e;
    }
    let needsUniqueId = false;
    try {
      const existing = await fetchProfile(me.id);
      if (!existing || !existing.user_unique_id) needsUniqueId = true;
    } catch (_) { needsUniqueId = true; }
    const base = {
      user_id: me.id,
      username: me.username,
      avatar_url: me.avatar_url,
      updated_at: new Date().toISOString()
    };
    const extraObj = Object.assign({}, extra || {});
    const droppedCols = new Set();
    let attempt = 0;
    while (true) {
      attempt++;
      const payload = Object.assign({}, base, extraObj);
      if (needsUniqueId && !payload.user_unique_id && !droppedCols.has("user_unique_id")) {
        payload.user_unique_id = generateUserUniqueId();
      }
      for (const col of droppedCols) delete payload[col];
      const { data, error } = await sb.from("profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select("*").maybeSingle();
      if (!error) {
        if (data) profileCache.set(me.id, data);
        return data;
      }
      const code = error.code || "";
      const msg = error.message || "";
      const details = error.details || "";
      console.error("[Error] Profile upsert failed", {
        code, message: msg, details, hint: error.hint, payloadKeys: Object.keys(payload)
      });
      const isDup = code === "23505" || /duplicate key|unique constraint/i.test(msg);
      const isUidDup = isDup && /user_unique_id/i.test(msg + " " + details);
      if (isUidDup && attempt < 8) continue;
      // Undefined column — drop the offending column and retry.
      if (code === "42703" || /column .* does not exist/i.test(msg)) {
        const m = (msg + " " + details).match(/column\s+(?:"?[\w.]+"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/i);
        const col = m && m[1];
        if (col && !droppedCols.has(col)) {
          droppedCols.add(col);
          if (col === "user_unique_id") needsUniqueId = false;
          if (attempt < 12) continue;
        }
      }
      throw error;
    }
  }

  function extractDiscordIdentity(user) {
    if (!user || !Array.isArray(user.identities)) return null;
    const d = user.identities.find(i => i.provider === "discord");
    if (!d) return null;
    const data = d.identity_data || {};
    const id = data.provider_id || data.sub || d.id || "";
    const username = data.custom_claims && data.custom_claims.global_name
      ? data.custom_claims.global_name
      : (data.full_name || data.name || data.user_name || data.preferred_username || data.nickname || "");
    const avatar = data.avatar_url || data.picture || "";
    return { id: String(id || ""), username: String(username || ""), avatar: String(avatar || "") };
  }

  async function syncDiscordIdentityIfPresent(session) {
    try {
      const id = extractDiscordIdentity(session && session.user);
      if (!id) return;
      const current = await fetchProfile(me.id) || {};
      if (current.discord_linked && current.discord_id === id.id) return;
      await upsertOwnProfile({
        discord_id: id.id || null,
        discord_username: id.username || null,
        discord_avatar: id.avatar || null,
        discord_linked: true
      });
    } catch (err) {
      console.warn("[Warning] Discord identity sync failed", err);
    }
  }

  async function fetchProfile(userId) {
    if (!userId) return null;
    if (profileCache.has(userId)) return profileCache.get(userId);
    // Public read: keyed only by user_id (never session user). Supabase RLS on
    // the `profiles` table must allow SELECT for anon/authenticated so any
    // signed-in user can load any other user's public profile.
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[Warning] Profile fetch failed for", userId, error);
      return null;
    }
    if (data) profileCache.set(userId, data);
    return data;
  }

  function applyMeFromProfile(profile) {
    if (!me || !profile) return;
    if (profile.username) me.username = profile.username;
    if (profile.avatar_url) me.avatar_url = profile.avatar_url;
    // Fix 2 — never leave me.avatar_url empty. If the DB row had no avatar
    // (legacy accounts pre-default), coerce to DEFAULT_AVATAR_URL locally
    // and lazily persist it so every surface renders a real image.
    if (!me.avatar_url) {
      me.avatar_url = DEFAULT_AVATAR_URL;
      if (!profile.avatar_url) {
        // Fire-and-forget — don't block auth flow if the backfill fails.
        sb.from("profiles").update({ avatar_url: DEFAULT_AVATAR_URL }).eq("user_id", me.id)
          .then(({ error }) => { if (error) console.warn("[Warning] Avatar backfill failed", error); })
          .catch((e) => console.warn("[Warning] Avatar backfill threw", e));
      }
    }
    meName.textContent = me.username;
    meAvatar.src = me.avatar_url;
    meAvatar.style.visibility = "";
    myIsModerator = !!profile.is_moderator;
    if (profile.is_moderator) moderatorIds.add(me.id);
    // Harden: non-moderators get mod controls fully removed from DOM.
    purgeModeratorControls();
  }

  function isProfileComplete(p) {
    return !!(p && p.username && String(p.username).trim().length >= 3);
  }

  async function onSignedIn(session) {
    me = extractIdentity(session.user);
    console.log("[Auth] Signed in as", me.username, me.id);
    // Fix 2 — never render a blank avatar; use the default if OAuth/email
    // metadata didn't include a picture. applyMeFromProfile below will
    // persist the fallback to the profiles row for legacy accounts.
    if (!me.avatar_url) me.avatar_url = DEFAULT_AVATAR_URL;
    meName.textContent = me.username;
    meAvatar.src = me.avatar_url;
    meAvatar.onerror = () => { meAvatar.src = DEFAULT_AVATAR_URL; };
    applyRestrictionUI();
    // Snapshot email-verified flag from the session. Used by the verification
    // gate (send/react) and the sticky banner.
    try {
      myEmail = (session.user && session.user.email) || "";
      myEmailVerified = !!(session.user && (session.user.email_confirmed_at || session.user.confirmed_at));
    } catch(_) {}
    // We have a real session now — drop the force-modal flag so
    // updateVerifyBanner uses its normal `me && !myEmailVerified` gating.
    _forcePendingVerifyModal = false;
    updateVerifyBanner();

    const provider = (session.user && session.user.app_metadata && session.user.app_metadata.provider) || "email";
    // Hydrate any pre-auth onboarding data stashed in user_metadata.
    // Only applies to the onboarding-first signup flow: finishOnboarding
    // called sb.auth.signUp with options.data.pending_profile before the
    // user confirmed their email. Now that they're signed in, upsert the
    // profile from that stash and clean up the metadata.
    try {
      const md = (session.user && session.user.user_metadata) || {};
      const pp = md.pending_profile;
      if (pp && pp.username) {
        let avatarUrl = (me && me.avatar_url) || "";
        // If the File blob is still in memory (same window as signup),
        // upload it now that we have an authed session. Otherwise the
        // user can add an avatar later from their profile.
        if (_pendingProfile && _pendingProfile.avatarFile) {
          try {
            const uploaded = await uploadAvatarFile(_pendingProfile.avatarFile);
            if (uploaded) avatarUrl = uploaded;
          } catch (upErr) { console.warn("[Signup] Deferred avatar upload failed", upErr); }
        }
        // Fix 2 — fall back to the default image so new accounts never
        // land in the DB with a NULL avatar_url.
        if (!avatarUrl) avatarUrl = DEFAULT_AVATAR_URL;
        me.username = pp.username;
        me.avatar_url = avatarUrl;
        try {
          await upsertOwnProfile({
            username: pp.username,
            avatar_url: avatarUrl,
            bio: pp.bio || null,
            pronouns: pp.pronouns || null,
            region: pp.region || null,
            // Newsletter opt-in was collected on the password step during
            // onboarding. `false` is the safe default if the metadata is
            // missing (older sessions, partial data).
            newsletter_opt_in: !!pp.newsletter_opt_in
          });
        } catch (upErr) {
          console.warn("[Signup] Deferred profile upsert failed", upErr);
        }
        // Clear pending_profile so we don't re-hydrate on every subsequent
        // sign-in. Best-effort — failure is non-fatal.
        try { await sb.auth.updateUser({ data: { pending_profile: null } }); } catch(_) {}
        _pendingProfile = null;
      }
    } catch (hydrateErr) {
      console.warn("[Signup] Pending profile hydrate failed", hydrateErr);
    }
    const existing = await fetchProfile(me.id);

    // If the user has a Discord identity (linked later), make sure the profile reflects that.
    await syncDiscordIdentityIfPresent(session);

    if (isProfileComplete(existing)) {
      applyMeFromProfile(existing);
      showChat();
      await loadHistory();
      subscribeRealtime();
      initDmSidePanel();
      if (typeof initGroups === "function") initGroups();
      inputEl.focus();
      return;
    }

    if (provider !== "email" && me.username && me.username !== "User") {
      // OAuth user (Google) with identity data → seed the profile automatically.
      try {
        const saved = await upsertOwnProfile();
        if (isProfileComplete(saved)) {
          applyMeFromProfile(saved);
          showChat();
          await loadHistory();
          subscribeRealtime();
          initDmSidePanel();
          if (typeof initGroups === "function") initGroups();
          inputEl.focus();
          return;
        }
      } catch (err) {
        console.warn("[Warning] Auto-seed profile failed", err);
      }
    }

    // Needs onboarding.
    startOnboarding(existing);
  }
  async function onSignedOut() {
    console.log("[Auth] Signed out");
    // Fire-and-forget stop before we drop the channel so other users stop
    // seeing our indicator immediately.
    try { publicTyping.onLocalLeave(); } catch (_) {}
    try { if (typeof stopVerifyPolling === "function") stopVerifyPolling(); } catch(_) {}
    // Drop any pre-auth signup state so a fresh visitor to the auth page
    // isn't stuck in a half-finished flow.
    _pendingSignup = null;
    _pendingProfile = null;
    _forcePendingVerifyModal = false;
    myEmailVerified = false;
    myEmail = "";
    try { updateVerifyBanner(); } catch(_) {}
    me = null;
    if (channel) { try { sb.removeChannel(channel); } catch(_){} channel = null; }
    if (reactChannel) { try { sb.removeChannel(reactChannel); } catch(_){} reactChannel = null; }
    if (publicTypingChannel) { try { sb.removeChannel(publicTypingChannel); } catch(_){} publicTypingChannel = null; }
    resetDmSidePanel();
    if (typeof resetGroups === "function") resetGroups();
    clearMessages();
    inputEl.value = ""; sendBtn.disabled = true;
    clearPendingImage();
    cancelReply();
    loginBtn.disabled = false;
    loginLabel.textContent = "Continue with Google";
    authSubmit.disabled = false;
    authForm.reset();
    profileCache.clear();
    showLogin();
    setAuthMode("signin");
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      if (!me || me.id !== session.user.id) {
        onSignedIn(session);
      } else {
        // Same user — refresh the email-verified flag in case this was a
        // USER_UPDATED / TOKEN_REFRESHED event after the user clicked the
        // confirmation link, so the UI unlocks without a full page reload.
        try {
          myEmail = session.user.email || myEmail;
          myEmailVerified = !!(session.user.email_confirmed_at || session.user.confirmed_at);
        } catch(_) {}
        try { updateVerifyBanner(); } catch(_) {}
        // If the verification modal is currently open and the session just
        // flipped to verified (e.g. USER_UPDATED fired after the link click
        // in another tab), auto-close the modal and enter the app.
        const vm = document.getElementById("verify-modal");
        if (myEmailVerified && vm && vm.classList.contains("open")) {
          checkVerifiedAndEnter(false).catch(() => {});
        }
      }
    } else onSignedOut();
  });
  (async () => {
    clearRestrictionIfExpired();
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) onSignedIn(session); else showLogin();
  })();

  // ---------- Onboarding ----------
  // Steps 1..6 are profile setup. Step 6 is the password step (final
  // required step). Step 7 is the email-verification screen that shows
  // AFTER the account has been created. Step 7 is a terminal state: the
  // normal Next/Back/Skip actions are hidden there.
  const OB_STEPS = 7;
  const OB_FORM_STEPS = 6;
  let obStep = 1;
  let obPrevStep = 1;
  let obPendingAvatarFile = null;
  let obPendingAvatarUrl = null;
  let obVerifyPollTimer = null;
  let obResendLastAt = 0;
  const OB_TITLES = [
    null,
    "Pick a profile photo",
    "Choose your username",
    "Write a short bio",
    "Add your pronouns",
    "Where are you based?",
    "Create your password",
    "One last step"
  ];
  const OB_SUBS = [
    null,
    "Give people a face to recognize — you can skip and add one later.",
    "This is how people will see and @mention you. It's required, and must be unique.",
    "A quick intro for your public profile. Totally optional.",
    "Show how you'd like to be referred to. Optional, but appreciated.",
    "Optional — helps friends and time-zone aware features.",
    "Choose a strong password — you'll use it to sign back in. We'll also create your account on this step.",
    "We've sent a verification email. Confirm it to unlock messaging."
  ];
  const obStepPills = document.getElementById("ob-step-pills");
  const obStepSub   = document.getElementById("ob-step-sub");
  function _paintPills() {
    if (!obStepPills) return;
    if (!obStepPills.childElementCount) {
      const frag = document.createDocumentFragment();
      for (let i = 1; i <= OB_STEPS; i++) {
        const p = document.createElement("span");
        p.className = "ob-step-pill";
        p.dataset.pill = String(i);
        frag.appendChild(p);
      }
      obStepPills.appendChild(frag);
    }
    const pills = obStepPills.querySelectorAll(".ob-step-pill");
    for (const p of pills) {
      const n = Number(p.dataset.pill);
      p.classList.toggle("done",   n < obStep);
      p.classList.toggle("active", n === obStep);
    }
  }
  function renderOnboarding() {
    const goingBack = obStep < obPrevStep;
    obSteps.forEach(s => {
      const on = Number(s.dataset.step) === obStep;
      s.classList.toggle("active", on);
      s.classList.toggle("from-back", on && goingBack);
    });
    obStepLabel.textContent = "Step " + obStep + " of " + OB_STEPS;
    obProgress.style.width = Math.round((obStep / OB_STEPS) * 100) + "%";
    const title = document.getElementById("ob-title");
    if (title && OB_TITLES[obStep]) title.textContent = OB_TITLES[obStep];
    if (obStepSub && OB_SUBS[obStep]) obStepSub.textContent = OB_SUBS[obStep];
    _paintPills();
    // Last step (verify) hides normal Next/Back/Skip; the in-step Resend /
    // "I've verified" buttons drive the flow there. The password step
    // (final form step) hides Skip because a password is required.
    const onVerify = obStep === OB_STEPS;
    const onPassword = obStep === OB_FORM_STEPS;
    const actionsRow = obBack && obBack.parentElement;
    if (actionsRow) actionsRow.style.display = onVerify ? "none" : "";
    // Skip-for-now only makes sense once the account exists. In the
    // pre-auth signup flow (`_pendingSignup` set), no account has been
    // created yet, so skipping would drop the user into a logged-out
    // chat view with nothing to show. Hide Skip there.
    const preAuthSignup = !!_pendingSignup;
    if (obSkip) obSkip.style.display = (onVerify || onPassword || preAuthSignup) ? "none" : "";
    obBack.disabled = obStep === 1;
    obNext.textContent = obStep === OB_FORM_STEPS ? "Finish" : "Next";
    obNext.className = obStep === OB_FORM_STEPS ? "ob-finish" : "ob-next";
    obErr.textContent = "";
    obPrevStep = obStep;
  }
  function seedOnboarding(existing) {
    obStep = 1;
    obPendingAvatarFile = null;
    obPendingAvatarUrl = null;
    const avatarSeed = (existing && existing.avatar_url) || (me && me.avatar_url) || "";
    obAvatarPreview.src = avatarSeed;
    obAvatarPreview.style.visibility = avatarSeed ? "" : "hidden";
    obUsername.value = (existing && existing.username) || (me && me.username && me.username !== "User" ? me.username : "");
    obBio.value = (existing && existing.bio) || "";
    // Prefer the new `pronouns` column; fall back to the legacy `gender` value
    // so partially-migrated profiles don't appear empty during onboarding edit.
    obPronouns.value = (existing && (existing.pronouns != null ? existing.pronouns : existing.gender)) || "";
    obRegion.value = (existing && existing.region) || "";
    // Password step: always start empty (never re-surface a previously-typed
    // password). Newsletter opt-in preloads from existing profile, if any.
    if (obPassword) obPassword.value = "";
    if (obPasswordConfirm) obPasswordConfirm.value = "";
    if (obNewsletter) obNewsletter.checked = !!(existing && existing.newsletter_opt_in);
    _updatePasswordChecklistUI();
  }
  // Shared helper: set the onboarding error bar. The `.err` div already
  // picks up form-error styling via CSS; this helper just centralizes the
  // pattern and scrolls the message into view.
  function showObError(msg) {
    if (!obErr) return;
    obErr.textContent = String(msg || "");
    if (msg) { try { obErr.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch(_){} }
  }
  function hideObError() { if (obErr) obErr.textContent = ""; }
  function startOnboarding(existing) {
    seedOnboarding(existing);
    renderOnboarding();
    showOnboarding();
  }
  function validateOnboardingStep(step) {
    if (step === 2) {
      const v = (obUsername.value || "").trim();
      if (!v) return "Username is required.";
      if (!isValidUsername(v)) return USERNAME_LENGTH_MESSAGE;
    }
    if (step === 6) {
      // Password step — every requirement must pass.
      const pw = (obPassword && obPassword.value) || "";
      const cp = (obPasswordConfirm && obPasswordConfirm.value) || "";
      if (!pw) return "Please create a password to finish signing up.";
      const ok = _pwdRulesPass(pw);
      if (!ok.allMet) return "Password doesn't meet all the requirements below.";
      if (pw !== cp) return "Passwords don't match.";
    }
    return null;
  }
  obBack.addEventListener("click", () => {
    // Back cannot re-enter the verification screen and cannot leave it.
    if (obStep > 1 && obStep <= OB_FORM_STEPS) { obStep -= 1; renderOnboarding(); }
  });
  obNext.addEventListener("click", async () => {
    if (obStep >= OB_STEPS) return;
    const err = validateOnboardingStep(obStep);
    if (err) { obErr.textContent = err; return; }
    if (obStep < OB_FORM_STEPS) { obStep += 1; renderOnboarding(); return; }
    await finishOnboarding();
  });
  obSkip.addEventListener("click", async () => {
    obErr.textContent = "";
    obSkip.disabled = true; obNext.disabled = true; obBack.disabled = true;
    try {
      if (obPendingAvatarUrl) { try { URL.revokeObjectURL(obPendingAvatarUrl); } catch(_){} }
      obPendingAvatarFile = null; obPendingAvatarUrl = null;
      showChat();
      await loadHistory();
      subscribeRealtime();
      initDmSidePanel();
      if (typeof initGroups === "function") initGroups();
      inputEl.focus();
    } finally {
      obSkip.disabled = false; obNext.disabled = false;
      obBack.disabled = obStep === 1;
    }
  });
  obAvatarPick.addEventListener("click", () => obAvatarInput.click());
  obAvatarInput.addEventListener("change", () => {
    const f = obAvatarInput.files && obAvatarInput.files[0];
    obAvatarInput.value = "";
    if (!f) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(f.type)) { obErr.textContent = "Unsupported image type."; return; }
    if (f.size > 8 * 1024 * 1024) { obErr.textContent = "Image too large (max 8 MB)."; return; }
    if (obPendingAvatarUrl) { try { URL.revokeObjectURL(obPendingAvatarUrl); } catch(_){} }
    obPendingAvatarFile = f;
    obPendingAvatarUrl = URL.createObjectURL(f);
    obAvatarPreview.src = obPendingAvatarUrl;
    obAvatarPreview.style.visibility = "";
    obErr.textContent = "";
  });

  // ---------- Password step wiring ----------
  // Live checklist + strength meter update on every input event. The
  // generator button fills both fields with the same safe password and
  // re-runs the UI update so the user sees all five rules tick green.
  if (obPassword) {
    obPassword.addEventListener("input", () => {
      _updatePasswordChecklistUI();
      // Clear any prior error as the user starts fixing it.
      if (obErr && obErr.textContent) obErr.textContent = "";
    });
  }
  if (obPasswordConfirm) {
    obPasswordConfirm.addEventListener("input", () => {
      _updatePasswordChecklistUI();
      if (obErr && obErr.textContent) obErr.textContent = "";
    });
  }
  // Show/hide password toggles — swap input type and re-emit the icon.
  function _wirePasswordToggle(btn, input) {
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      btn.setAttribute("title", showing ? "Show password" : "Hide password");
    });
  }
  _wirePasswordToggle(obPasswordToggle, obPassword);
  _wirePasswordToggle(obPasswordConfirmToggle, obPasswordConfirm);
  // Generator: fills both fields with a safe, requirements-meeting password
  // and temporarily reveals them so the user can see + copy it.
  if (obPasswordGenerate) {
    obPasswordGenerate.addEventListener("click", () => {
      const pw = _generateSecurePassword(20);
      if (obPassword) { obPassword.value = pw; obPassword.type = "text"; if (obPasswordToggle) { obPasswordToggle.setAttribute("aria-label", "Hide password"); obPasswordToggle.setAttribute("title", "Hide password"); } }
      if (obPasswordConfirm) { obPasswordConfirm.value = pw; obPasswordConfirm.type = "text"; if (obPasswordConfirmToggle) { obPasswordConfirmToggle.setAttribute("aria-label", "Hide password"); obPasswordConfirmToggle.setAttribute("title", "Hide password"); } }
      _updatePasswordChecklistUI();
      if (obErr && obErr.textContent) obErr.textContent = "";
    });
  }

  async function uploadAvatarFile(file) {
    if (!file || !me) return null;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const path = `avatars/${me.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext || "png"}`;
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type
    });
    if (error) { console.error("[Error] Avatar upload failed", error); return null; }
    const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return (data && data.publicUrl) || null;
  }

  // ---------- Live username checker ----------
  // Debounced availability check while the user types in step 2. Renders:
  //   - "Checking…"           (spinner)      while the request is inflight
  //   - "Username available"  (green check)  if no other user owns the name
  //   - "Username is taken"   (red cross)    if any other user owns it
  //   - validation hint (red) for length errors from isValidUsername()
  // A monotonic request counter guarantees late responses cannot overwrite
  // fresher results.
  const OB_USERNAME_DEBOUNCE_MS = 350;
  let obUsernameCheckTimer = null;
  let obUsernameCheckSeq = 0;
  let obUsernameLastResult = null; // "ok" | "err" | "checking" | null

  const _svgCheck  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  const _svgCross  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const _svgSpin   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56" opacity="0.9"/></svg>';

  function _setUsernameState(kind, message) {
    const stateEl = document.getElementById("ob-username-state");
    const msgEl   = document.getElementById("ob-username-msg");
    const input   = obUsername;
    if (!stateEl || !msgEl || !input) return;
    input.classList.remove("checking", "ok", "err");
    stateEl.classList.remove("show", "checking", "ok", "err");
    msgEl.classList.remove("ok", "err");
    obUsernameLastResult = kind || null;
    if (!kind) {
      stateEl.innerHTML = "";
      msgEl.textContent = "";
      return;
    }
    if (kind === "checking") {
      stateEl.innerHTML = _svgSpin;
      stateEl.classList.add("show", "checking");
      input.classList.add("checking");
      msgEl.textContent = message || "Checking availability…";
    } else if (kind === "ok") {
      stateEl.innerHTML = _svgCheck;
      stateEl.classList.add("show", "ok");
      input.classList.add("ok");
      msgEl.classList.add("ok");
      msgEl.textContent = message || "Username available";
    } else if (kind === "err") {
      stateEl.innerHTML = _svgCross;
      stateEl.classList.add("show", "err");
      input.classList.add("err");
      msgEl.classList.add("err");
      msgEl.textContent = message || "Username is taken";
    }
  }

  // PostgREST's `ilike` uses SQL LIKE semantics: the characters `%`, `_` and
  // `\` are wildcards inside the pattern. Users CAN put those (and any other
  // unicode) in a username since we allow all characters; we must escape
  // them before building the filter so the check matches exactly the typed
  // value and doesn't accidentally wildcard-match unrelated rows.
  function _escapeLikePattern(s) {
    return String(s).replace(/([\\%_])/g, "\\$1");
  }

  async function runUsernameCheck(value, seq) {
    try {
      const pattern = _escapeLikePattern(value);
      const { data, error } = await sb.from("profiles")
        .select("user_id,username")
        .ilike("username", pattern)
        .limit(2);
      if (seq !== obUsernameCheckSeq) return; // a newer keystroke supersedes us
      if (error) {
        // Network/RLS/query issue — don't lie about availability. Surface a
        // clear, non-blocking message so the user knows why the indicator
        // isn't turning green. They can still proceed; the server-side
        // unique constraint + finishOnboarding validation is the source of
        // truth.
        console.warn("[Username] availability check failed", error);
        _setUsernameState("err", "Couldn't check availability right now. You can still continue.");
        return;
      }
      const mine = me && me.id;
      const rows = Array.isArray(data) ? data : [];
      const takenByOther = rows.some(r => r && r.user_id !== mine);
      if (takenByOther) _setUsernameState("err", "Username is taken");
      else              _setUsernameState("ok",  "Username available");
    } catch (e) {
      if (seq !== obUsernameCheckSeq) return;
      console.warn("[Username] availability check threw", e);
      // Never freeze or disappear the UI on a thrown error — show a clear
      // fallback so the user knows they can still proceed.
      _setUsernameState("err", "Couldn't check availability right now. You can still continue.");
    }
  }

  if (obUsername) {
    obUsername.addEventListener("input", () => {
      // Wrapped in try/catch so a bad value / thrown DOM error can never
      // brick the input. The user can always keep typing.
      try {
        const raw = obUsername.value || "";
        const v = raw.trim();
        // Clear pending request.
        if (obUsernameCheckTimer) { clearTimeout(obUsernameCheckTimer); obUsernameCheckTimer = null; }
        obUsernameCheckSeq += 1;
        if (!v) { _setUsernameState(null); return; }
        // Local validation first — don't spam the server with obvious fails.
        if (typeof isValidUsername === "function" && !isValidUsername(v)) {
          _setUsernameState("err", typeof USERNAME_LENGTH_MESSAGE === "string" ? USERNAME_LENGTH_MESSAGE : "Username must be 3–32 characters.");
          return;
        }
        _setUsernameState("checking");
        const seq = obUsernameCheckSeq;
        obUsernameCheckTimer = setTimeout(() => {
          // setTimeout wrapper itself must never throw — belt-and-suspenders.
          try { runUsernameCheck(v, seq); } catch (err) {
            console.warn("[Username] runUsernameCheck scheduling error", err);
            _setUsernameState("err", "Couldn't check availability right now. You can still continue.");
          }
        }, OB_USERNAME_DEBOUNCE_MS);
      } catch (err) {
        console.warn("[Username] input handler error", err);
        // Never swallow the input: keep the state unchanged rather than
        // blowing away the user's typed value or showing a stale spinner.
        _setUsernameState(null);
      }
    });
    // Resetting state when the step is reseeded (e.g. returning from back).
    obUsername.addEventListener("blur", () => {/* keep last result visible */});
  }

  // Case-insensitive uniqueness precheck against profiles.username.
  // Returns true if the username is available (or already owned by the
  // current user). Network errors don't block submit — we still let the
  // DB unique index be the ultimate source of truth.
  async function isUsernameAvailable(name) {
    const v = (name || "").trim();
    if (!v) return false;
    try {
      const { data, error } = await sb.from("profiles")
        .select("user_id,username")
        .ilike("username", v)
        .limit(2);
      if (error) { console.warn("[Warning] Username precheck failed", error); return true; }
      if (!Array.isArray(data) || !data.length) return true;
      const mine = me && me.id;
      return data.every(row => row && row.user_id === mine);
    } catch (e) {
      console.warn("[Warning] Username precheck threw", e);
      return true;
    }
  }

  function isDuplicateUsernameError(err) {
    if (!err) return false;
    const code = err.code || "";
    const blob = ((err.message || "") + " " + (err.details || "")).toLowerCase();
    return code === "23505" && /username/.test(blob);
  }

  async function finishOnboarding() {
    obErr.textContent = "";
    obNext.disabled = true; obBack.disabled = true;
    const prevLabel = obNext.textContent;
    obNext.textContent = "Saving…";
    try {
      const username = (obUsername.value || "").trim();
      // Uniqueness precheck (case-insensitive) — friendly error if taken.
      const available = await isUsernameAvailable(username);
      if (!available) {
        obErr.textContent = "That username is already taken. Please choose another.";
        obStep = 2; renderOnboarding();
        try { obUsername.focus(); obUsername.select && obUsername.select(); } catch(_) {}
        return;
      }

      // ====================================================================
      // PRE-AUTH SIGNUP BRANCH
      // If _pendingSignup is set, we're in the onboarding-first flow: the
      // user submitted email + captcha on the auth page, but we haven't
      // called sb.auth.signUp yet. Do it now, stash the profile data in
      // user_metadata.pending_profile so onSignedIn can hydrate it post-
      // verification, and hand off to the verify modal.
      // ====================================================================
      if (_pendingSignup) {
        const pendingProfile = {
          username,
          bio: (obBio.value || "").trim() || null,
          pronouns: (obPronouns.value || "").trim() || null,
          region: (obRegion.value || "").trim() || null
          // avatar_url intentionally omitted — avatar requires an authed
          // upload which can't happen pre-session. The File blob is kept in
          // _pendingProfile.avatarFile (in-memory only) and uploaded by
          // onSignedIn if the user verifies in this same browser window.
        };
        _pendingProfile = Object.assign({ avatarFile: obPendingAvatarFile || null }, pendingProfile);

        const { email } = _pendingSignup;
        // Use the password the user entered on the password step (step 6).
        // No more auto-generated random passwords: the user picked this
        // password and they'll use it to sign back in.
        const userPw = (obPassword && obPassword.value) || "";
        // Defense-in-depth: validation already ran in validateOnboardingStep,
        // but re-check before sending to Supabase in case of any tampering.
        const rulesCheck = _pwdRulesPass(userPw);
        if (!userPw || !rulesCheck.allMet || userPw !== ((obPasswordConfirm && obPasswordConfirm.value) || "")) {
          showObError("Password doesn't meet the requirements or passwords don't match.");
          return;
        }
        const wantsNewsletter = !!(obNewsletter && obNewsletter.checked);
        pendingProfile.newsletter_opt_in = wantsNewsletter;
        _pendingProfile.newsletter_opt_in = wantsNewsletter;
        obNext.textContent = "Creating account…";
        try {
          const { data, error } = await sb.auth.signUp({
            email, password: userPw,
            options: {
              emailRedirectTo: window.location.origin + window.location.pathname,
              data: { pending_profile: pendingProfile }
            }
          });
          if (error) throw error;
          // If confirm-email is OFF in the dashboard, Supabase auto-signs in
          // here (data.session is set). onSignedIn will fire via the auth
          // state listener and hydrate the profile. If confirm-email is ON
          // (expected), data.session is null and the user must click the
          // verification link before their session materializes.
          const autoSignedIn = !!(data && data.session);
          if (!autoSignedIn) {
            // Show the fullscreen verify modal. `me` is null because we
            // have no session yet — set the force flag so updateVerifyBanner
            // opens the modal anyway. The email chip pulls from the pending
            // signup so it shows the address they typed.
            _forcePendingVerifyModal = true;
            try { myEmail = email; } catch(_) {}
            try { hideOnboarding(); } catch(_) {}
            try { showChat(); } catch(_) {}
            updateVerifyBanner();
            // Supabase already sent the confirmation email as part of
            // signUp — do NOT call resend here or it will trigger the
            // 120 s cooldown and the "already-registered" auto-suppression
            // path. The user will click the link in their inbox.
          }
          _pendingSignup = null;
        } catch (signupErr) {
          console.error("[Signup] signUp failed", signupErr);
          const raw = String((signupErr && signupErr.message) || signupErr || "");
          let msg = formatSbError(signupErr, "Could not create account.");
          if (/already\s*registered|already\s*exists|user\s+already/i.test(raw)) {
            msg = "This email is already registered. Please sign in instead.";
            _pendingSignup = null;
            _pendingProfile = null;
            try { hideOnboarding(); } catch(_) {}
            try { showLogin(); } catch(_) {}
            setAuthMode("signin");
            setLoginError(msg);
            refreshAuthTermsState();
            return;
          }
          obErr.textContent = msg;
          obNext.textContent = "Finish";
          return;
        }
        return; // pre-auth path complete; onSignedIn handles the rest post-verify
      }
      // ====================================================================
      // END pre-auth branch. Code below runs for:
      //   - OAuth (Google) users mid-onboarding
      //   - Existing users completing onboarding after signin
      // ====================================================================

      let avatarUrl = (me && me.avatar_url) || "";
      if (obPendingAvatarFile) {
        const uploaded = await uploadAvatarFile(obPendingAvatarFile);
        if (uploaded) avatarUrl = uploaded;
        else { obErr.textContent = "Avatar upload failed. Try again."; return; }
      }
      // Fix 2 — persist the default image when the user skips avatar
      // upload so their profile row never has a NULL avatar_url.
      if (!avatarUrl) avatarUrl = DEFAULT_AVATAR_URL;
      me.username = username;
      me.avatar_url = avatarUrl;
      // Newsletter opt-in is collected on the password step. For OAuth
      // users (already authed when they hit onboarding) this is the only
      // moment we have it — save it to the profile right now.
      const wantsNewsletter = !!(obNewsletter && obNewsletter.checked);
      // If the user entered a password on step 6 (which OAuth users also
      // see), update their Supabase auth password so they can sign in
      // with email/password later if they want to. Failures are non-fatal
      // — the account is already authed via OAuth.
      if (obPassword && obPassword.value) {
        const pw = obPassword.value;
        const cp = (obPasswordConfirm && obPasswordConfirm.value) || "";
        const rulesCheck = _pwdRulesPass(pw);
        if (!rulesCheck.allMet) { showObError("Password doesn't meet all the requirements."); return; }
        if (pw !== cp) { showObError("Passwords don't match."); return; }
        try {
          const { error: pwErr } = await sb.auth.updateUser({ password: pw });
          if (pwErr) console.warn("[Warning] Failed to set password on OAuth account", pwErr);
        } catch (e) { console.warn("[Warning] updateUser(password) threw", e); }
      }
      let saved;
      try {
        saved = await upsertOwnProfile({
          username,
          avatar_url: avatarUrl,
          bio: (obBio.value || "").trim() || null,
          pronouns: (obPronouns.value || "").trim() || null,
          region: (obRegion.value || "").trim() || null,
          newsletter_opt_in: wantsNewsletter
        });
      } catch (upErr) {
        if (isDuplicateUsernameError(upErr)) {
          obErr.textContent = "That username is already taken. Please choose another.";
          obStep = 2; renderOnboarding();
          try { obUsername.focus(); obUsername.select && obUsername.select(); } catch(_) {}
          return;
        }
        throw upErr;
      }
      if (!saved) { obErr.textContent = "Could not save profile. Try again."; return; }
      applyMeFromProfile(saved);
      if (obPendingAvatarUrl) { try { URL.revokeObjectURL(obPendingAvatarUrl); } catch(_){} }
      obPendingAvatarFile = null; obPendingAvatarUrl = null;

      // Check if the signed-in user's email is already verified — e.g. OAuth
      // providers set email_confirmed_at immediately. If so, skip the gate
      // and proceed straight into the app.
      const verified = await refreshEmailVerifiedFromSession();
      if (verified) {
        showChat();
        await loadHistory();
        subscribeRealtime();
        initDmSidePanel();
        if (typeof initGroups === "function") initGroups();
        inputEl.focus();
        return;
      }
      // Not verified → hand off to the fullscreen verification modal.
      // The modal is the sole post-signup verification surface; it blurs
      // the chat shell behind it and cannot be dismissed until the user
      // clicks the link in their inbox.
      try { hideOnboarding(); } catch(_) {}
      try { showChat(); } catch(_) {}
      updateVerifyBanner();                // opens the modal + starts polling
      triggerVerificationEmail(false).catch(() => {}); // initial auto-resend
    } catch (err) {
      console.error("[Error] Onboarding save failed", err);
      obErr.textContent = formatSbError(err, "Could not save profile.");
    } finally {
      obNext.disabled = false; obBack.disabled = obStep === 1;
      obNext.textContent = prevLabel;
    }
  }

  // ---------- Email verification gate ----------
  // Sourced from `session.user.email_confirmed_at` — Supabase's canonical
  // verification flag. Recomputed on every auth state change + after each
  // resend / refresh tick. The backend is still the source of truth; the
  // frontend gating is a UX shortcut that prevents obviously invalid writes.
  let myEmailVerified = false;
  let myEmail = "";

  async function refreshEmailVerifiedFromSession() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const u = session && session.user;
      if (!u) { myEmailVerified = false; myEmail = ""; return false; }
      myEmail = u.email || "";
      const confirmed = !!(u.email_confirmed_at || u.confirmed_at || (u.user_metadata && u.user_metadata.email_verified));
      myEmailVerified = confirmed;
      return confirmed;
    } catch (e) {
      console.warn("[Warning] refreshEmailVerified failed", e);
      return myEmailVerified;
    }
  }

  function paintVerifyScreen() {
    const emailEl = document.getElementById("ob-verify-email");
    if (emailEl) emailEl.textContent = myEmail || "your email";
    const status = document.getElementById("ob-verify-status");
    if (status) { status.textContent = ""; status.className = "ob-verify-status"; }
  }

  // Fullscreen verification modal controller. Name preserved from prior
  // implementation (was an inline sticky banner) so call sites across the
  // file don't need to change; internally now opens / closes the modal.
  function updateVerifyBanner() {
    const modal    = document.getElementById("verify-modal");
    const emailEl  = document.getElementById("verify-modal-email");
    if (modal) {
      // Open the modal when:
      //   (a) a verified-lacking user is signed in (standard case), OR
      //   (b) we're mid-signup waiting for confirm-email (no session yet;
      //       _forcePendingVerifyModal flag set in finishOnboarding).
      const shouldShow = (me && !myEmailVerified) || _forcePendingVerifyModal;
      if (shouldShow) {
        if (emailEl) emailEl.textContent = myEmail || "your email";
        modal.classList.add("open");
        document.body.classList.add("vm-locked");
        // Ensure the modal actually sits over something, not a blank screen:
        // if the user is mid-onboarding or mid-login when the gate fires,
        // drop them onto the chat shell as the backdrop. The 3-layer hard
        // lock + RLS prevent any interaction with that shell.
        try { if (typeof onboardingEl !== "undefined" && onboardingEl) onboardingEl.style.display = "none"; } catch(_) {}
        try { if (typeof chatEl !== "undefined" && chatEl && chatEl.style.display === "none" && typeof showChat === "function") showChat(); } catch(_) {}
        try { startVerifyPolling(); } catch(_) {}
        _resetVerifyModalButtons();
        _startResendCooldownIfNeeded();
      } else {
        modal.classList.remove("open");
        document.body.classList.remove("vm-locked");
        try { stopVerifyPolling(); } catch(_) {}
        _stopResendCooldown();
        _resetVerifyModalButtons();
        const status = document.getElementById("verify-modal-status");
        if (status) { status.textContent = ""; status.className = "verify-modal-status"; }
      }
    }
    try { if (typeof updateSendDisabled === "function") updateSendDisabled(); } catch(_) {}
    applyVerifyLock();
  }

  // Resets the primary / secondary buttons back to their idle state. Called
  // after any transient success / error / loading state in the modal.
  function _resetVerifyModalButtons() {
    const primary = document.getElementById("verify-modal-verified");
    if (primary) {
      primary.disabled = false;
      primary.classList.remove("error", "ok");
      const lbl = primary.querySelector(".vm-label");
      if (lbl) lbl.textContent = "I've Verified";
    }
  }

  // ---- Resend cooldown (120 s) ----
  // Tracked via a timestamp so the countdown survives re-renders and late
  // clicks; also persisted to sessionStorage so a page refresh doesn't
  // reset the cooldown (defense against resend-spam via reload).
  const VM_COOLDOWN_MS   = 120_000;
  const VM_COOLDOWN_KEY  = "relay.verify.resendCooldownUntil";
  let _vmCooldownEndsAt  = (() => {
    try { return parseInt(sessionStorage.getItem(VM_COOLDOWN_KEY) || "0", 10) || 0; } catch(_) { return 0; }
  })();
  let _vmCooldownTimer   = null;

  function _persistCooldown(until) {
    _vmCooldownEndsAt = until;
    try {
      if (until && until > Date.now()) sessionStorage.setItem(VM_COOLDOWN_KEY, String(until));
      else sessionStorage.removeItem(VM_COOLDOWN_KEY);
    } catch(_) {}
  }

  function _startResendCooldownIfNeeded() {
    if (_vmCooldownEndsAt > Date.now()) {
      _tickVmCooldown();
    }
  }

  function _beginResendCooldown() {
    _persistCooldown(Date.now() + VM_COOLDOWN_MS);
    _tickVmCooldown();
  }

  function _stopResendCooldown() {
    if (_vmCooldownTimer) { clearInterval(_vmCooldownTimer); _vmCooldownTimer = null; }
    _persistCooldown(0);
    const btn = document.getElementById("verify-modal-resend");
    if (btn) {
      btn.disabled = false;
      const lbl = btn.querySelector(".vm-resend-label");
      if (lbl) lbl.textContent = "Resend Email";
    }
  }

  function _tickVmCooldown() {
    const render = () => {
      const btn = document.getElementById("verify-modal-resend");
      const ms  = _vmCooldownEndsAt - Date.now();
      if (ms <= 0) { _stopResendCooldown(); return; }
      const sec = Math.ceil(ms / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      const label = "Resend available in " + m + ":" + (s < 10 ? "0" + s : s);
      if (btn) {
        btn.disabled = true;
        const lbl = btn.querySelector(".vm-resend-label");
        if (lbl) lbl.textContent = label;
      }
    };
    render();
    if (_vmCooldownTimer) clearInterval(_vmCooldownTimer);
    _vmCooldownTimer = setInterval(render, 500);
  }

  // Hard-lock every composer surface when the signed-in user is unverified.
  // Defense-in-depth beneath the modal: if a user removes the modal via
  // DevTools, the composer is still `disabled` + `readonly` + has a
  // capture-phase key/paste/drop guard. Backend RLS is the ultimate gate.
  const _lockSelectors = [
    "#input", "#send", "#upload-btn", "#main-emoji-btn", "#file-input",
    "#dm-room-input", "#dm-room-send", "#dm-attach-btn", "#dm-emoji-btn", "#dm-file-input",
    "#group-room-input", "#group-room-send", "#group-attach-btn", "#group-emoji-btn", "#group-file-input"
  ];
  const _lockComposerSelectors = [".composer-wrap .composer", ".dm-composer-wrap .dm-composer"];

  // Third independent lock layer: swallow any keyboard / paste / drop event
  // that reaches a composer input while unverified. Even if `disabled` and
  // `readonly` were both stripped via DevTools, this capture-phase listener
  // still fires. Added once; the runtime check reads live `myEmailVerified`.
  let _verifyKeyGuardInstalled = false;
  function _installVerifyKeyGuard() {
    if (_verifyKeyGuardInstalled) return;
    _verifyKeyGuardInstalled = true;
    const composerInputIds = new Set(["input", "dm-room-input", "group-room-input"]);
    const swallow = (e) => {
      if (!me || myEmailVerified) return;
      const t = e.target;
      if (!t || !t.id || !composerInputIds.has(t.id)) return;
      // Allow Tab/Escape/arrow keys so keyboard nav still works; block
      // anything that could produce or delete content.
      if (e.type === "keydown") {
        const k = e.key || "";
        if (k === "Tab" || k === "Escape" || k.startsWith("Arrow") || k === "Shift" || k === "Control" || k === "Alt" || k === "Meta") return;
      }
      e.preventDefault();
      e.stopPropagation();
      try { toast("Verify your email to start chatting.", "warn"); } catch(_){}
      try { updateVerifyBanner(); } catch(_){}
    };
    document.addEventListener("keydown", swallow, true);
    document.addEventListener("beforeinput", swallow, true);
    document.addEventListener("paste", swallow, true);
    document.addEventListener("drop", swallow, true);
  }

  function applyVerifyLock() {
    _installVerifyKeyGuard();
    const locked = !!(me && !myEmailVerified);
    // Composer containers: dim + blur + block pointer events via CSS.
    _lockComposerSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.classList.toggle("locked", locked));
    });
    // Per-element disable (idempotent). NOTE: we intentionally no longer
    // swap the placeholder to a warning string — the modal is now the sole
    // UX surface that explains the lock. The original placeholder stays.
    _lockSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (locked) {
          if (!el.dataset.verifyLocked) {
            el.dataset.verifyLocked = "1";
            el.dataset.verifyPrevDisabled = el.disabled ? "1" : "0";
          }
          el.disabled = true;
          el.setAttribute("aria-disabled", "true");
          // Second independent lock: `readonly` still blocks typing even if
          // someone removes `disabled` via DevTools.
          if ("readOnly" in el) { try { el.readOnly = true; } catch(_){} }
          try { el.setAttribute("tabindex", "-1"); } catch(_){}
        } else if (el.dataset.verifyLocked) {
          el.dataset.verifyLocked = "";
          const prev = el.dataset.verifyPrevDisabled === "1";
          el.disabled = prev;
          el.removeAttribute("aria-disabled");
          if ("readOnly" in el) { try { el.readOnly = false; } catch(_){} }
          try { el.removeAttribute("tabindex"); } catch(_){}
        }
      });
    });
  }

  // Maps common Supabase auth / SMTP errors to actionable user-facing copy.
  // Returns { text, ok } where ok=true means the "error" is actually a
  // non-problem (e.g. email already confirmed).
  function _mapResendError(err) {
    const msg = ((err && (err.message || err.error_description || err.error)) || "").toString();
    const status = (err && (err.status || err.statusCode)) || 0;
    const lower = msg.toLowerCase();
    if (/already (confirmed|verified)/.test(lower)) {
      return { ok: true, text: "Your email is already verified." };
    }
    if (/rate limit|too many|email rate/.test(lower) || status === 429) {
      return { ok: false, text: "Too many resend attempts. Please wait a minute and try again." };
    }
    if (/smtp|mailer|send ?mail/.test(lower) || status === 500) {
      return { ok: false, text: "Email service is not responding. Ask the admin to check the SMTP configuration." };
    }
    if (/signup.*disabled|email.*disabled|provider.*disabled/.test(lower)) {
      return { ok: false, text: "Email signup is disabled in Supabase. Enable it in Authentication → Providers → Email." };
    }
    if (/no (user|email)|user not found/.test(lower)) {
      return { ok: false, text: "No account found for this email. Try signing up again." };
    }
    if (!msg) return { ok: false, text: "Could not resend right now. Please try again shortly." };
    return { ok: false, text: msg };
  }

  // Small helper to set modal status line with a class variant.
  function _vmSetStatus(text, cls) {
    const status = document.getElementById("verify-modal-status");
    if (!status) return;
    status.className = "verify-modal-status" + (cls ? " " + cls : "");
    status.textContent = text || "";
  }

  async function triggerVerificationEmail(manual) {
    const btn = document.getElementById("verify-modal-resend");
    const now = Date.now();
    // Hard 120s cooldown — same timestamp used by the countdown renderer.
    if (manual && _vmCooldownEndsAt > now) {
      const sec = Math.ceil((_vmCooldownEndsAt - now) / 1000);
      const m = Math.floor(sec / 60), s = sec % 60;
      _vmSetStatus("Please wait " + m + ":" + (s < 10 ? "0" + s : s) + " before resending.", "err");
      return;
    }
    if (btn) {
      btn.disabled = true;
      const lbl = btn.querySelector(".vm-resend-label");
      if (lbl) lbl.textContent = "Sending…";
    }
    _vmSetStatus("Sending verification email…", "");
    try {
      if (!myEmail) { await refreshEmailVerifiedFromSession(); }
      if (!myEmail) throw new Error("No email on file — please sign in again.");
      // `resend` triggers Supabase to (re)send the signup confirmation link.
      // Requires "Confirm email" to be enabled in Authentication → Providers → Email.
      // Check the Supabase "Logs → Auth" view to confirm the email was queued.
      const { error } = await sb.auth.resend({
        type: "signup",
        email: myEmail,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      _vmSetStatus("Verification email sent to " + myEmail + ". Check your inbox (and spam).", "ok");
      // Start the 2-minute cooldown only on a confirmed successful send.
      _beginResendCooldown();
    } catch (err) {
      console.warn("[Warning] resend failed", err);
      const mapped = _mapResendError(err);
      if (mapped.ok) {
        // Treat "already confirmed" as a soft success — refresh the session
        // so the gate actually unlocks.
        _vmSetStatus(mapped.text, "ok");
        try { await checkVerifiedAndEnter(false); } catch(_) {}
      } else {
        _vmSetStatus(mapped.text, "err");
        // No cooldown on failure — let them retry immediately.
        if (btn) {
          btn.disabled = false;
          const lbl = btn.querySelector(".vm-resend-label");
          if (lbl) lbl.textContent = "Resend Email";
        }
      }
    }
  }

  async function checkVerifiedAndEnter(fromManual) {
    const primary = document.getElementById("verify-modal-verified");
    const setBtn = (html, opts) => {
      if (!primary) return;
      primary.classList.remove("error", "ok");
      if (opts && opts.ok)    primary.classList.add("ok");
      if (opts && opts.error) primary.classList.add("error");
      primary.disabled = !!(opts && opts.disabled);
      const lbl = primary.querySelector(".vm-label");
      if (lbl) lbl.innerHTML = html;
    };
    if (fromManual) {
      setBtn('<span class="vm-spinner" aria-hidden="true"></span> Checking…', { disabled: true });
      _vmSetStatus("Checking verification status…", "");
    }
    // Force a fresh user object (getUser hits the server) so email_confirmed_at is current.
    try { await sb.auth.getUser(); } catch(_) {}
    try { await sb.auth.refreshSession(); } catch(_) {}
    const ok = await refreshEmailVerifiedFromSession();
    if (ok) {
      setBtn('<svg class="vm-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Verified', { disabled: true, ok: true });
      _vmSetStatus("Email verified — entering Relay…", "ok");
      stopVerifyPolling();
      // Brief pause so the user sees the success state, then hand off to chat.
      setTimeout(() => {
        try { updateVerifyBanner(); } catch(_) {} // closes the modal
        try { showChat(); } catch(_) {}
        try { loadHistory(); } catch(_) {}
        try { subscribeRealtime(); } catch(_) {}
        try { initDmSidePanel(); } catch(_) {}
        if (typeof initGroups === "function") { try { initGroups(); } catch(_) {} }
        try { inputEl.focus(); } catch(_) {}
        try { updateSendDisabled(); } catch(_) {}
      }, 550);
      return true;
    }
    if (fromManual) {
      setBtn('<svg class="vm-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Not Verified', { error: true });
      // Pre-auth case: no session exists in THIS browser, so even a verified
      // email won't auto-detect here (the confirmation link sets the session
      // only in the browser where it's clicked). Tell the user explicitly.
      if (_forcePendingVerifyModal && !me) {
        _vmSetStatus("If you verified on another device, return to the sign-in page to log in.", "err");
      } else {
        _vmSetStatus("Still not verified. Click the link in your inbox and try again.", "err");
      }
      // Revert the button to its idle state after a moment so the user can retry.
      setTimeout(() => {
        setBtn("I've Verified", {});
        const status = document.getElementById("verify-modal-status");
        if (status && status.classList.contains("err")) _vmSetStatus("", "");
      }, 2600);
    }
    return false;
  }

  function startVerifyPolling() {
    stopVerifyPolling();
    obVerifyPollTimer = setInterval(() => {
      checkVerifiedAndEnter(false).catch(() => {});
    }, 5000);
  }
  function stopVerifyPolling() {
    if (obVerifyPollTimer) { clearInterval(obVerifyPollTimer); obVerifyPollTimer = null; }
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;
    const within = (sel) => t.id === sel.replace("#", "") || (t.closest && t.closest(sel));
    // New fullscreen verify modal
    if (within("#verify-modal-resend")) {
      e.preventDefault();
      triggerVerificationEmail(true);
    } else if (within("#verify-modal-verified")) {
      e.preventDefault();
      checkVerifiedAndEnter(true);
    }
  });

  // ---------- Typing indicator (shared, ephemeral) ----------
  // A small reusable manager used by public chat, DMs, and groups.
  // Sends `typing:start` / `typing:stop` as Supabase Realtime broadcast
  // events (NOT persisted to any database table). Locally debounced so
  // holding down a key doesn't spam the channel. Remote typers are
  // auto-expired if no refresh arrives, so stuck indicators cannot occur.
  function createTypingManager(opts) {
    const DEBOUNCE_MS   = 1500;  // min gap between "start" broadcasts
    const LOCAL_STOP_MS = 3000;  // local idle → send "stop"
    const REMOTE_TTL_MS = 5000;  // remote typer auto-expire
    const typers = new Map();    // user_id -> { username, timer }
    let lastSentStart = 0;
    let localStopTimer = null;
    let typingLocally = false;

    function getEl(id) { return id ? document.getElementById(id) : null; }
    function indicatorEl() { return getEl(opts.indicatorId); }
    function textEl()      { return getEl(opts.textId); }

    function render() {
      const ind = indicatorEl(); const txt = textEl();
      if (!ind || !txt) return;
      const names = [];
      typers.forEach(v => { if (v && v.username) names.push(v.username); });
      if (!names.length) {
        ind.classList.remove("active");
        txt.textContent = "";
        return;
      }
      let label;
      if (names.length === 1)       label = names[0] + " is typing";
      else if (names.length <= 3)   label = names.join(", ") + " are typing";
      else                          label = "Several users are typing";
      txt.textContent = label;
      ind.classList.add("active");
    }

    function addRemote(userId, username) {
      if (!userId) return;
      const prev = typers.get(userId);
      if (prev && prev.timer) clearTimeout(prev.timer);
      const timer = setTimeout(() => {
        typers.delete(userId);
        render();
      }, REMOTE_TTL_MS);
      typers.set(userId, {
        username: (username && String(username).trim()) || (prev && prev.username) || "Someone",
        timer
      });
      render();
    }
    function removeRemote(userId) {
      if (!userId) return;
      const prev = typers.get(userId);
      if (prev && prev.timer) clearTimeout(prev.timer);
      typers.delete(userId);
      render();
    }

    function channel() { return opts.getChannel && opts.getChannel(); }
    function myId()    { return opts.getMyId && opts.getMyId(); }

    function sendStart() {
      const ch = channel(); const uid = myId();
      if (!ch || !uid) return;
      const username = (opts.getMyUsername && opts.getMyUsername()) || "Someone";
      try { ch.send({ type: "broadcast", event: "typing:start", payload: { user_id: uid, username } }); }
      catch (_) { /* swallow: typing is best-effort */ }
    }
    function sendStop() {
      const ch = channel(); const uid = myId();
      if (!ch || !uid) return;
      try { ch.send({ type: "broadcast", event: "typing:stop", payload: { user_id: uid } }); }
      catch (_) {}
    }

    function onLocalInput() {
      if (!myId()) return;
      // Only announce typing if there is at least 1 char queued. We DON'T
      // send "start" on every keystroke — debounced.
      const now = Date.now();
      if (now - lastSentStart > DEBOUNCE_MS) {
        lastSentStart = now;
        typingLocally = true;
        sendStart();
      }
      if (localStopTimer) clearTimeout(localStopTimer);
      localStopTimer = setTimeout(() => {
        if (typingLocally) { typingLocally = false; sendStop(); }
        lastSentStart = 0;
      }, LOCAL_STOP_MS);
    }
    function onLocalSend() {
      if (localStopTimer) { clearTimeout(localStopTimer); localStopTimer = null; }
      if (typingLocally) { typingLocally = false; sendStop(); }
      lastSentStart = 0;
    }
    function onLocalLeave() {
      // Fire a stop immediately (e.g., closing modal, signing out).
      if (localStopTimer) { clearTimeout(localStopTimer); localStopTimer = null; }
      if (typingLocally) { typingLocally = false; sendStop(); }
      lastSentStart = 0;
      clearAllRemote();
    }
    function clearAllRemote() {
      typers.forEach(v => { if (v && v.timer) clearTimeout(v.timer); });
      typers.clear();
      render();
    }
    function handleBroadcast(event, payload) {
      const uid = payload && payload.user_id;
      const me = myId();
      if (!uid || (me && uid === me)) return;
      if (event === "typing:start")     addRemote(uid, payload && payload.username);
      else if (event === "typing:stop") removeRemote(uid);
    }

    return {
      onLocalInput, onLocalSend, onLocalLeave,
      handleBroadcast, clearAllRemote, render
    };
  }

  // Public-chat typing manager instance (channel wired on subscribeRealtime).
  const publicTyping = createTypingManager({
    indicatorId: "typing-indicator",
    textId: "typing-text",
    getChannel: () => publicTypingChannel,
    getMyId: () => me && me.id,
    getMyUsername: () => (me && me.username) || ""
  });
  // DM room typing manager (per-room channel swapped out on room change so
  // indicators never leak between conversations).
  const dmTyping = createTypingManager({
    indicatorId: "dm-typing-indicator",
    textId: "dm-typing-text",
    getChannel: () => dmTypingChannel,
    getMyId: () => me && me.id,
    getMyUsername: () => (me && me.username) || ""
  });
  // Group room typing manager (per-group channel).
  const groupTyping = createTypingManager({
    indicatorId: "group-typing-indicator",
    textId: "group-typing-text",
    getChannel: () => groupTypingChannel,
    getMyId: () => me && me.id,
    getMyUsername: () => (me && me.username) || ""
  });

  // ---------- Composer ----------
  function updateSendDisabled() {
    if (isRestricted()) { sendBtn.disabled = true; return; }
    // Email-verification gate: unverified accounts cannot send.
    if (me && !myEmailVerified) { sendBtn.disabled = true; return; }
    const textOk = inputEl.value.trim().length > 0;
    sendBtn.disabled = !(textOk || pendingImage) || uploading;
  }
  inputEl.addEventListener("input", () => {
    updateSendDisabled();
    updateMentionBox();
    // Announce typing over ephemeral realtime (no DB writes).
    if (me && !isRestricted() && inputEl.value.length > 0) publicTyping.onLocalInput();
  });
  inputEl.addEventListener("keydown", (e) => {
    if (mentionState.open) {
      if (e.key === "ArrowDown") { e.preventDefault(); moveMentionSelection(1); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); moveMentionSelection(-1); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        if (mentionState.results.length) { e.preventDefault(); applyMention(mentionState.results[mentionState.index]); return; }
      }
      if (e.key === "Escape") { e.preventDefault(); closeMentionBox(); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  inputEl.addEventListener("blur", () => { setTimeout(closeMentionBox, 120); });

  // ----- Mention autocomplete -----
  const mentionState = { open: false, results: [], index: 0, start: -1, query: "" };
  let mentionSearchToken = 0;

  function detectMentionAtCursor() {
    const pos = inputEl.selectionStart || 0;
    const value = inputEl.value.slice(0, pos);
    const m = value.match(/(?:^|\s)@([A-Za-z0-9_.]{0,32})$/);
    if (!m) return null;
    return { start: pos - m[1].length - 1, query: m[1] };
  }

  function closeMentionBox() {
    mentionState.open = false;
    mentionState.results = [];
    mentionState.index = 0;
    mentionState.start = -1;
    mentionState.query = "";
    mentionBox.hidden = true;
    mentionBox.textContent = "";
  }

  async function updateMentionBox() {
    const ctx = detectMentionAtCursor();
    if (!ctx) { closeMentionBox(); return; }
    mentionState.start = ctx.start;
    mentionState.query = ctx.query;
    const token = ++mentionSearchToken;
    const query = sb.from("profiles").select("user_id, username, avatar_url").not("username", "is", null).limit(8);
    const q = ctx.query.trim();
    const { data, error } = q
      ? await query.ilike("username", q + "%")
      : await query.order("username", { ascending: true });
    if (token !== mentionSearchToken) return;
    if (error) { console.error("[Error] Mention search failed", error); closeMentionBox(); return; }
    const rows = (data || []).filter(r => r && r.username && (!me || r.user_id !== me.id));
    mentionState.results = rows;
    mentionState.index = 0;
    if (!rows.length) {
      mentionBox.hidden = false;
      mentionBox.textContent = "";
      const empty = document.createElement("div");
      empty.className = "mb-empty";
      empty.textContent = q ? "No users matching @" + q : "No users yet";
      mentionBox.appendChild(empty);
      mentionState.open = true;
      return;
    }
    renderMentionBox();
    mentionState.open = true;
    mentionBox.hidden = false;
  }

  function renderMentionBox() {
    mentionBox.textContent = "";
    mentionState.results.forEach((row, i) => {
      const item = document.createElement("div");
      item.className = "mb-item" + (i === mentionState.index ? " active" : "");
      item.setAttribute("role", "option");
      const img = document.createElement("img");
      img.alt = "";
      if (row.avatar_url) img.src = row.avatar_url;
      img.onerror = () => { img.style.visibility = "hidden"; };
      const name = document.createElement("span");
      name.className = "mb-name";
      name.textContent = "@" + row.username;
      item.appendChild(img);
      item.appendChild(name);
      item.addEventListener("mousedown", (e) => { e.preventDefault(); applyMention(row); });
      mentionBox.appendChild(item);
    });
  }

  function moveMentionSelection(dir) {
    if (!mentionState.results.length) return;
    const n = mentionState.results.length;
    mentionState.index = (mentionState.index + dir + n) % n;
    renderMentionBox();
  }

  function applyMention(row) {
    if (!row || !row.username) { closeMentionBox(); return; }
    const start = mentionState.start;
    const pos = inputEl.selectionStart || 0;
    if (start < 0) { closeMentionBox(); return; }
    const before = inputEl.value.slice(0, start);
    const after = inputEl.value.slice(pos);
    const insert = "@" + row.username + " ";
    inputEl.value = before + insert + after;
    const caret = before.length + insert.length;
    inputEl.setSelectionRange(caret, caret);
    closeMentionBox();
    updateSendDisabled();
    inputEl.focus();
  }
  sendBtn.addEventListener("click", sendMessage);

  uploadBtn.addEventListener("click", () => {
    if (isRestricted()) { toast("Messaging disabled", "warn"); return; }
    if (uploading) return;
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(f.type)) { toast("Unsupported image type", "error"); return; }
    if (f.size > 8 * 1024 * 1024) { toast("Image too large (max 8MB)", "error"); return; }
    clearPendingImage();
    pendingImage = { file: f, objectUrl: URL.createObjectURL(f) };
    previewImg.src = pendingImage.objectUrl;
    previewEl.classList.add("open");
    updateSendDisabled();
  });
  previewRm.addEventListener("click", clearPendingImage);

  function clearPendingImage() {
    if (pendingImage && pendingImage.objectUrl) URL.revokeObjectURL(pendingImage.objectUrl);
    pendingImage = null;
    previewImg.src = "";
    previewEl.classList.remove("open");
    updateSendDisabled();
  }

  async function uploadPendingImage() {
    if (!pendingImage || !me) return null;
    const f = pendingImage.file;
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]+/g,"");
    const path = `${me.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext || "bin"}`;
    uploading = true; updateSendDisabled();
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, f, {
      cacheControl: "3600", upsert: false, contentType: f.type
    });
    uploading = false;
    if (error) {
      console.error("[Error] Upload failed", error);
      toast("Upload failed: " + error.message, "error");
      updateSendDisabled();
      return null;
    }
    const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return (data && data.publicUrl) || null;
  }

  async function sendMessage() {
    if (!me) return;
    if (isRestricted()) { toast("Messaging disabled", "warn"); return; }
    if (!myEmailVerified) { toast("Verify your email to send messages", "warn"); updateVerifyBanner(); return; }

    const rawText = inputEl.value;
    const text = rawText.trim();
    const hasPendingImage = !!pendingImage;

    if (!text && !hasPendingImage) { toast("Type a message first", "warn", 1200); return; }
    if (rawText.length > 0 && !text) { toast("Whitespace-only messages aren't allowed", "warn"); return; }
    if (text && hasExcessiveSpacing(text)) { toast("Excessive spacing not allowed", "warn"); return; }
    if (text && hasLink(text)) {
      setRestriction();
      toast("Links aren't allowed. Messaging disabled for 5 hours.", "error", 3500);
      console.warn("[Security] Link detected — restriction applied");
      inputEl.value = ""; clearPendingImage(); cancelReply();
      return;
    }

    sendBtn.disabled = true;
    // Clear any outbound typing signal — we're sending a message now.
    publicTyping.onLocalSend();
    let imageUrl = null;
    if (hasPendingImage) {
      imageUrl = await uploadPendingImage();
      if (!imageUrl) { updateSendDisabled(); return; }
    }

    const prevText = rawText;
    const replyId = replyTo ? replyTo.id : null;
    inputEl.value = ""; clearPendingImage(); cancelReply();
    updateSendDisabled();

    const { error } = await sb.from("messages").insert({
      user_id: me.id,
      username: me.username,
      avatar_url: me.avatar_url,
      content: text,
      image_url: imageUrl,
      reply_to_id: replyId
    });
    if (error) {
      console.error("[Error] Insert failed", error);
      toast("Failed to send: " + error.message, "error");
      inputEl.value = prevText;
      updateSendDisabled();
    } else {
      playSent();
    }
    inputEl.focus();
  }

  // ---------- Profile ----------
  // Pronouns is a free-form short string (e.g. "she/her", "they/them").
  // The legacy gender column stored enum-like keys (female/male/nonbinary/other);
  // if we encounter one of those we render a human-readable label so migrated
  // rows don't look broken to users who haven't updated their profile yet.
  const LEGACY_GENDER_LABELS = { female: "Female", male: "Male", nonbinary: "Non-binary", other: "Other" };
  const DEFAULT_BANNER_COLOR = "#2873ce";
  const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;
  function fmtPronouns(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return "";
    if (Object.prototype.hasOwnProperty.call(LEGACY_GENDER_LABELS, s.toLowerCase())) {
      return LEGACY_GENDER_LABELS[s.toLowerCase()];
    }
    return s;
  }
  function normalizeHexColor(v, fallback) {
    const s = String(v == null ? "" : v).trim();
    if (HEX_COLOR_RE.test(s)) return s.toLowerCase();
    const short = /^#([0-9a-fA-F]{3})$/.exec(s);
    if (short) {
      const h = short[1];
      return ("#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toLowerCase();
    }
    return fallback || DEFAULT_BANNER_COLOR;
  }

  function setProfileNameAndPronouns(username, pronouns, opts) {
    const isMod = !!(opts && opts.isModerator);
    profileName.textContent = "";
    const raw = (username || "User").trim();
    const handle = raw.startsWith("@") ? raw : ("@" + raw.replace(/^@+/, ""));
    const nameSpan = document.createElement("span");
    nameSpan.className = "profile-name-text";
    nameSpan.textContent = handle;
    profileName.appendChild(nameSpan);
    const p = fmtPronouns(pronouns);
    if (p) {
      const sep = document.createElement("span");
      sep.className = "pronouns-sep";
      sep.textContent = " ◦ ";
      const lab = document.createElement("span");
      lab.className = "pronouns-label";
      lab.textContent = p;
      profileName.appendChild(sep);
      profileName.appendChild(lab);
    }
    // Moderator tag — to the RIGHT of pronouns. Small SVG shield + "Moderator".
    if (isMod) {
      const sep = document.createElement("span");
      sep.className = "pronouns-sep";
      sep.textContent = " ◦ ";
      const chip = document.createElement("span");
      chip.className = "mod-chip";
      chip.setAttribute("title", "Moderator");
      chip.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>' +
        '<polyline points="9 12 11 14 15 10"/></svg>' +
        '<span>Moderator</span>';
      profileName.appendChild(sep);
      profileName.appendChild(chip);
    }
  }

  function setProfileRegion(region) {
    const value = region != null ? String(region).trim() : "";
    profileSub.textContent = "";
    if (value) {
      const flag = regionFlagFor(value);
      if (flag) {
        const flagEl = document.createElement("span");
        flagEl.className = "region-flag";
        flagEl.setAttribute("aria-hidden", "true");
        flagEl.textContent = flag;
        profileSub.appendChild(flagEl);
      }
      profileSub.appendChild(document.createTextNode(value));
    }
    profileSub.classList.toggle("empty", !value);
    profileSub.hidden = !value;
  }

  function setMemberSince(joinDate) {
    if (!profileSince) return;
    const dateEl = profileSince.querySelector(".ms-date");
    let text = "";
    if (joinDate) {
      const d = new Date(joinDate);
      if (!isNaN(d.getTime())) text = fmtDate(d);
    }
    if (dateEl) dateEl.textContent = text;
    profileSince.classList.toggle("empty", !text);
    profileSince.hidden = !text;
  }

  function setProfileUid(profile, subjectUid) {
    if (!profileUid) return;
    const visibleId =
      (profile && profile.user_unique_id) ||
      (profile && profile.user_id) ||
      subjectUid || "";
    profileUid.textContent = visibleId || "";
    profileUid.classList.toggle("empty", !visibleId);
  }

  function applyProfileBanner(profile) {
    const color = normalizeHexColor(profile && profile.banner_color, DEFAULT_BANNER_COLOR);
    profileBanner.style.background = color;
  }

  // Holds the current profile context for the 3-dot banner menu.
  let currentProfileSubject = null;
  let currentProfileData = null;

  async function openProfileFor(subject) {
    if (!subject) return;
    // IMPORTANT: prefer `user_id` over `id`. When called with a message object (`m`),
    // `m.id` is the MESSAGE's own UUID while `m.user_id` is the sender's auth id.
    // Using `m.id` would look up a profile whose primary key never matches, so
    // bio / gender / region / join date would silently render as empty for anyone
    // other than the current user. Prefer `user_id`, fall back to `id` for call
    // sites that pass `{ id: someUserId }` (e.g. openOwnProfile).
    const uid = subject.user_id || subject.id;
    currentProfileSubject = { id: uid, username: subject.username || "", avatar_url: subject.avatar_url || "" };
    currentProfileData = null;
    closeProfileMenu();

    setProfileNameAndPronouns(subject.username, null, { isModerator: isModeratorId(subject.user_id || subject.id) });
    setProfileRegion(null);
    // Fix 2 — never blank; fall back to DEFAULT_AVATAR_URL and also swap
    // to it on load error so the preview always shows a real image.
    profileAvatar.src = resolveAvatarUrl(subject.avatar_url);
    profileAvatar.style.visibility = "";
    profileAvatar.onerror = () => {
      if (profileAvatar.src.indexOf(DEFAULT_AVATAR_URL) === -1) profileAvatar.src = DEFAULT_AVATAR_URL;
      else profileAvatar.style.visibility = "hidden";
    };
    // Presence dot on profile avatar
    const pDot = document.getElementById("profile-presence-dot");
    if (pDot) {
      pDot.dataset.userId = uid;
      applyPresenceDotElement(pDot, uid);
    }
    // Moderator badge overlay on profile avatar (mirrors chat-row badge).
    const wrap = profileAvatar && profileAvatar.parentNode;
    if (wrap) {
      const existingMB = wrap.querySelector(".mod-badge");
      if (isModeratorId(uid)) {
        if (!existingMB) {
          const mb = document.createElement("span");
          mb.className = "mod-badge";
          mb.title = "Moderator";
          mb.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>' +
            '<polyline points="9 12 11 14 15 10"/></svg>';
          wrap.appendChild(mb);
        }
      } else if (existingMB) {
        existingMB.remove();
      }
    }

    const isMine = me && uid === me.id;
    profileEdit.classList.toggle("show", !!isMine);
    if (profileMenuReport) profileMenuReport.hidden = !!isMine;
    if (profileActions) {
      profileActions.hidden = !!isMine || !me;
      // Reset to neutral; will be reconciled against DB state below.
      if (typeof applyFriendButtonState === "function") applyFriendButtonState("none");
      else if (profileAddFriendLabel) { profileAddFriendLabel.textContent = "Add Friend"; if (profileAddFriend) profileAddFriend.disabled = false; }
    }
    if (!isMine && me && typeof getFriendStatus === "function") {
      getFriendStatus(uid).then(s => { if (currentProfileSubject && currentProfileSubject.id === uid) applyFriendButtonState(s.state); }).catch(()=>{});
    }

    profileBio.textContent = "";
    profileBio.classList.remove("empty");
    setMemberSince(null);
    profileSince.classList.remove("empty");
    setProfileUid(null, uid);
    profileBanner.style.background = DEFAULT_BANNER_COLOR;
    profileDiscord.hidden = true;
    profileLinkedSection.hidden = true;
    profileDiscordErr.textContent = "";
    profileBackdrop.classList.add("open");

    const profile = await fetchProfile(uid);
    currentProfileData = profile || null;

    if (profile) {
      const displayName = profile.username || subject.username;
      // Prefer new `pronouns` column; fall back to legacy `gender` for rows
      // that haven't been migrated yet, so no data looks lost to the viewer.
      const pronounsValue = (profile.pronouns != null ? profile.pronouns : profile.gender);
      if (profile.is_moderator) moderatorIds.add(uid); else moderatorIds.delete(uid);
      setProfileNameAndPronouns(displayName, pronounsValue, { isModerator: !!profile.is_moderator });
      // Sync the avatar mod-badge overlay to the fresh DB value.
      const wrap2 = profileAvatar && profileAvatar.parentNode;
      if (wrap2) {
        const existingMB2 = wrap2.querySelector(".mod-badge");
        if (profile.is_moderator && !existingMB2) {
          const mb = document.createElement("span");
          mb.className = "mod-badge";
          mb.title = "Moderator";
          mb.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>' +
            '<polyline points="9 12 11 14 15 10"/></svg>';
          wrap2.appendChild(mb);
        } else if (!profile.is_moderator && existingMB2) {
          existingMB2.remove();
        }
      }
      refreshModBadges();
      setProfileRegion(profile.region);
      // Fix 2 — refresh with the fetched avatar or fall back to default.
      profileAvatar.src = resolveAvatarUrl(profile.avatar_url);
      profileAvatar.style.visibility = "";
      if (currentProfileSubject) {
        currentProfileSubject.username = displayName || currentProfileSubject.username;
        currentProfileSubject.avatar_url = resolveAvatarUrl(profile.avatar_url);
      }
      const bioText = (profile.bio || "").trim();
      profileBio.textContent = bioText;
      profileBio.classList.toggle("empty", !bioText);
      profileBio.hidden = !bioText;
      setMemberSince(profile.first_seen || profile.created_at);
      setProfileUid(profile, uid);
      applyProfileBanner(profile);
    } else {
      setProfileRegion(null);
      profileBio.textContent = "";
      profileBio.classList.add("empty");
      profileBio.hidden = true;
      setMemberSince(null);
      setProfileUid(null, uid);
      applyProfileBanner(null);
    }
    if (isMine) {
      profileLinkedSection.hidden = false;
      renderDiscordSection(profile);
    }
  }

  function renderDiscordSection(profile) {
    profileDiscord.hidden = false;
    profileDiscordErr.textContent = "";
    const linked = !!(profile && profile.discord_linked && profile.discord_id);
    if (linked) {
      const name = profile.discord_username || "Discord user";
      profileDiscordStatus.innerHTML = "Discord linked as <b></b>";
      profileDiscordStatus.querySelector("b").textContent = "@" + name;
      profileDiscordLink.hidden = true;
    } else {
      profileDiscordStatus.textContent = "";
      profileDiscordLink.hidden = false;
    }
  }
  function openOwnProfile() { if (me) openProfileFor({ id: me.id, username: me.username, avatar_url: me.avatar_url }); }
  function closeProfile() { profileBackdrop.classList.remove("open"); closeProfileMenu(); }
  meBtn.addEventListener("click", openOwnProfile);
  profileClose.addEventListener("click", closeProfile);
  const profileCloseX = document.getElementById("profile-close-x");
  if (profileCloseX) profileCloseX.addEventListener("click", closeProfile);
  profileBackdrop.addEventListener("click", (e) => { if (e.target === profileBackdrop) closeProfile(); });
  profileLogout.addEventListener("click", async () => { closeProfile(); await sb.auth.signOut(); });
  profileEdit.addEventListener("click", () => {
    if (!me) return;
    closeProfile();
    openEditProfile();
  });

  // ---- 3-dot profile options menu (banner top-right) ----
  function openProfileMenu() {
    if (!profileMenu) return;
    profileMenu.hidden = false;
    if (profileMenuBtn) profileMenuBtn.setAttribute("aria-expanded", "true");
  }
  function closeProfileMenu() {
    if (!profileMenu) return;
    profileMenu.hidden = true;
    if (profileMenuBtn) profileMenuBtn.setAttribute("aria-expanded", "false");
  }
  function isProfileMenuOpen() {
    return !!(profileMenu && !profileMenu.hidden);
  }
  async function copyTextSafely(value) {
    const text = String(value == null ? "" : value);
    if (!text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through to fallback */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) { return false; }
  }
  function resolveVisibleUserId() {
    // Copy User ID must match the Supabase user_id EXACTLY.
    // `user_unique_id` is a vanity/display code and must never be surfaced
    // through Copy User ID — the real Supabase user_id takes priority.
    const p = currentProfileData;
    const s = currentProfileSubject;
    return (p && p.user_id) || (s && s.id) || (p && p.user_unique_id) || "";
  }
  function resolveVisibleUsername() {
    const p = currentProfileData;
    const s = currentProfileSubject;
    return (p && p.username) || (s && s.username) || "";
  }
  if (profileMenuBtn) {
    profileMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isProfileMenuOpen()) closeProfileMenu();
      else openProfileMenu();
    });
  }
  if (profileMenu) {
    profileMenu.addEventListener("click", async (e) => {
      const btn = e.target.closest && e.target.closest("button[data-act]");
      if (!btn) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      closeProfileMenu();
      if (act === "copy-uid") {
        const uid = resolveVisibleUserId();
        if (!uid) { toast("User ID not available", "warn"); return; }
        const ok = await copyTextSafely(uid);
        toast(ok ? "User ID copied" : "Could not copy User ID", ok ? "default" : "warn");
      } else if (act === "copy-username") {
        const uname = resolveVisibleUsername();
        if (!uname) { toast("Username not available", "warn"); return; }
        const ok = await copyTextSafely(uname);
        toast(ok ? "Username copied" : "Could not copy username", ok ? "default" : "warn");
      } else if (act === "report") {
        const uname = resolveVisibleUsername() || "user";
        const uid = resolveVisibleUserId();
        console.log("[Report] User reported:", { username: uname, id: uid });
        toast("User reported. Thanks for letting us know.", "default", 2400);
      }
    });
  }
  // Close menu on outside click / Escape
  document.addEventListener("click", (e) => {
    if (!isProfileMenuOpen()) return;
    if (profileMenuBtn && profileMenuBtn.contains(e.target)) return;
    if (profileMenu && profileMenu.contains(e.target)) return;
    closeProfileMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isProfileMenuOpen()) closeProfileMenu();
  });

  profileDiscordLink.addEventListener("click", async () => {
    if (!me) return;
    profileDiscordErr.textContent = "";
    profileDiscordLink.disabled = true;
    const prev = profileDiscordLink.textContent;
    profileDiscordLink.textContent = "Redirecting…";
    try {
      // Mark the upcoming redirect so we can detect a successful Discord link on return
      // and avoid ever treating it as a fresh account creation.
      try { sessionStorage.setItem("pending_discord_link_uid", me.id); } catch (_) {}
      const { error } = await sb.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          scopes: "identify"
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error("[Error] Link Discord failed", err);
      profileDiscordErr.textContent = err && err.message ? err.message : "Could not link Discord.";
      profileDiscordLink.disabled = false;
      profileDiscordLink.textContent = prev;
    }
  });



  // ---------- Edit profile ----------
  let editPendingAvatarFile = null;
  let editPendingAvatarUrl = null;

  // Username change rule: 3 per rolling 30 days, tracked via `username_changes_at` (jsonb array).
  const USERNAME_CHANGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  function usernameChangesWithinWindow(profile) {
    const now = Date.now();
    const raw = profile && profile.username_changes_at;
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === "string" && raw.trim().startsWith("[")) {
      try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) arr = parsed; } catch (_) {}
    }
    const recent = [];
    for (const t of arr) {
      const ts = Date.parse(t);
      if (Number.isFinite(ts) && now - ts < USERNAME_CHANGE_WINDOW_MS) recent.push(new Date(ts).toISOString());
    }
    return recent;
  }
  function usernameRemainingMonthly(profile) {
    return Math.max(0, MAX_USERNAME_CHANGES - usernameChangesWithinWindow(profile).length);
  }
  function usernameResetLabel(profile) {
    const recent = usernameChangesWithinWindow(profile);
    if (!recent.length) return "";
    const oldest = recent.map(s => Date.parse(s)).sort((a,b)=>a-b)[0];
    const resetAt = oldest + USERNAME_CHANGE_WINDOW_MS;
    const days = Math.max(1, Math.ceil((resetAt - Date.now()) / (24 * 60 * 60 * 1000)));
    return days === 1 ? "resets in 1 day" : "resets in " + days + " days";
  }

  // Fix 3 — live banner preview (the edit card mirrors the profile card,
  // so we paint the banner stripe with the user's current color pick).
  const editBannerPreview = document.getElementById("edit-banner-preview");
  function syncEditBannerPreview(color) {
    if (!editBannerPreview) return;
    const v = normalizeHexColor(color, DEFAULT_BANNER_COLOR);
    editBannerPreview.style.background = v;
  }

  async function openEditProfile() {
    if (!me) return;
    editErr.textContent = "";
    const p = await fetchProfile(me.id) || {};
    const remaining = usernameRemainingMonthly(p);
    const resetHint = usernameResetLabel(p);
    editUsername.value = p.username || me.username || "";
    editUsername.dataset.original = editUsername.value;
    editUsername.disabled = remaining <= 0;
    const changeLabel = remaining + "/" + MAX_USERNAME_CHANGES + " changes remaining this month";
    editUsernameHint.textContent = remaining <= 0
      ? "No changes remaining this month" + (resetHint ? " (" + resetHint + ")" : "")
      : changeLabel + (resetHint ? " (" + resetHint + ")" : "");
    editBio.value = p.bio || "";
    // Prefer the new `pronouns` column; fall back to legacy `gender` so the
    // value isn't lost while a user edits their profile for the first time
    // after the pronouns migration.
    editPronouns.value = (p.pronouns != null ? p.pronouns : (p.gender || "")) || "";
    editRegion.value = p.region || "";
    const bannerColor = normalizeHexColor(p.banner_color, DEFAULT_BANNER_COLOR);
    editBannerColor.value = bannerColor;
    editBannerColorText.value = bannerColor;
    syncEditBannerPreview(bannerColor);
    // Fix 2 + Fix 3 — always show a real avatar in the edit preview (never
    // blank). Falls back to DEFAULT_AVATAR_URL if neither profile nor me
    // have one, and on load error.
    editAvatarPreview.src = resolveAvatarUrl(p.avatar_url || me.avatar_url);
    editAvatarPreview.style.visibility = "";
    editAvatarPreview.onerror = () => {
      if (editAvatarPreview.src.indexOf(DEFAULT_AVATAR_URL) === -1) editAvatarPreview.src = DEFAULT_AVATAR_URL;
    };
    if (editPendingAvatarUrl) { try { URL.revokeObjectURL(editPendingAvatarUrl); } catch(_){} }
    editPendingAvatarFile = null;
    editPendingAvatarUrl = null;
    editBackdrop.classList.add("open");
  }
  function closeEditProfile() {
    editBackdrop.classList.remove("open");
    if (editPendingAvatarUrl) { try { URL.revokeObjectURL(editPendingAvatarUrl); } catch(_){} }
    editPendingAvatarFile = null;
    editPendingAvatarUrl = null;
  }
  editCancel.addEventListener("click", closeEditProfile);
  editBackdrop.addEventListener("click", (e) => { if (e.target === editBackdrop) closeEditProfile(); });
  // Fix 3 — the redesigned edit card has an explicit close-X (top-right of
  // the banner, matching the read-only profile preview). Wire it up
  // defensively since the element didn't exist in the old markup.
  const editCloseX = document.getElementById("edit-close-x");
  if (editCloseX) editCloseX.addEventListener("click", closeEditProfile);
  editAvatarPick.addEventListener("click", () => editAvatarInput.click());
  editAvatarInput.addEventListener("change", () => {
    const f = editAvatarInput.files && editAvatarInput.files[0];
    editAvatarInput.value = "";
    if (!f) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(f.type)) { editErr.textContent = "Unsupported image type."; return; }
    if (f.size > 8 * 1024 * 1024) { editErr.textContent = "Image too large (max 8 MB)."; return; }
    if (editPendingAvatarUrl) { try { URL.revokeObjectURL(editPendingAvatarUrl); } catch(_){} }
    editPendingAvatarFile = f;
    editPendingAvatarUrl = URL.createObjectURL(f);
    editAvatarPreview.src = editPendingAvatarUrl;
    editAvatarPreview.style.visibility = "";
    editErr.textContent = "";
  });
  // Banner color sync: color picker ↔ text input ↔ reset button.
  // Fix 3 — also drives the live banner stripe on the redesigned card.
  editBannerColor.addEventListener("input", () => {
    const v = normalizeHexColor(editBannerColor.value, DEFAULT_BANNER_COLOR);
    editBannerColor.value = v;
    editBannerColorText.value = v;
    syncEditBannerPreview(v);
  });
  editBannerColorText.addEventListener("input", () => {
    const raw = (editBannerColorText.value || "").trim();
    if (HEX_COLOR_RE.test(raw)) {
      editBannerColor.value = raw.toLowerCase();
      syncEditBannerPreview(raw);
    }
  });
  editBannerColorText.addEventListener("blur", () => {
    const v = normalizeHexColor(editBannerColorText.value, editBannerColor.value || DEFAULT_BANNER_COLOR);
    editBannerColor.value = v;
    editBannerColorText.value = v;
    syncEditBannerPreview(v);
  });
  editBannerReset.addEventListener("click", () => {
    editBannerColor.value = DEFAULT_BANNER_COLOR;
    editBannerColorText.value = DEFAULT_BANNER_COLOR;
    syncEditBannerPreview(DEFAULT_BANNER_COLOR);
  });

  editSave.addEventListener("click", async () => {
    if (!me) return;
    editErr.textContent = "";
    const current = await fetchProfile(me.id) || {};
    const origUsername = current.username || editUsername.dataset.original || me.username || "";
    const newUsername = (editUsername.value || "").trim();
    const usernameChanged = newUsername !== origUsername;
    const priorChanges = usernameChangesWithinWindow(current);
    const remaining = Math.max(0, MAX_USERNAME_CHANGES - priorChanges.length);
    if (!newUsername) { editErr.textContent = "Username is required."; return; }
    if (!isValidUsername(newUsername)) { editErr.textContent = USERNAME_LENGTH_MESSAGE; return; }
    if (usernameChanged && remaining <= 0) {
      const resetHint = usernameResetLabel(current);
      editErr.textContent = "Username change limit reached (3 per 30 days)" + (resetHint ? " — " + resetHint + "." : ".");
      return;
    }
    const bannerColor = normalizeHexColor(editBannerColorText.value || editBannerColor.value, DEFAULT_BANNER_COLOR);
    editSave.disabled = true; editCancel.disabled = true;
    const prevLabel = editSave.textContent;
    editSave.textContent = "Saving…";
    try {
      let avatarUrl = current.avatar_url || me.avatar_url || "";
      if (editPendingAvatarFile) {
        const uploaded = await uploadAvatarFile(editPendingAvatarFile);
        if (uploaded) avatarUrl = uploaded;
        else { editErr.textContent = "Avatar upload failed."; return; }
      }
      // Fix 2 — guarantee a non-null avatar_url on save.
      if (!avatarUrl) avatarUrl = DEFAULT_AVATAR_URL;
      const extra = {
        username: newUsername,
        avatar_url: avatarUrl,
        bio: (editBio.value || "").trim() || null,
        pronouns: (editPronouns.value || "").trim() || null,
        region: (editRegion.value || "").trim() || null,
        banner_color: bannerColor
      };
      if (usernameChanged) {
        const nextChanges = priorChanges.concat([new Date().toISOString()]);
        extra.username_changes_at = nextChanges;
        extra.username_change_count = Number(current.username_change_count || 0) + 1;
      }
      me.username = newUsername;
      me.avatar_url = avatarUrl;
      const saved = await upsertOwnProfile(extra);
      if (!saved) { editErr.textContent = "Could not save changes."; return; }
      applyMeFromProfile(saved);
      toast("Profile updated", "default", 1600);
      closeEditProfile();
    } catch (err) {
      console.error("[Error] Profile save failed", err);
      editErr.textContent = formatSbError(err, "Could not save changes.");
    } finally {
      editSave.disabled = false; editCancel.disabled = false;
      editSave.textContent = prevLabel;
    }
  });

  // ---------- Image viewer ----------
  function openImageViewer(url) {
    ivImg.src = url;
    imageViewer.classList.add("open");
  }
  function closeImageViewer() {
    imageViewer.classList.remove("open");
    setTimeout(() => { if (!imageViewer.classList.contains("open")) ivImg.src = ""; }, 220);
  }
  ivClose.addEventListener("click", closeImageViewer);
  imageViewer.addEventListener("click", (e) => { if (e.target === imageViewer) closeImageViewer(); });

  // Cross-tab restriction sync
  window.addEventListener("storage", (e) => { if (e.key === RESTRICTION_KEY) applyRestrictionUI(); });

  // ========== FEATURE EXPANSION: DMs + Friends + Notifications ==========
  // DOM refs for the new header buttons, popups, and profile action row.
  const dmBtn = document.getElementById("dm-btn");
  const inboxBtn = document.getElementById("inbox-btn");
  const dmBadge = document.getElementById("dm-badge");
  const inboxBadge = document.getElementById("inbox-badge");
  const dmListBackdrop = document.getElementById("dm-list-backdrop");
  const dmListBody = document.getElementById("dm-list-body");
  const dmListClose = document.getElementById("dm-list-close");
  const dmRoomBackdrop = document.getElementById("dm-room-backdrop");
  const dmRoomMessages = document.getElementById("dm-room-messages");
  const dmRoomInput = document.getElementById("dm-room-input");
  const dmRoomSend = document.getElementById("dm-room-send");
  const dmRoomBack = document.getElementById("dm-room-back");
  const dmRoomPeer = document.getElementById("dm-room-peer");
  const dmRoomAvatar = document.getElementById("dm-room-avatar");
  const dmRoomName = document.getElementById("dm-room-name");
  const inboxBackdrop = document.getElementById("inbox-backdrop");
  const inboxBody = document.getElementById("inbox-body");
  const inboxClose = document.getElementById("inbox-close");
  const friendsBackdrop = document.getElementById("friends-backdrop");
  const friendsBody = document.getElementById("friends-body");
  const friendsRequestsBody = document.getElementById("friends-requests-body");
  const friendsClose = document.getElementById("friends-close");
  const friendsTabFriends = document.getElementById("friends-tab-friends");
  const friendsTabRequests = document.getElementById("friends-tab-requests");
  const friendsRequestsBadge = document.getElementById("friends-requests-badge");
  const confirmRemoveFriendBackdrop = document.getElementById("confirm-remove-friend-backdrop");
  const confirmRemoveFriendName = document.getElementById("confirm-remove-friend-name");
  const confirmRemoveFriendCancel = document.getElementById("confirm-remove-friend-cancel");
  const confirmRemoveFriendOk = document.getElementById("confirm-remove-friend-ok");
  const confirmAcceptRequestBackdrop = document.getElementById("confirm-accept-request-backdrop");
  const confirmAcceptRequestName = document.getElementById("confirm-accept-request-name");
  const confirmAcceptRequestCancel = document.getElementById("confirm-accept-request-cancel");
  const confirmAcceptRequestOk = document.getElementById("confirm-accept-request-ok");
  const confirmDenyRequestBackdrop = document.getElementById("confirm-deny-request-backdrop");
  const confirmDenyRequestName = document.getElementById("confirm-deny-request-name");
  const confirmDenyRequestCancel = document.getElementById("confirm-deny-request-cancel");
  const confirmDenyRequestOk = document.getElementById("confirm-deny-request-ok");
  const profileActions = document.getElementById("profile-actions");
  const profileDm = document.getElementById("profile-dm");
  const profileAddFriend = document.getElementById("profile-add-friend");
  const profileAddFriendLabel = document.getElementById("profile-add-friend-label");
  const profileAddFriendIcon = document.getElementById("profile-add-friend-icon");
  // New DM room refs (parity features)
  const dmAttachBtn = document.getElementById("dm-attach-btn");
  const dmFileInput = document.getElementById("dm-file-input");
  const dmReplyPreview = document.getElementById("dm-reply-preview");
  const dmReplyName = document.getElementById("dm-reply-name");
  const dmReplyText = document.getElementById("dm-reply-text");
  const dmReplyClose = document.getElementById("dm-reply-close");
  const dmImagePreview = document.getElementById("dm-image-preview");
  const dmImagePreviewImg = document.getElementById("dm-image-preview-img");
  const dmImagePreviewRm = document.getElementById("dm-image-preview-rm");
  const dmRequestBar = document.getElementById("dm-request-bar");
  const dmRequestText = document.getElementById("dm-request-text");
  const dmRequestAccept = document.getElementById("dm-request-accept");
  const dmRequestsBadge = document.getElementById("dm-requests-badge");
  const dmTabBtns = document.querySelectorAll("[data-dm-tab]");
  const dmSideBody = document.getElementById("dm-side-body");
  const dmSideRequestsBadge = document.getElementById("dm-side-requests-badge");
  const dmSideTabBtns = document.querySelectorAll("[data-side-tab]");

  // Feature state
  let dmRoomsList = [];
  let currentDmRoom = null;      // { id, otherId, otherProfile, is_request, requester_id }
  let dmRoomChannel = null;
  let dmReactChannel = null;
  let dmSideChannel = null;
  let notifChannel = null;
  let notifications = [];
  let notifIds = new Set();
  let friendRequestSending = false;
  let dmTab = "all";             // 'all' | 'requests'
  // Per-room rendering state (parity with main chat)
  const dmMessagesById = new Map();
  const dmRowsById = new Map();
  const dmReactionsByMsg = new Map(); // msgId -> Map(emoji -> Set(userId))
  const dmReactionsByKey = new Set(); // `${msgId}|${userId}|${emoji}`
  let dmLastSenderId = null;
  let dmLastDateLabel = null;
  let dmReplyTo = null;          // message object being replied to
  let dmPendingImage = null;     // { file, url }
  const profileMiniCache = new Map(); // id -> { id, username, avatar_url }
  const friendStatusCache = new Map(); // peerId -> { state, request_id }
  let friendRequestsChannel = null;

  function escHtmlFeature(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function autolinkDmContent(s) {
    // Links are allowed inside DMs per spec (no link blocking). Escape first, then linkify.
    const escaped = escHtmlFeature(s);
    return escaped.replace(/(https?:\/\/[^\s<]+)/g, (u) => '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>');
  }
  function fmtRelTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6);
    if (d >= weekAgo) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  async function getMiniProfiles(ids) {
    const missing = [];
    for (const id of ids) if (id && !profileMiniCache.has(id)) missing.push(id);
    if (missing.length) {
      const { data } = await sb.from("profiles").select("user_id, username, avatar_url").in("user_id", missing);
      if (Array.isArray(data)) for (const p of data) profileMiniCache.set(p.user_id, p);
    }
    const out = {};
    for (const id of ids) if (id) out[id] = profileMiniCache.get(id) || null;
    return out;
  }

  // ---------- DMs: list ----------
  async function fetchDmRooms() {
    if (!me) return [];
    const { data, error } = await sb
      .from("dm_rooms")
      .select("id, user_one, user_two, created_at, is_request, requester_id")
      .or("user_one.eq." + me.id + ",user_two.eq." + me.id)
      .order("created_at", { ascending: false });
    if (error) { console.warn("[DM] fetchDmRooms failed", error); return []; }
    const rooms = data || [];
    const otherIds = rooms.map(r => r.user_one === me.id ? r.user_two : r.user_one);
    const profiles = await getMiniProfiles(otherIds);
    const withLast = await Promise.all(rooms.map(async (r) => {
      const { data: msgs } = await sb
        .from("dm_messages")
        .select("id, sender_id, content, image_url, created_at")
        .eq("room_id", r.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = (msgs && msgs[0]) || null;
      const otherId = r.user_one === me.id ? r.user_two : r.user_one;
      // Fix 1 — keep the real profile object (username + avatar_url) when present;
      // fall back to null so render code can skip placeholders like "User".
      return {
        id: r.id,
        other_id: otherId,
        other: profiles[otherId] || null,
        last_message: last,
        created_at: r.created_at,
        is_request: !!r.is_request,
        requester_id: r.requester_id || null
      };
    }));
    withLast.sort((a, b) => {
      const ta = (a.last_message && a.last_message.created_at) || a.created_at || "";
      const tb = (b.last_message && b.last_message.created_at) || b.created_at || "";
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    dmRoomsList = withLast;
    return withLast;
  }

  function updateDmRequestsBadge() {
    // Count rooms where I'm the receiver of a pending request.
    if (!me || !dmRequestsBadge) return;
    const pendingIn = dmRoomsList.filter(r => r.is_request && r.requester_id && r.requester_id !== me.id).length;
    if (pendingIn > 0) {
      dmRequestsBadge.textContent = pendingIn > 99 ? "99+" : String(pendingIn);
      dmRequestsBadge.hidden = false;
    } else {
      dmRequestsBadge.hidden = true;
    }
  }
  function lastMessagePreview(lm) {
    if (!lm) return "No messages yet";
    if (lm.content) return lm.content;
    if (lm.image_url) return "\uD83D\uDCF7 Photo";
    return "";
  }
  function renderDmList() {
    renderDmSidePanel();
    dmListBody.innerHTML = "";
    updateDmRequestsBadge();
    // Groups tab is rendered by its own pipeline (renderGroupsListModal).
    if (dmTab === "groups") { if (typeof renderGroupsListModal === "function") renderGroupsListModal(); if (typeof renderGroupsSidePanel === "function") renderGroupsSidePanel(); return; }
    // Split rooms: "All" = accepted (is_request=false), "Requests" = pending received by me.
    // Outgoing pending requests are hidden until the other side accepts (never show in either tab).
    const all = dmRoomsList.filter(r => !r.is_request);
    const requests = dmRoomsList.filter(r => r.is_request && r.requester_id && r.requester_id !== me.id);
    const visible = dmTab === "requests" ? requests : all;
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "popup-empty";
      if (dmTab === "requests") {
        empty.textContent = "No message requests.";
      } else {
        empty.textContent = "No messages yet. Open someone\u2019s profile and tap Message.";
      }
      dmListBody.appendChild(empty);
      return;
    }
    for (const r of visible) {
      // Fix 1 — if profile data didn't resolve, skip the row entirely rather
      // than showing placeholders like "User".
      if (!r.other || !r.other.username) continue;
      const row = document.createElement("button");
      row.type = "button"; row.className = "popup-row";
      row.dataset.roomId = r.id; row.dataset.otherId = r.other_id;
      const avatar = document.createElement("img");
      avatar.className = "avatar"; avatar.alt = "";
      // Fix 2 — fall back to DEFAULT_AVATAR_URL so DM list rows never render
      // a blank/hidden image for contacts who haven't set a picture.
      avatar.src = resolveAvatarUrl(r.other.avatar_url);
      avatar.onerror = () => {
        if (avatar.src.indexOf(DEFAULT_AVATAR_URL) === -1) avatar.src = DEFAULT_AVATAR_URL;
        else avatar.style.visibility = "hidden";
      };
      row.appendChild(avatar);
      const main = document.createElement("div"); main.className = "row-main";
      const top = document.createElement("div"); top.className = "row-top";
      const nameEl = document.createElement("span"); nameEl.className = "row-name";
      nameEl.textContent = r.other.username;
      const ts = document.createElement("span"); ts.className = "row-ts";
      ts.textContent = fmtRelTime(r.last_message && r.last_message.created_at);
      top.appendChild(nameEl); top.appendChild(ts);
      main.appendChild(top);
      const sub = document.createElement("div"); sub.className = "row-sub";
      if (r.last_message) {
        const prefix = r.last_message.sender_id === me.id ? "You: " : "";
        sub.textContent = prefix + lastMessagePreview(r.last_message);
      } else {
        sub.textContent = "No messages yet";
      }
      main.appendChild(sub);
      row.appendChild(main);
      row.addEventListener("click", () => {
        closeDmList();
        openDmRoom(r.id, r.other, { is_request: r.is_request, requester_id: r.requester_id });
      });
      dmListBody.appendChild(row);
    }
  }
  function setDmTab(tab) {
    dmTab = (tab === "requests" || tab === "groups") ? tab : "all";
    if (dmTabBtns) dmTabBtns.forEach(b => {
      const active = b.dataset.dmTab === dmTab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    const newGroupBtn = document.getElementById("dm-list-new-group");
    if (newGroupBtn) newGroupBtn.hidden = (dmTab !== "groups");
    renderDmList();
  }

  // ---------- DM side panel (PC split layout) ----------
  let dmSideTab = "all";

  function renderDmSidePanel() {
    if (!dmSideBody || !me) return;
    if (dmSideTab === "groups") { if (typeof renderGroupsSidePanel === "function") renderGroupsSidePanel(); return; }
    const all = dmRoomsList.filter(r => !r.is_request);
    const requests = dmRoomsList.filter(r => r.is_request && r.requester_id && r.requester_id !== me.id);
    if (dmSideRequestsBadge) {
      if (requests.length > 0) {
        dmSideRequestsBadge.textContent = requests.length > 99 ? "99+" : String(requests.length);
        dmSideRequestsBadge.hidden = false;
      } else {
        dmSideRequestsBadge.hidden = true;
      }
    }
    const visible = dmSideTab === "requests" ? requests : all;
    dmSideBody.innerHTML = "";
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "dm-side-empty";
      empty.textContent = dmSideTab === "requests"
        ? "No message requests."
        : "No messages yet. Open someone\u2019s profile and tap Message.";
      dmSideBody.appendChild(empty);
      return;
    }
    for (const r of visible) {
      // Fix 1 — skip rows without resolved profile (no placeholders).
      if (!r.other || !r.other.username) continue;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dm-side-row";
      row.dataset.roomId = r.id;
      row.dataset.otherId = r.other_id;

      const avatarWrap = document.createElement("span");
      avatarWrap.className = "dm-side-avatar-wrap";
      const avatar = document.createElement("img");
      avatar.className = "dm-side-avatar"; avatar.alt = "";
      // Fix 2 — see note on the popup-row avatar above.
      avatar.src = resolveAvatarUrl(r.other.avatar_url);
      avatar.onerror = () => {
        if (avatar.src.indexOf(DEFAULT_AVATAR_URL) === -1) avatar.src = DEFAULT_AVATAR_URL;
        else avatar.style.visibility = "hidden";
      };
      avatarWrap.appendChild(avatar);
      row.appendChild(avatarWrap);

      const main = document.createElement("div");
      main.className = "dm-side-main";
      const top = document.createElement("div");
      top.className = "dm-side-top";
      const name = document.createElement("span");
      name.className = "dm-side-name";
      name.textContent = r.other.username;
      top.appendChild(name);
      main.appendChild(top);

      const preview = document.createElement("div");
      preview.className = "dm-side-preview";
      if (r.last_message) {
        const prefix = r.last_message.sender_id === me.id ? "You: " : "";
        preview.textContent = prefix + lastMessagePreview(r.last_message);
      } else {
        preview.textContent = "No messages yet";
      }
      main.appendChild(preview);
      row.appendChild(main);

      const meta = document.createElement("span");
      meta.className = "dm-side-meta";
      const ts = document.createElement("span");
      ts.textContent = fmtRelTime(r.last_message && r.last_message.created_at);
      meta.appendChild(ts);
      // Small chevron arrow
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      path.setAttribute("points", "9 6 15 12 9 18");
      svg.appendChild(path);
      meta.appendChild(svg);
      row.appendChild(meta);

      row.addEventListener("click", () => {
        openDmRoom(r.id, r.other, { is_request: r.is_request, requester_id: r.requester_id });
      });
      dmSideBody.appendChild(row);
    }
  }

  function setDmSideTab(tab) {
    dmSideTab = (tab === "requests" || tab === "groups") ? tab : "all";
    if (dmSideTabBtns) dmSideTabBtns.forEach(b => {
      const active = b.dataset.sideTab === dmSideTab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    const sideNewGroup = document.getElementById("dm-side-new-group");
    if (sideNewGroup) sideNewGroup.hidden = (dmSideTab !== "groups");
    renderDmSidePanel();
  }

  async function refreshDmSidePanel() {
    if (!me) return;
    try {
      await fetchDmRooms();
      renderDmSidePanel();
    } catch (err) {
      console.warn("[DM] side panel refresh failed", err);
    }
  }

  // Subscribe to DM inserts / room changes so the side panel stays live
  // without relying on the user opening the mobile DM modal.
  function subscribeDmSide() {
    if (!me || dmSideChannel) return;
    try {
      dmSideChannel = sb.channel("dm_side:" + me.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "dm_rooms" }, () => {
          refreshDmSidePanel();
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, () => {
          refreshDmSidePanel();
        })
        .subscribe();
    } catch (err) {
      console.warn("[DM] side channel subscribe failed", err);
    }
  }
  function unsubscribeDmSide() {
    if (dmSideChannel) { try { sb.removeChannel(dmSideChannel); } catch(_){} dmSideChannel = null; }
  }

  function initDmSidePanel() {
    if (!dmSideBody || !me) return;
    dmSideBody.innerHTML = '<div class="dm-side-empty">Loading\u2026</div>';
    refreshDmSidePanel();
    subscribeDmSide();
  }
  function resetDmSidePanel() {
    unsubscribeDmSide();
    dmRoomsList = [];
    if (dmSideBody) dmSideBody.innerHTML = '<div class="dm-side-empty">Sign in to see your messages.</div>';
    if (dmSideRequestsBadge) dmSideRequestsBadge.hidden = true;
  }

  // ==========================================================================
  // Groups system
  // ==========================================================================
  const myGroups = [];                // [{ id, name, description, image_url, created_by, last_message?, last_created_at }]
  const groupMessagesById = new Map();
  const groupRowsById = new Map();
  const groupReactionsByMsg = new Map();   // msgId -> Map(emoji -> Set(userId))
  const groupReactionsByKey = new Set();   // "msgId|userId|emoji"
  const groupMemberIdsByGroup = new Map(); // groupId -> Set(userId)
  let currentGroupId = null;
  let groupRoomChannel = null;
  let groupReactChannel = null;
  let groupsListChannel = null;
  let groupReplyTo = null;
  let groupPendingImage = null;   // File
  let groupLastSenderId = null;
  let groupLastDateLabel = null;
  let groupCreatePendingImage = null; // File

  const groupCreateBackdrop  = document.getElementById("group-create-backdrop");
  const groupCreateClose     = document.getElementById("group-create-close");
  const groupCreateCancel    = document.getElementById("group-create-cancel");
  const groupCreateSubmitBtn = document.getElementById("group-create-submit");
  const groupCreateNameEl    = document.getElementById("group-create-name");
  const groupCreateDescEl    = document.getElementById("group-create-desc");
  const groupCreateImageInput= document.getElementById("group-create-image");
  const groupCreateAvatarPrev= document.getElementById("group-create-avatar-preview");

  const groupRoomBackdrop    = document.getElementById("group-room-backdrop");
  const groupRoomBack        = document.getElementById("group-room-back");
  const groupRoomAvatar      = document.getElementById("group-room-avatar");
  const groupRoomName        = document.getElementById("group-room-name");
  const groupRoomPeerBtn     = document.getElementById("group-room-peer");
  const groupRoomAddBtn      = document.getElementById("group-room-add");
  const groupRoomMessages    = document.getElementById("group-room-messages");
  const groupRoomInput       = document.getElementById("group-room-input");
  const groupRoomSendBtn     = document.getElementById("group-room-send");
  const groupAttachBtn       = document.getElementById("group-attach-btn");
  const groupFileInput       = document.getElementById("group-file-input");
  const groupImagePreview    = document.getElementById("group-image-preview");
  const groupImagePreviewImg = document.getElementById("group-image-preview-img");
  const groupImagePreviewRm  = document.getElementById("group-image-preview-rm");
  const groupReplyPreview    = document.getElementById("group-reply-preview");
  const groupReplyName       = document.getElementById("group-reply-name");
  const groupReplyText       = document.getElementById("group-reply-text");
  const groupReplyClose      = document.getElementById("group-reply-close");

  const groupAddBackdrop     = document.getElementById("group-add-backdrop");
  const groupAddBody         = document.getElementById("group-add-body");
  const groupAddCloseBtn     = document.getElementById("group-add-close");

  function groupSnippet(m) {
    if (!m) return "";
    if (m.image_url) return "\uD83D\uDCF7 Photo";
    return (m.content || "").slice(0, 180);
  }

  function groupLastPreview(g) {
    if (!g) return "No messages yet";
    if (g.last_message) {
      const prefix = (me && g.last_message.sender_id === me.id) ? "You: " : "";
      return prefix + groupSnippet(g.last_message);
    }
    if (g.description) return g.description;
    return "No messages yet";
  }

  async function fetchMyGroups() {
    if (!me) return;
    try {
      // Get group ids I'm a member of, then the group rows.
      const memRes = await sb.from("group_members").select("group_id").eq("user_id", me.id);
      if (memRes.error) throw memRes.error;
      const ids = (memRes.data || []).map(r => r.group_id);
      myGroups.length = 0;
      if (!ids.length) return;
      const grpRes = await sb.from("group_chats").select("*").in("id", ids);
      if (grpRes.error) throw grpRes.error;
      const rows = grpRes.data || [];
      // Attach last message for each group (latest by created_at).
      const lastRes = await sb.from("group_messages")
        .select("id,group_id,sender_id,content,image_url,created_at")
        .in("group_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);
      const lastByGroup = new Map();
      if (!lastRes.error && Array.isArray(lastRes.data)) {
        for (const m of lastRes.data) {
          if (!lastByGroup.has(m.group_id)) lastByGroup.set(m.group_id, m);
        }
      }
      for (const g of rows) {
        g.last_message = lastByGroup.get(g.id) || null;
        g.last_created_at = (g.last_message && g.last_message.created_at) || g.created_at;
        myGroups.push(g);
      }
      myGroups.sort((a, b) => new Date(b.last_created_at) - new Date(a.last_created_at));
    } catch (err) {
      console.warn("[Groups] fetch failed", err);
    }
  }

  function renderGroupsListModal() {
    if (!dmListBody) return;
    dmListBody.innerHTML = "";
    if (!myGroups.length) {
      const empty = document.createElement("div");
      empty.className = "popup-empty";
      empty.textContent = "No groups yet. Tap + to create one.";
      dmListBody.appendChild(empty);
      return;
    }
    for (const g of myGroups) {
      const row = document.createElement("button");
      row.type = "button"; row.className = "popup-row";
      row.dataset.groupId = g.id;
      const av = document.createElement("span"); av.className = "group-row-avatar";
      if (g.image_url) {
        const img = document.createElement("img"); img.alt = ""; img.src = g.image_url;
        img.onerror = () => { av.innerHTML = groupFallbackSvg(); };
        av.appendChild(img);
      } else {
        av.innerHTML = groupFallbackSvg();
      }
      row.appendChild(av);
      const main = document.createElement("div"); main.className = "row-main";
      const top = document.createElement("div"); top.className = "row-top";
      const nameEl = document.createElement("span"); nameEl.className = "row-name"; nameEl.textContent = g.name || "Group";
      const ts = document.createElement("span"); ts.className = "row-ts";
      ts.textContent = fmtRelTime(g.last_created_at);
      top.appendChild(nameEl); top.appendChild(ts);
      main.appendChild(top);
      const sub = document.createElement("div"); sub.className = "row-sub";
      sub.textContent = groupLastPreview(g);
      main.appendChild(sub);
      row.appendChild(main);
      row.addEventListener("click", () => { closeDmList(); openGroupRoom(g.id); });
      dmListBody.appendChild(row);
    }
  }

  function renderGroupsSidePanel() {
    if (!dmSideBody) return;
    dmSideBody.innerHTML = "";
    if (!myGroups.length) {
      const empty = document.createElement("div");
      empty.className = "dm-side-empty";
      empty.textContent = "No groups yet. Tap + to create one.";
      dmSideBody.appendChild(empty);
      return;
    }
    for (const g of myGroups) {
      const row = document.createElement("button");
      row.type = "button"; row.className = "dm-side-row"; row.dataset.groupId = g.id;
      const avWrap = document.createElement("span"); avWrap.className = "dm-side-avatar-wrap";
      const av = document.createElement("span"); av.className = "group-row-avatar";
      av.style.width = "40px"; av.style.height = "40px"; av.style.borderRadius = "12px";
      if (g.image_url) {
        const img = document.createElement("img"); img.alt = ""; img.src = g.image_url;
        img.onerror = () => { av.innerHTML = groupFallbackSvg(); };
        av.appendChild(img);
      } else {
        av.innerHTML = groupFallbackSvg();
      }
      avWrap.appendChild(av);
      row.appendChild(avWrap);
      const main = document.createElement("div"); main.className = "dm-side-main";
      const top = document.createElement("div"); top.className = "dm-side-top";
      const nameEl = document.createElement("span"); nameEl.className = "dm-side-name"; nameEl.textContent = g.name || "Group";
      top.appendChild(nameEl);
      main.appendChild(top);
      const pv = document.createElement("div"); pv.className = "dm-side-preview";
      pv.textContent = groupLastPreview(g);
      main.appendChild(pv);
      row.appendChild(main);
      const meta = document.createElement("span"); meta.className = "dm-side-meta";
      const ts = document.createElement("span"); ts.textContent = fmtRelTime(g.last_created_at);
      meta.appendChild(ts);
      row.appendChild(meta);
      row.addEventListener("click", () => openGroupRoom(g.id));
      dmSideBody.appendChild(row);
    }
  }

  function groupFallbackSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }

  async function subscribeGroupsList() {
    if (!me || groupsListChannel) return;
    try {
      groupsListChannel = sb.channel("groups_list:" + me.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: "user_id=eq." + me.id }, async (payload) => {
          // If I was removed from the current room, drop the UI immediately.
          if (payload && payload.eventType === "DELETE") {
            const removed = payload.old && payload.old.group_id;
            if (removed && currentGroupId && removed === currentGroupId) {
              try { if (typeof closeGroupRoom === "function") closeGroupRoom(); } catch(_){}
              try { if (typeof closeGroupSettings === "function") closeGroupSettings(); } catch(_){}
              try { if (typeof toast === "function") toast("You were removed from the group.", "default", 2400); } catch(_){}
            }
          }
          await fetchMyGroups();
          if (dmSideTab === "groups") renderGroupsSidePanel();
          if (dmTab === "groups" && dmListBackdrop.classList.contains("open")) renderGroupsListModal();
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "group_chats" }, async (payload) => {
          // If the whole group is deleted, drop it locally.
          const gid = payload && payload.old && payload.old.id;
          if (!gid) return;
          if (currentGroupId === gid) {
            try { if (typeof closeGroupRoom === "function") closeGroupRoom(); } catch(_){}
            try { if (typeof closeGroupSettings === "function") closeGroupSettings(); } catch(_){}
            try { if (typeof toast === "function") toast("Group deleted.", "default", 2200); } catch(_){}
          }
          const gi = myGroups.findIndex(x => x.id === gid);
          if (gi >= 0) myGroups.splice(gi, 1);
          if (dmSideTab === "groups") renderGroupsSidePanel();
          if (dmTab === "groups" && dmListBackdrop.classList.contains("open")) renderGroupsListModal();
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, async (payload) => {
          const m = payload.new;
          if (!m) return;
          // Only refresh if we're a member of this group.
          const isMember = myGroups.some(g => g.id === m.group_id);
          if (!isMember) return;
          // Update lightweight in-place cache.
          const g = myGroups.find(x => x.id === m.group_id);
          if (g) { g.last_message = m; g.last_created_at = m.created_at; myGroups.sort((a, b) => new Date(b.last_created_at) - new Date(a.last_created_at)); }
          if (dmSideTab === "groups") renderGroupsSidePanel();
          if (dmTab === "groups" && dmListBackdrop.classList.contains("open")) renderGroupsListModal();
        })
        .subscribe();
    } catch (err) { console.warn("[Groups] list subscribe failed", err); }
  }
  function unsubscribeGroupsList() {
    if (groupsListChannel) { try { sb.removeChannel(groupsListChannel); } catch(_){} groupsListChannel = null; }
  }

  async function initGroups() {
    if (!me) return;
    await fetchMyGroups();
    subscribeGroupsList();
    if (dmSideTab === "groups") renderGroupsSidePanel();
  }
  function resetGroups() {
    unsubscribeGroupsList();
    myGroups.length = 0;
    if (currentGroupId) closeGroupRoom();
  }

  // ---------- Create group ----------
  function openCreateGroup() {
    if (!me) return;
    groupCreatePendingImage = null;
    if (groupCreateNameEl) groupCreateNameEl.value = "";
    if (groupCreateDescEl) groupCreateDescEl.value = "";
    if (groupCreateAvatarPrev) groupCreateAvatarPrev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    if (groupCreateSubmitBtn) groupCreateSubmitBtn.disabled = true;
    groupCreateBackdrop.classList.add("open");
    setTimeout(() => { if (groupCreateNameEl) groupCreateNameEl.focus(); }, 30);
  }
  function closeCreateGroup() { groupCreateBackdrop.classList.remove("open"); }

  function updateCreateGroupDisabled() {
    const name = (groupCreateNameEl && groupCreateNameEl.value || "").trim();
    if (groupCreateSubmitBtn) groupCreateSubmitBtn.disabled = !name;
  }

  async function uploadGroupAvatar(file) {
    if (!file || !me) return null;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = "groups/" + me.id + "/" + Date.now() + "_" + Math.random().toString(36).slice(2) + "." + ext;
    try {
      const { error } = await sb.storage.from("chat-images").upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data } = sb.storage.from("chat-images").getPublicUrl(path);
      return data && data.publicUrl ? data.publicUrl : null;
    } catch (err) {
      console.warn("[Groups] avatar upload failed", err);
      return null;
    }
  }

  async function submitCreateGroup() {
    if (!me || !groupCreateSubmitBtn) return;
    const name = (groupCreateNameEl.value || "").trim();
    if (!name) return;
    const desc = (groupCreateDescEl.value || "").trim() || null;
    groupCreateSubmitBtn.disabled = true;
    groupCreateSubmitBtn.textContent = "Creating\u2026";
    try {
      let imageUrl = null;
      if (groupCreatePendingImage) imageUrl = await uploadGroupAvatar(groupCreatePendingImage);
      const { data, error } = await sb.rpc("create_group", { p_name: name, p_description: desc, p_image_url: imageUrl });
      if (error) throw error;
      const newGroupId = (Array.isArray(data) ? data[0] : data);
      await fetchMyGroups();
      if (dmSideTab === "groups") renderGroupsSidePanel();
      if (dmTab === "groups" && dmListBackdrop.classList.contains("open")) renderGroupsListModal();
      closeCreateGroup();
      if (newGroupId) openGroupRoom(newGroupId);
    } catch (err) {
      console.error("[Groups] create failed", err);
      toast("Could not create group: " + (err && err.message ? err.message : "error"), "error");
    } finally {
      groupCreateSubmitBtn.disabled = false;
      groupCreateSubmitBtn.textContent = "Create";
    }
  }

  // ---------- Group room ----------
  function clearGroupRoomState() {
    // Ephemeral-typing teardown (no DB interaction) when leaving a group.
    try { groupTyping.onLocalLeave(); } catch (_) {}
    if (groupTypingChannel) { try { sb.removeChannel(groupTypingChannel); } catch(_){} groupTypingChannel = null; }
    if (groupRoomChannel) { try { sb.removeChannel(groupRoomChannel); } catch(_){} groupRoomChannel = null; }
    if (groupReactChannel) { try { sb.removeChannel(groupReactChannel); } catch(_){} groupReactChannel = null; }
    currentGroupId = null;
    groupMessagesById.clear();
    groupRowsById.clear();
    groupReactionsByMsg.clear();
    groupReactionsByKey.clear();
    groupPendingImage = null;
    groupReplyTo = null;
    groupLastSenderId = null;
    groupLastDateLabel = null;
    if (groupRoomMessages) groupRoomMessages.innerHTML = '<div class="dm-loading">Loading\u2026</div>';
    if (groupRoomInput) groupRoomInput.value = "";
    if (groupRoomSendBtn) groupRoomSendBtn.disabled = true;
    if (groupReplyPreview) groupReplyPreview.classList.remove("open");
    if (groupImagePreview) groupImagePreview.classList.remove("open");
    if (groupImagePreviewImg) groupImagePreviewImg.src = "";
  }

  async function openGroupRoom(groupId) {
    if (!me || !groupId) return;
    clearGroupRoomState();
    currentGroupId = groupId;
    const g = myGroups.find(x => x.id === groupId);
    if (groupRoomAvatar) {
      if (g && g.image_url) { groupRoomAvatar.src = g.image_url; groupRoomAvatar.style.display = ""; }
      else { groupRoomAvatar.removeAttribute("src"); groupRoomAvatar.style.display = "none"; }
    }
    if (groupRoomName) groupRoomName.textContent = (g && g.name) || "Group";
    groupRoomBackdrop.classList.add("open");
    try {
      const res = await sb.from("group_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(500);
      if (res.error) throw res.error;
      const msgs = res.data || [];
      // Attach sender profiles via mini cache
      const senderIds = Array.from(new Set(msgs.map(m => m.sender_id).filter(Boolean)));
      if (senderIds.length && typeof getMiniProfiles === "function") {
        try { await getMiniProfiles(senderIds); } catch(_){}
      }
      for (const m of msgs) {
        const p = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(m.sender_id) : null;
        if (p) { m.username = p.username; m.avatar_url = p.avatar_url; }
        groupMessagesById.set(m.id, m);
      }
      groupRoomMessages.innerHTML = "";
      groupLastSenderId = null;
      groupLastDateLabel = null;
      for (const m of msgs) renderGroupMessage(m);
      // Load reactions
      const rxRes = await sb.from("group_message_reactions").select("*").in("message_id", msgs.map(m => m.id)).limit(5000);
      if (!rxRes.error && Array.isArray(rxRes.data)) {
        for (const r of rxRes.data) groupAddReactionToState(r);
        for (const id of groupRowsById.keys()) renderGroupReactionsFor(id);
      }
      requestAnimationFrame(() => { groupRoomMessages.scrollTop = groupRoomMessages.scrollHeight; });
      subscribeGroupRoom(groupId);
    } catch (err) {
      console.error("[Groups] open failed", err);
      groupRoomMessages.innerHTML = '<div class="dm-loading">Could not load.</div>';
    }
  }

  function closeGroupRoom() { groupRoomBackdrop.classList.remove("open"); clearGroupRoomState(); }

  function subscribeGroupRoom(groupId) {
    if (!groupId) return;
    // Swap out any stale typing channel from a previous group and clear
    // any remote typer state so indicators can't leak between groups.
    if (groupTypingChannel) { try { sb.removeChannel(groupTypingChannel); } catch (_) {} groupTypingChannel = null; }
    groupTyping.clearAllRemote();
    groupTypingChannel = sb.channel("group_typing:" + groupId, { config: { broadcast: { self: false, ack: false } } })
      .on("broadcast", { event: "typing:start" }, ({ payload }) => groupTyping.handleBroadcast("typing:start", payload))
      .on("broadcast", { event: "typing:stop"  }, ({ payload }) => groupTyping.handleBroadcast("typing:stop",  payload))
      .subscribe();
    groupRoomChannel = sb.channel("group_room:" + groupId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: "group_id=eq." + groupId }, async (payload) => {
        const m = payload.new; if (!m || groupMessagesById.has(m.id)) return;
        if (typeof getMiniProfiles === "function") {
          try { await getMiniProfiles([m.sender_id]); } catch(_){}
        }
        const p = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(m.sender_id) : null;
        if (p) { m.username = p.username; m.avatar_url = p.avatar_url; }
        renderGroupMessage(m);
        const atBottom = (groupRoomMessages.scrollHeight - groupRoomMessages.scrollTop - groupRoomMessages.clientHeight) < 120;
        if (atBottom) requestAnimationFrame(() => { groupRoomMessages.scrollTop = groupRoomMessages.scrollHeight; });
        // Remote author just sent → clear their typing indicator if lingering.
        if (m && m.sender_id) groupTyping.handleBroadcast("typing:stop", { user_id: m.sender_id });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "group_messages", filter: "group_id=eq." + groupId }, (payload) => {
        const m = payload.old; if (!m) return;
        const row = groupRowsById.get(m.id);
        if (row) row.remove();
        groupRowsById.delete(m.id);
        groupMessagesById.delete(m.id);
      })
      .subscribe();
    groupReactChannel = sb.channel("group_rx:" + groupId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_message_reactions" }, (payload) => {
        const r = payload.new; if (!r || !groupMessagesById.has(r.message_id)) return;
        groupAddReactionToState(r); renderGroupReactionsFor(r.message_id);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "group_message_reactions" }, (payload) => {
        const r = payload.old; if (!r || !groupMessagesById.has(r.message_id)) return;
        groupRemoveReactionFromState(r); renderGroupReactionsFor(r.message_id);
      })
      .subscribe();
  }

  function groupAddReactionToState(r) {
    const key = r.message_id + "|" + r.user_id + "|" + r.emoji;
    if (groupReactionsByKey.has(key)) return false;
    groupReactionsByKey.add(key);
    let byEmoji = groupReactionsByMsg.get(r.message_id);
    if (!byEmoji) { byEmoji = new Map(); groupReactionsByMsg.set(r.message_id, byEmoji); }
    let users = byEmoji.get(r.emoji);
    if (!users) { users = new Set(); byEmoji.set(r.emoji, users); }
    users.add(r.user_id);
    return true;
  }
  function groupRemoveReactionFromState(r) {
    const key = r.message_id + "|" + r.user_id + "|" + r.emoji;
    if (!groupReactionsByKey.has(key)) return false;
    groupReactionsByKey.delete(key);
    const byEmoji = groupReactionsByMsg.get(r.message_id); if (!byEmoji) return true;
    const users = byEmoji.get(r.emoji); if (!users) return true;
    users.delete(r.user_id);
    if (users.size === 0) byEmoji.delete(r.emoji);
    if (byEmoji.size === 0) groupReactionsByMsg.delete(r.message_id);
    return true;
  }

  function renderGroupReactionsFor(msgId) {
    const row = groupRowsById.get(msgId);
    if (!row) return;
    const container = row.querySelector(".reactions");
    if (!container) return;
    container.innerHTML = "";
    const byEmoji = groupReactionsByMsg.get(msgId);
    if (byEmoji && byEmoji.size > 0) {
      for (const [emoji, users] of byEmoji) {
        if (users.size === 0) continue;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "reaction" + (me && users.has(me.id) ? " mine" : "");
        chip.innerHTML = "<span>" + emoji + "</span><span class=\"count\">" + users.size + "</span>";
        chip.addEventListener("click", (e) => { e.stopPropagation(); toggleGroupReaction(msgId, emoji); });
        container.appendChild(chip);
      }
    }
    const add = document.createElement("button");
    add.type = "button"; add.className = "reaction add-emoji"; add.title = "Add reaction";
    add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = add.getBoundingClientRect();
      currentActionMode = "group";
      if (typeof openReactionPicker === "function") openReactionPicker(msgId, r.left + r.width / 2, r.top, { full: true });
    });
    container.appendChild(add);
  }

  async function toggleGroupReaction(msgId, emoji) {
    if (!me) return;
    if (!myEmailVerified) { toast("Verify your email to react", "warn"); updateVerifyBanner(); return; }
    const key = msgId + "|" + me.id + "|" + emoji;
    const had = groupReactionsByKey.has(key);
    if (had) {
      groupRemoveReactionFromState({ message_id: msgId, user_id: me.id, emoji });
      renderGroupReactionsFor(msgId);
      const { error } = await sb.from("group_message_reactions")
        .delete().eq("message_id", msgId).eq("user_id", me.id).eq("emoji", emoji);
      if (error) {
        groupAddReactionToState({ message_id: msgId, user_id: me.id, emoji });
        renderGroupReactionsFor(msgId);
        toast("Could not remove reaction", "error");
      }
    } else {
      groupAddReactionToState({ message_id: msgId, user_id: me.id, emoji });
      renderGroupReactionsFor(msgId);
      const { error } = await sb.from("group_message_reactions").insert({ message_id: msgId, user_id: me.id, emoji });
      if (error && !/duplicate key|conflict|23505/i.test(error.message || "")) {
        groupRemoveReactionFromState({ message_id: msgId, user_id: me.id, emoji });
        renderGroupReactionsFor(msgId);
        toast("Could not add reaction", "error");
      }
    }
  }

  function renderGroupMessage(m) {
    if (!m || groupRowsById.has(m.id)) return;
    groupMessagesById.set(m.id, m);
    // Day divider
    const createdAt = new Date(m.created_at);
    const dayKey = createdAt.toDateString();
    if (groupLastDateLabel !== dayKey) {
      const div = document.createElement("div"); div.className = "day-divider";
      div.innerHTML = '<strong>' + escapeHtml(fmtDayLabel(createdAt)) + '</strong>';
      groupRoomMessages.appendChild(div);
      groupLastDateLabel = dayKey; groupLastSenderId = null;
    }
    const isMe = !!(me && m.sender_id === me.id);
    const showName = m.sender_id !== groupLastSenderId;
    groupLastSenderId = m.sender_id;
    if (showName) {
      const p = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(m.sender_id) : null;
      const dispName = isMe ? (me && me.username ? me.username : "") : (m.username || (p && p.username) || "");
      if (dispName) {
        const n = document.createElement("div");
        n.className = "name-small" + (isMe ? " me" : "");
        n.textContent = dispName;
        groupRoomMessages.appendChild(n);
      }
    }
    const row = buildGroupRow(m);
    groupRoomMessages.appendChild(row);
    groupRowsById.set(m.id, row);
    renderGroupReactionsFor(m.id);
  }

  function buildGroupRow(m) {
    const createdAt = new Date(m.created_at);
    const isMe = me && m.sender_id === me.id;
    const row = document.createElement("div");
    row.className = "row " + (isMe ? "me" : "other");
    row.dataset.id = m.id; row.dataset.userId = m.sender_id;

    if (!isMe) {
      const p = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(m.sender_id) : null;
      const avBtn = document.createElement("button");
      avBtn.className = "avatar-btn"; avBtn.type = "button"; avBtn.setAttribute("aria-label", "Open profile");
      const img = document.createElement("img");
      img.className = "avatar"; img.alt = ""; img.loading = "lazy";
      img.src = m.avatar_url || (p && p.avatar_url) || "";
      img.onerror = () => {
        img.style.display = "none";
        const fb = document.createElement("div");
        fb.className = "avatar";
        Object.assign(fb.style, { display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700", color: "#fff", background: "#8e8e93" });
        const seed = m.username || (p && p.username) || "?";
        fb.textContent = seed.trim().charAt(0).toUpperCase() || "?";
        avBtn.appendChild(fb);
      };
      avBtn.appendChild(img);
      avBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pp = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(m.sender_id) : null;
        if (typeof openProfileFor === "function") openProfileFor({ id: m.sender_id, username: (m.username || (pp && pp.username) || ""), avatar_url: (m.avatar_url || (pp && pp.avatar_url) || "") });
      });
      row.appendChild(avBtn);
    }

    const stack = document.createElement("div");
    stack.className = "stack";

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap";

    const hasImage = !!m.image_url;
    const hasText = !!(m.content && m.content.length);
    const bubble = document.createElement("div");
    bubble.className = "bubble" + (hasImage && !hasText ? " image-only" : (hasImage && hasText ? " has-image image-with-caption" : ""));
    bubble.dataset.id = m.id;

    if (m.reply_to_id) {
      const snip = document.createElement("button");
      snip.type = "button";
      snip.className = "reply-snippet";
      const parent = groupMessagesById.get(m.reply_to_id);
      if (parent) {
        const pName = parent.username || ((typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? ((profileMiniCache.get(parent.sender_id) || {}).username) : "") || "User";
        snip.innerHTML =
          '<span class="reply-to">' + escapeHtml(pName) + '</span>' +
          '<span class="reply-text">' + escapeHtml(groupSnippet(parent)) + '</span>';
      } else {
        snip.className += " missing";
        snip.innerHTML = '<span class="reply-to">Reply</span><span class="reply-text">Original message unavailable</span>';
      }
      snip.addEventListener("click", (e) => {
        e.stopPropagation();
        const r = groupRowsById.get(m.reply_to_id);
        if (r) { r.scrollIntoView({ behavior: "smooth", block: "center" }); r.classList.add("pulse"); setTimeout(() => r.classList.remove("pulse"), 900); }
      });
      bubble.appendChild(snip);
    }

    if (hasImage) {
      const mi = document.createElement("img");
      mi.className = "msg-image";
      mi.alt = ""; mi.loading = "lazy"; mi.src = m.image_url;
      mi.addEventListener("click", (e) => { e.stopPropagation(); openImageViewer(m.image_url); });
      mi.onerror = () => {
        const fb = document.createElement("div");
        fb.textContent = "Image failed to load";
        fb.style.cssText = "color:var(--muted);font-size:12px;padding:8px 2px;";
        mi.replaceWith(fb);
      };
      bubble.appendChild(mi);
    }
    if (hasText) {
      const textNode = document.createElement("span");
      textNode.className = "msg-text";
      // Groups allow links (same as DMs) — no mention processing.
      if (typeof autolinkDmContent === "function") {
        textNode.innerHTML = autolinkDmContent(m.content);
      } else {
        textNode.textContent = m.content;
      }
      bubble.appendChild(textNode);
    }

    // Double-click → reaction picker
    bubble.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const r = bubble.getBoundingClientRect();
      currentActionMode = "group";
      openReactionPicker(m.id, r.left + r.width / 2, r.top);
    });

    wrap.appendChild(bubble);

    // Inline reply + 3-dot (same as DM/main)
    const actions = document.createElement("div");
    actions.className = "inline-actions";
    const replyBtn = document.createElement("button");
    replyBtn.type = "button"; replyBtn.title = "Reply"; replyBtn.setAttribute("aria-label", "Reply");
    replyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v2"/></svg>';
    replyBtn.addEventListener("click", (e) => { e.stopPropagation(); setGroupReplyTo(m); });
    const moreBtn = document.createElement("button");
    moreBtn.type = "button"; moreBtn.title = "More"; moreBtn.setAttribute("aria-label", "More actions");
    moreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      currentActionMode = "group";
      drawerTargetId = m.id;
      applyImageOnlyActions(drawerEl, m);
      drawerEl.classList.add("open");
    });
    actions.appendChild(replyBtn);
    actions.appendChild(moreBtn);
    wrap.appendChild(actions);

    stack.appendChild(wrap);

    const reactsEl = document.createElement("div");
    reactsEl.className = "reactions";
    reactsEl.dataset.msgId = m.id;
    stack.appendChild(reactsEl);

    row.appendChild(stack);

    const rowTime = document.createElement("div");
    rowTime.className = "row-time";
    rowTime.textContent = fmtTime(createdAt);
    row.appendChild(rowTime);

    // Context menu on right-click (desktop) — route to group mode
    bubble.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      currentActionMode = "group";
      if (typeof openCtxMenu === "function") openCtxMenu(m.id, e.clientX, e.clientY);
    });
    // Long-press → drawer on mobile
    let lpTimer = null;
    const onStart = () => { lpTimer = setTimeout(() => {
      currentActionMode = "group";
      drawerTargetId = m.id;
      applyImageOnlyActions(drawerEl, m);
      drawerEl.classList.add("open");
    }, 380); };
    const onEnd = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
    bubble.addEventListener("touchstart", onStart, { passive: true });
    bubble.addEventListener("touchend", onEnd);
    bubble.addEventListener("touchmove", onEnd);

    return row;
  }

  function setGroupReplyTo(m) {
    groupReplyTo = m;
    if (!groupReplyPreview) return;
    groupReplyPreview.classList.add("open");
    const p = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(m.sender_id) : null;
    groupReplyName.textContent = (m && (m.username || (p && p.username))) || "User";
    groupReplyText.textContent = groupSnippet(m);
    try { groupRoomInput.focus(); } catch(_){}
  }
  function clearGroupReply() {
    groupReplyTo = null;
    if (groupReplyPreview) groupReplyPreview.classList.remove("open");
  }

  function handleGroupAction(act, id) {
    const m = groupMessagesById.get(id);
    if (!m) { currentActionMode = "main"; return; }
    if (act === "reply") {
      setGroupReplyTo(m);
    } else if (act === "react") {
      const row = groupRowsById.get(id);
      const bubble = row && row.querySelector(".bubble");
      const target = bubble || row;
      const r = target.getBoundingClientRect();
      if (typeof openReactionPicker === "function") openReactionPicker(id, r.left + r.width / 2, r.top);
    } else if (act === "download") {
      if (!m.image_url) return;
      if (typeof downloadMessageImage === "function") downloadMessageImage({ image_url: m.image_url, id: m.id });
    } else if (act === "self-delete") {
      if (!me || m.sender_id !== me.id) return;
      selfDeleteGroupMessage(m);
    }
  }

  async function selfDeleteGroupMessage(m) {
    if (!m || !me || m.sender_id !== me.id) return;
    if (!confirm("Delete this message? This cannot be undone.")) return;
    try {
      const { error } = await sb.from("group_messages").delete().eq("id", m.id).eq("sender_id", me.id);
      if (error) throw error;
      const row = groupRowsById.get(m.id); if (row) row.remove();
      groupRowsById.delete(m.id); groupMessagesById.delete(m.id);
    } catch (err) {
      console.error("[Groups] self-delete failed", err);
      toast("Could not delete: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  async function uploadGroupImage(file) {
    if (!file || !me) return null;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = "groups/" + me.id + "/" + Date.now() + "_" + Math.random().toString(36).slice(2) + "." + ext;
    try {
      const { error } = await sb.storage.from("chat-images").upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data } = sb.storage.from("chat-images").getPublicUrl(path);
      return data && data.publicUrl ? data.publicUrl : null;
    } catch (err) {
      console.warn("[Groups] image upload failed", err);
      return null;
    }
  }

  async function sendGroupMessage() {
    if (!me || !currentGroupId) return;
    if (!myEmailVerified) { toast("Verify your email to send messages", "warn"); updateVerifyBanner(); return; }
    const text = (groupRoomInput.value || "").trim();
    const file = groupPendingImage;
    if (!text && !file) return;
    groupRoomSendBtn.disabled = true;
    try { groupTyping.onLocalSend(); } catch (_) {}
    try {
      let imageUrl = null;
      if (file) imageUrl = await uploadGroupImage(file);
      const payload = {
        group_id: currentGroupId,
        sender_id: me.id,
        content: text || null,
        image_url: imageUrl,
        reply_to_id: (groupReplyTo && groupReplyTo.id) || null
      };
      const { error } = await sb.from("group_messages").insert(payload);
      if (error) throw error;
      groupRoomInput.value = "";
      groupPendingImage = null;
      if (groupImagePreview) groupImagePreview.classList.remove("open");
      if (groupImagePreviewImg) groupImagePreviewImg.src = "";
      clearGroupReply();
      autoResizeGroupInput();
    } catch (err) {
      console.error("[Groups] send failed", err);
      toast("Could not send: " + (err && err.message ? err.message : "error"), "error");
    } finally {
      groupRoomSendBtn.disabled = !(groupRoomInput.value || "").trim() && !groupPendingImage;
    }
  }

  function autoResizeGroupInput() {
    if (!groupRoomInput) return;
    groupRoomInput.style.height = "auto";
    groupRoomInput.style.height = Math.min(groupRoomInput.scrollHeight, 140) + "px";
  }

  // ---------- Add member overlay ----------
  async function openAddMember() {
    if (!me || !currentGroupId) return;
    groupAddBackdrop.classList.add("open");
    groupAddBody.innerHTML = '<div class="popup-empty">Loading friends\u2026</div>';
    try {
      // Load current members to prevent duplicates
      const memRes = await sb.from("group_members").select("user_id").eq("group_id", currentGroupId);
      const memberIds = new Set((memRes.data || []).map(r => r.user_id));
      groupMemberIdsByGroup.set(currentGroupId, memberIds);
      // Load accepted friends via friend_requests (sender_id / receiver_id)
      let friends = [];
      const a = await sb.from("friend_requests")
        .select("sender_id,receiver_id,status")
        .or("sender_id.eq." + me.id + ",receiver_id.eq." + me.id)
        .eq("status", "accepted");
      if (!a.error && Array.isArray(a.data)) {
        for (const fr of a.data) friends.push({ user_id: (fr.sender_id === me.id) ? fr.receiver_id : fr.sender_id });
      }
      // Normalize to user_ids + resolve profiles
      const ids = Array.from(new Set(friends.map(f => f.user_id || f.id).filter(Boolean)));
      if (!ids.length) { groupAddBody.innerHTML = '<div class="popup-empty">You have no friends to add yet.</div>'; return; }
      if (typeof getMiniProfiles === "function") { try { await getMiniProfiles(ids); } catch(_){} }
      groupAddBody.innerHTML = "";
      let rendered = 0;
      for (const uid of ids) {
        const p = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(uid) : null;
        if (!p || !p.username) continue;
        const already = memberIds.has(uid);
        const row = document.createElement("div");
        row.className = "gadd-row"; if (already) row.setAttribute("aria-disabled", "true");
        const av = document.createElement("span"); av.className = "gadd-avatar";
        const img = document.createElement("img"); img.alt = "";
        if (p.avatar_url) img.src = p.avatar_url; else img.style.display = "none";
        av.appendChild(img);
        const dot = document.createElement("span");
        const ps = (typeof presenceStateFor === "function") ? presenceStateFor(uid) : null;
        const online = !!(ps && ps.online);
        dot.className = "presence-dot " + (online ? "online" : "offline");
        dot.dataset.userId = uid;
        av.appendChild(dot);
        row.appendChild(av);
        const name = document.createElement("div"); name.className = "gadd-name"; name.textContent = p.username;
        if (already) { const sub = document.createElement("span"); sub.className = "gadd-sub"; sub.textContent = "Already a member"; name.appendChild(sub); }
        row.appendChild(name);
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "gadd-action"; btn.textContent = already ? "Added" : "Add";
        btn.disabled = already;
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          btn.disabled = true; btn.textContent = "Adding\u2026";
          try {
            const { error } = await sb.rpc("add_group_member", { p_group: currentGroupId, p_user: uid });
            if (error) throw error;
            memberIds.add(uid);
            btn.textContent = "Added";
            row.setAttribute("aria-disabled", "true");
            const sub = document.createElement("span"); sub.className = "gadd-sub"; sub.textContent = "Added";
            name.appendChild(sub);
          } catch (err) {
            console.error("[Groups] add member failed", err);
            toast("Could not add: " + (err && err.message ? err.message : "error"), "error");
            btn.disabled = false; btn.textContent = "Add";
          }
        });
        row.appendChild(btn);
        row.addEventListener("click", () => { if (!already && !btn.disabled) btn.click(); });
        groupAddBody.appendChild(row);
        rendered++;
      }
      if (!rendered) groupAddBody.innerHTML = '<div class="popup-empty">You have no friends to add yet.</div>';
    } catch (err) {
      console.error("[Groups] friends load failed", err);
      groupAddBody.innerHTML = '<div class="popup-empty">Could not load friends.</div>';
    }
  }
  function closeAddMember() { groupAddBackdrop.classList.remove("open"); }

  // ---------- Group Settings (owner-only edit) ----------
  const groupSettingsBackdrop = document.getElementById("group-settings-backdrop");
  const groupSettingsBody     = document.getElementById("group-settings-body");
  const groupSettingsClose    = document.getElementById("group-settings-close");

  let groupSettingsPendingImage = null; // File | null — new file picked but not yet saved
  let groupSettingsPendingClear = false; // bool — user hit "Remove image"
  let groupSettingsCurrentImage = "";    // string — existing image_url at open time
  function closeGroupSettings() {
    if (groupSettingsBackdrop) groupSettingsBackdrop.classList.remove("open");
    groupSettingsPendingImage = null;
    groupSettingsPendingClear = false;
    groupSettingsCurrentImage = "";
  }
  if (groupSettingsClose) groupSettingsClose.addEventListener("click", closeGroupSettings);
  if (groupSettingsBackdrop) groupSettingsBackdrop.addEventListener("click", (e) => { if (e.target === groupSettingsBackdrop) closeGroupSettings(); });

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  async function openGroupSettings() {
    if (!me || !currentGroupId || !groupSettingsBackdrop) return;
    groupSettingsBackdrop.classList.add("open");
    groupSettingsBody.innerHTML = '<div class="popup-empty">Loading\u2026</div>';
    try {
      const g = myGroups.find(x => x.id === currentGroupId) || null;
      // Fetch members with profile data
      const memRes = await sb.from("group_members").select("user_id, role, created_at").eq("group_id", currentGroupId);
      if (memRes.error) throw memRes.error;
      const memberRows = memRes.data || [];
      const memberIds = memberRows.map(r => r.user_id);
      let profByUid = new Map();
      if (memberIds.length) {
        const profRes = await sb.from("profiles").select("user_id, username, avatar_url").in("user_id", memberIds);
        if (!profRes.error && profRes.data) {
          for (const p of profRes.data) profByUid.set(p.user_id, p);
        }
      }
      const ownerId = g ? g.created_by : null;
      const isOwner = !!(g && me && g.created_by === me.id);
      const safeName = escHtml(g ? (g.name || "") : "");
      const safeDesc = escHtml(g ? (g.description || "") : "");
      const safeImg  = escHtml(g ? (g.image_url || "") : "");
      groupSettingsCurrentImage = (g && g.image_url) || "";
      groupSettingsPendingImage = null;
      groupSettingsPendingClear = false;
      const membersHtml = memberRows.map(r => {
        const p = profByUid.get(r.user_id);
        const uname = escHtml(p ? (p.username || "Member") : "Member");
        const av = p && p.avatar_url ? `<img class="avatar" src="${escHtml(p.avatar_url)}" alt="">` : `<div class="avatar" style="background:var(--border)"></div>`;
        const roleTag = r.user_id === ownerId ? '<span class="gs-role">Owner</span>' : "";
        const canRemove = isOwner && r.user_id !== me.id;
        const rmBtn = canRemove ? `<button type="button" class="gs-rm" data-uid="${escHtml(r.user_id)}">Remove</button>` : "";
        return `<div class="gs-mem" data-uid="${escHtml(r.user_id)}">${av}<div class="gs-mem-name">${uname}${roleTag}</div>${rmBtn}</div>`;
      }).join("");
      const ownerForm = isOwner ? `
        <div class="gs-section">
          <label class="gs-label">Group image</label>
          <div class="gs-image-row">
            <span class="gs-image-preview" id="gs-image-preview">${safeImg ? '<img src="' + safeImg + '" alt="" />' : '<span class="gs-image-ph">?</span>'}</span>
            <input type="file" id="gs-image-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden />
            <button type="button" class="gs-btn" id="gs-image-pick">Change image</button>
            <button type="button" class="gs-btn" id="gs-image-clear" ${safeImg ? "" : "hidden"}>Remove</button>
          </div>
          <label class="gs-label">Group name</label>
          <input type="text" id="gs-name" class="gs-input" value="${safeName}" maxlength="80" />
          <label class="gs-label">Description</label>
          <textarea id="gs-desc" class="gs-input gs-textarea" rows="3" maxlength="400">${safeDesc}</textarea>
          <div class="gs-actions">
            <button type="button" class="gs-btn gs-btn-primary" id="gs-save">Save</button>
            <button type="button" class="gs-btn gs-btn-danger" id="gs-delete">Delete group</button>
          </div>
        </div>` : `
        <div class="gs-section gs-readonly">
          <div class="gs-label">Group name</div>
          <div class="gs-ro">${safeName || "(untitled)"}</div>
          <div class="gs-label">Description</div>
          <div class="gs-ro">${safeDesc || "(no description)"}</div>
          <div class="gs-actions">
            <button type="button" class="gs-btn gs-btn-danger" id="gs-leave">Leave group</button>
          </div>
        </div>`;
      groupSettingsBody.innerHTML = `
        ${ownerForm}
        <div class="gs-section">
          <div class="gs-label">Members (${memberRows.length})</div>
          <div class="gs-members">${membersHtml}</div>
        </div>
      `;
      if (isOwner) {
        const btnSave   = groupSettingsBody.querySelector("#gs-save");
        const btnDelete = groupSettingsBody.querySelector("#gs-delete");
        if (btnSave)   btnSave.addEventListener("click", saveGroupSettings);
        if (btnDelete) btnDelete.addEventListener("click", confirmDeleteGroup);
        groupSettingsBody.querySelectorAll(".gs-rm").forEach(b => {
          b.addEventListener("click", () => removeGroupMember(b.dataset.uid));
        });
        // Image picker wiring
        const fileInput = groupSettingsBody.querySelector("#gs-image-file");
        const pickBtn   = groupSettingsBody.querySelector("#gs-image-pick");
        const clearBtn  = groupSettingsBody.querySelector("#gs-image-clear");
        const preview   = groupSettingsBody.querySelector("#gs-image-preview");
        if (pickBtn && fileInput) {
          pickBtn.addEventListener("click", () => fileInput.click());
        }
        if (fileInput) {
          fileInput.addEventListener("change", () => {
            const f = fileInput.files && fileInput.files[0];
            if (!f) return;
            if (!/^image\//.test(f.type)) { toast("Please select an image file.", "error"); fileInput.value = ""; return; }
            if (f.size > 5 * 1024 * 1024) { toast("Image too large (max 5MB).", "error"); fileInput.value = ""; return; }
            groupSettingsPendingImage = f;
            groupSettingsPendingClear = false;
            if (preview) {
              preview.innerHTML = "";
              const im = document.createElement("img");
              im.alt = "";
              const rd = new FileReader();
              rd.onload = () => { im.src = rd.result; };
              rd.readAsDataURL(f);
              preview.appendChild(im);
            }
            if (clearBtn) clearBtn.hidden = false;
          });
        }
        if (clearBtn) {
          clearBtn.addEventListener("click", () => {
            groupSettingsPendingImage = null;
            groupSettingsPendingClear = true;
            if (fileInput) fileInput.value = "";
            if (preview) preview.innerHTML = '<span class="gs-image-ph">?</span>';
            clearBtn.hidden = true;
          });
        }
      } else {
        const btnLeave = groupSettingsBody.querySelector("#gs-leave");
        if (btnLeave) btnLeave.addEventListener("click", leaveGroup);
      }
    } catch (err) {
      console.error("[Group] settings load failed", err);
      groupSettingsBody.innerHTML = '<div class="popup-empty">Could not load group settings.</div>';
    }
  }

  async function saveGroupSettings() {
    if (!me || !currentGroupId) return;
    const nameEl = groupSettingsBody.querySelector("#gs-name");
    const descEl = groupSettingsBody.querySelector("#gs-desc");
    const name = nameEl ? nameEl.value.trim() : "";
    const desc = descEl ? descEl.value.trim() : "";
    if (!name) { toast("Group name is required.", "error"); return; }
    // Resolve image: upload new → use URL; cleared → null; unchanged → keep current.
    let img = groupSettingsCurrentImage || null;
    const btnSave = groupSettingsBody.querySelector("#gs-save");
    if (btnSave) btnSave.disabled = true;
    try {
      if (groupSettingsPendingClear) {
        img = null;
      } else if (groupSettingsPendingImage) {
        const uploaded = await uploadGroupImage(groupSettingsPendingImage);
        if (!uploaded) { toast("Image upload failed.", "error"); if (btnSave) btnSave.disabled = false; return; }
        img = uploaded;
      }
      const { error } = await sb.rpc("update_group", { p_group: currentGroupId, p_name: name, p_description: desc || null, p_image_url: img });
      if (error) throw error;
      toast("Group updated.", "default", 1800);
      // Refresh local state
      const g = myGroups.find(x => x.id === currentGroupId);
      if (g) { g.name = name; g.description = desc; g.image_url = img || ""; }
      const nameLbl = document.getElementById("group-room-name");
      const avLbl   = document.getElementById("group-room-avatar");
      if (nameLbl) nameLbl.textContent = name;
      if (avLbl) {
        if (img) { avLbl.src = img; avLbl.style.visibility = "visible"; }
        else { avLbl.src = ""; avLbl.style.visibility = "hidden"; }
      }
      closeGroupSettings();
      try { if (typeof renderGroupsListModal === "function") renderGroupsListModal(); if (typeof renderGroupsSidePanel === "function") renderGroupsSidePanel(); } catch(_){}
    } catch (err) {
      console.error("[Group] update failed", err);
      toast("Could not update: " + (err && err.message ? err.message : "error"), "error");
    } finally {
      if (btnSave) btnSave.disabled = false;
    }
  }

  async function confirmDeleteGroup() {
    if (!me || !currentGroupId) return;
    if (!confirm("Delete this group for everyone? This cannot be undone.")) return;
    try {
      const { error } = await sb.rpc("delete_group", { p_group: currentGroupId });
      if (error) throw error;
      toast("Group deleted.", "default", 1800);
      closeGroupSettings();
      const gi = myGroups.findIndex(x => x.id === currentGroupId);
      if (gi >= 0) myGroups.splice(gi, 1);
      try { if (typeof renderGroupsListModal === "function") renderGroupsListModal(); if (typeof renderGroupsSidePanel === "function") renderGroupsSidePanel(); } catch(_){}
      try { if (typeof closeGroupRoom === "function") closeGroupRoom(); } catch(_){}
    } catch (err) {
      console.error("[Group] delete failed", err);
      toast("Could not delete: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  async function removeGroupMember(uid) {
    if (!me || !currentGroupId || !uid) return;
    if (!confirm("Remove this member from the group?")) return;
    try {
      const { error } = await sb.rpc("remove_group_member", { p_group: currentGroupId, p_user: uid });
      if (error) throw error;
      toast("Member removed.", "default", 1600);
      openGroupSettings(); // refresh
    } catch (err) {
      console.error("[Group] remove member failed", err);
      toast("Could not remove: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  async function leaveGroup() {
    if (!me || !currentGroupId) return;
    if (!confirm("Leave this group?")) return;
    try {
      const { error } = await sb.from("group_members").delete().eq("group_id", currentGroupId).eq("user_id", me.id);
      if (error) throw error;
      toast("Left group.", "default", 1600);
      closeGroupSettings();
      const gi = myGroups.findIndex(x => x.id === currentGroupId);
      if (gi >= 0) myGroups.splice(gi, 1);
      try { if (typeof renderGroupsListModal === "function") renderGroupsListModal(); if (typeof renderGroupsSidePanel === "function") renderGroupsSidePanel(); } catch(_){}
      try { if (typeof closeGroupRoom === "function") closeGroupRoom(); } catch(_){}
    } catch (err) {
      console.error("[Group] leave failed", err);
      toast("Could not leave: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  async function openDmList() {
    if (!me) return;
    dmListBackdrop.classList.add("open");
    dmListBody.innerHTML = '<div class="popup-empty">Loading\u2026</div>';
    try {
      await fetchDmRooms();
      // Default to the "All" tab on open, but if all rooms are requests, surface Requests instead.
      const accepted = dmRoomsList.filter(r => !r.is_request).length;
      const incoming = dmRoomsList.filter(r => r.is_request && r.requester_id && r.requester_id !== me.id).length;
      setDmTab((accepted === 0 && incoming > 0) ? "requests" : "all");
    } catch (err) {
      console.error("[DM] list failed", err);
      dmListBody.innerHTML = '<div class="popup-empty">Could not load messages.</div>';
    }
  }
  function closeDmList() { dmListBackdrop.classList.remove("open"); }

  // ---------- DMs: room (feature-parity with main chat) ----------
  function clearDmRoomState() {
    // Announce a stop and tear down the typing channel for the leaving room
    // so we don't leak listeners or keep a stale indicator on the peer.
    try { dmTyping.onLocalLeave(); } catch (_) {}
    if (dmTypingChannel) { try { sb.removeChannel(dmTypingChannel); } catch(_){} dmTypingChannel = null; }
    if (dmRoomChannel) { try { sb.removeChannel(dmRoomChannel); } catch(_){} dmRoomChannel = null; }
    if (dmReactChannel) { try { sb.removeChannel(dmReactChannel); } catch(_){} dmReactChannel = null; }
    // Stop observing rows for the leaving room and drop any pending
    // read-mark IDs — they belong to the old room.
    if (_dmReadObserver) { try { _dmReadObserver.disconnect(); } catch(_){} _dmReadObserver = null; }
    _dmReadQueue.clear();
    currentDmRoom = null;
    dmMessagesById.clear();
    dmRowsById.clear();
    dmReactionsByMsg.clear();
    dmReactionsByKey.clear();
    dmLastSenderId = null;
    dmLastDateLabel = null;
    dmReplyTo = null;
    dmPendingImage = null;
    dmRoomMessages.innerHTML = "";
    dmRoomInput.value = "";
    dmRoomInput.style.height = "";
    dmRoomSend.disabled = true;
    if (dmReplyPreview) dmReplyPreview.classList.remove("open");
    if (dmImagePreview) dmImagePreview.classList.remove("open");
    if (dmImagePreviewImg) dmImagePreviewImg.src = "";
    if (dmFileInput) dmFileInput.value = "";
    if (dmRequestBar) dmRequestBar.hidden = true;
  }

  function dmSnippet(m) {
    if (!m) return "";
    if (m.image_url && !m.content) return "\uD83D\uDCF7 Photo";
    const t = (m.content || "").trim();
    return t.length > 120 ? t.slice(0, 117) + "\u2026" : t;
  }

  // ---- Reactions (DM scope) ----
  function dmAddReactionToState(r) {
    const key = r.message_id + "|" + r.user_id + "|" + r.emoji;
    if (dmReactionsByKey.has(key)) return false;
    dmReactionsByKey.add(key);
    let byEmoji = dmReactionsByMsg.get(r.message_id);
    if (!byEmoji) { byEmoji = new Map(); dmReactionsByMsg.set(r.message_id, byEmoji); }
    let users = byEmoji.get(r.emoji);
    if (!users) { users = new Set(); byEmoji.set(r.emoji, users); }
    users.add(r.user_id);
    return true;
  }
  function dmRemoveReactionFromState(r) {
    const key = r.message_id + "|" + r.user_id + "|" + r.emoji;
    if (!dmReactionsByKey.has(key)) return false;
    dmReactionsByKey.delete(key);
    const byEmoji = dmReactionsByMsg.get(r.message_id);
    if (!byEmoji) return false;
    const users = byEmoji.get(r.emoji);
    if (!users) return false;
    users.delete(r.user_id);
    if (users.size === 0) byEmoji.delete(r.emoji);
    if (byEmoji.size === 0) dmReactionsByMsg.delete(r.message_id);
    return true;
  }
  function renderDmReactionsFor(msgId) {
    const row = dmRowsById.get(msgId);
    if (!row) return;
    const container = row.querySelector(".reactions");
    if (!container) return;
    container.innerHTML = "";
    const byEmoji = dmReactionsByMsg.get(msgId);
    if (byEmoji && byEmoji.size > 0) {
      for (const [emoji, users] of byEmoji) {
        if (users.size === 0) continue;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "reaction" + (me && users.has(me.id) ? " mine" : "");
        chip.title = Array.from(users).join(", ");
        chip.innerHTML = "<span>" + emoji + "</span><span class=\"count\">" + users.size + "</span>";
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          currentActionMode = "dm";
          toggleReaction(msgId, emoji);
        });
        container.appendChild(chip);
      }
    }
    const add = document.createElement("button");
    add.type = "button";
    add.className = "reaction add-emoji";
    add.setAttribute("aria-label", "Add reaction");
    add.title = "Add reaction";
    add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = add.getBoundingClientRect();
      currentActionMode = "dm";
      openReactionPicker(msgId, r.left + r.width / 2, r.top, { full: true });
    });
    container.appendChild(add);
  }
  async function toggleDmReaction(msgId, emoji) {
    if (!me) return;
    if (!myEmailVerified) { toast("Verify your email to react", "warn"); updateVerifyBanner(); return; }
    const key = msgId + "|" + me.id + "|" + emoji;
    const had = dmReactionsByKey.has(key);
    if (had) {
      const ok = dmRemoveReactionFromState({ message_id: msgId, user_id: me.id, emoji });
      if (ok) renderDmReactionsFor(msgId);
      const { error } = await sb.from("dm_message_reactions")
        .delete().eq("message_id", msgId).eq("user_id", me.id).eq("emoji", emoji);
      if (error) {
        console.error("[DM] Remove reaction failed", error);
        toast("Could not remove reaction", "error");
        dmAddReactionToState({ message_id: msgId, user_id: me.id, emoji });
        renderDmReactionsFor(msgId);
      }
    } else {
      const ok = dmAddReactionToState({ message_id: msgId, user_id: me.id, emoji });
      if (!ok) return;
      renderDmReactionsFor(msgId);
      const { error } = await sb.from("dm_message_reactions").insert({ message_id: msgId, user_id: me.id, emoji });
      if (error && !/duplicate key|conflict|23505/i.test(error.message || "")) {
        console.error("[DM] Add reaction failed", error);
        toast("Could not add reaction", "error");
        dmRemoveReactionFromState({ message_id: msgId, user_id: me.id, emoji });
        renderDmReactionsFor(msgId);
      }
    }
  }

  // ---- DM read-receipt (Telegram-style "seen") ----
  // STATE:
  //   dm_messages.read_at is a single timestamptz per message. Because
  //   DM rooms are strictly 1:1 (dm_rooms.user_one / user_two), a single
  //   column is sufficient to encode "seen by the other participant".
  //   Group chats and public chat use separate tables and are NEVER
  //   touched by this system. The UI for my-own bubbles toggles between
  //   one tick (sent) and two ticks (seen by recipient). For incoming
  //   messages, opening the DM room and/or the message entering the
  //   viewport flips read_at on the server; the sender's device picks
  //   that up via a Realtime UPDATE subscription and repaints its own
  //   bubble as "seen".
  //
  // PERFORMANCE:
  //   - Read-marking is batched: IDs are queued and flushed on the next
  //     animation frame with a single .update()..in('id', ids) call.
  //   - The IntersectionObserver is created lazily and re-created per
  //     DM room so it doesn't leak across rooms.
  //   - Fallback: if IntersectionObserver is unavailable, every visible
  //     incoming message on room-open / room-scroll is considered seen.
  const _dmReadQueue = new Set();
  let   _dmReadFlushScheduled = false;
  let   _dmReadObserver = null;

  function _dmBuildReceiptEl() {
    const el = document.createElement("span");
    el.className = "dm-read-receipt";
    el.setAttribute("aria-hidden", "true");
    el.dataset.state = "sent";
    // Two nested checkmarks: the second one is hidden in the "sent" state.
    el.innerHTML =
      '<svg class="tick-1" viewBox="0 0 16 12" aria-hidden="true">' +
        '<path d="M1 6.5 L5.5 11 L15 1.5"/>' +
      '</svg>' +
      '<svg class="tick-2" viewBox="0 0 16 12" aria-hidden="true">' +
        '<path d="M1 6.5 L5.5 11 L15 1.5"/>' +
      '</svg>';
    return el;
  }

  function _dmApplyReadStateToRow(m) {
    if (!m || !me || m.sender_id !== me.id) return;
    const row = dmRowsById.get(m.id);
    if (!row) return;
    const rr = row.querySelector(".dm-read-receipt");
    if (!rr) return;
    const seen = !!m.read_at;
    rr.dataset.state = seen ? "seen" : "sent";
    rr.classList.add("show");
    rr.setAttribute(
      "aria-label",
      seen ? "Read " + fmtTime(new Date(m.read_at)) : "Sent"
    );
    rr.title = rr.getAttribute("aria-label");
  }

  function _dmRepaintAllMyReceipts() {
    if (!currentDmRoom || !me) return;
    for (const m of dmMessagesById.values()) {
      if (m && m.sender_id === me.id && m.room_id === currentDmRoom.id) {
        _dmApplyReadStateToRow(m);
      }
    }
  }

  function _dmScheduleReadFlush() {
    if (_dmReadFlushScheduled) return;
    _dmReadFlushScheduled = true;
    requestAnimationFrame(() => {
      _dmReadFlushScheduled = false;
      _dmFlushRead();
    });
  }

  async function _dmFlushRead() {
    if (!me || !_dmReadQueue.size) return;
    const ids = Array.from(_dmReadQueue);
    _dmReadQueue.clear();
    // Hard guard: never mark my own messages; never mark in group/public.
    // (Both invariants are already enforced by the queue producers — this
    // is a defence-in-depth filter in case a future caller violates them.)
    const roomId = currentDmRoom && currentDmRoom.id;
    if (!roomId) return;
    try {
      const { error } = await sb
        .from("dm_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .eq("room_id", roomId)
        .neq("sender_id", me.id)
        .is("read_at", null);
      if (error) {
        console.warn("[DM] read-mark failed", error);
      }
    } catch (e) {
      console.warn("[DM] read-mark exception", e);
    }
  }

  function _dmQueueRead(messageId) {
    const m = dmMessagesById.get(messageId);
    if (!m || !me) return;
    if (m.sender_id === me.id) return;          // never mark my own
    if (m.read_at) return;                       // already seen
    if (!currentDmRoom || m.room_id !== currentDmRoom.id) return;
    // Optimistically set on local state so we don't re-queue.
    m.read_at = m.read_at || new Date().toISOString();
    _dmReadQueue.add(messageId);
    _dmScheduleReadFlush();
  }

  function _dmTryMarkAsRead(m) {
    if (!m) return;
    // Mark only if the DM room is the currently-open, focused room and
    // the page/tab is visible. Otherwise defer to viewport / focus events.
    if (document.hidden) return;
    if (!dmRoomBackdrop.classList.contains("open")) return;
    if (!currentDmRoom || m.room_id !== currentDmRoom.id) return;
    // Request-bar state: the receiver of an unaccepted request shouldn't
    // flip to "seen" silently before they accept — but this is a UX
    // judgement call. Telegram shows seen as soon as you open the thread,
    // so we match that.
    _dmQueueRead(m.id);
  }

  function _dmMarkAllVisibleAsRead() {
    if (!currentDmRoom || !me) return;
    if (document.hidden) return;
    if (!dmRoomBackdrop.classList.contains("open")) return;
    const containerRect = dmRoomMessages.getBoundingClientRect();
    for (const [id, row] of dmRowsById.entries()) {
      const m = dmMessagesById.get(id);
      if (!m || m.sender_id === me.id || m.read_at) continue;
      const r = row.getBoundingClientRect();
      const visible =
        r.bottom > containerRect.top &&
        r.top    < containerRect.bottom;
      if (visible) _dmQueueRead(id);
    }
  }

  function _dmResetReadObserver() {
    if (_dmReadObserver) {
      try { _dmReadObserver.disconnect(); } catch(_){}
      _dmReadObserver = null;
    }
    if (typeof IntersectionObserver === "undefined") return;
    _dmReadObserver = new IntersectionObserver((entries) => {
      if (document.hidden) return;
      for (const ent of entries) {
        if (!ent.isIntersecting) continue;
        const id = ent.target && ent.target.dataset && ent.target.dataset.id;
        if (!id) continue;
        const m = dmMessagesById.get(id);
        if (!m) continue;
        _dmTryMarkAsRead(m);
      }
    }, {
      root: dmRoomMessages,
      threshold: 0.6
    });
  }

  function _dmObserveRowForRead(row, m) {
    if (!row || !m || !me) return;
    if (m.sender_id === me.id) return;
    if (m.read_at) return;
    if (_dmReadObserver) {
      try { _dmReadObserver.observe(row); } catch(_){}
    } else {
      // No IntersectionObserver support → mark synchronously on add.
      _dmTryMarkAsRead(m);
    }
  }

  // ---- DM row builder (mirrors main chat buildRow/renderMessage) ----
  function setDmReplyTo(m) {
    dmReplyTo = m;
    if (!dmReplyPreview) return;
    dmReplyPreview.classList.add("open");
    dmReplyName.textContent = (m && m.username) || "User";
    dmReplyText.textContent = dmSnippet(m);
    try { dmRoomInput.focus(); } catch(_){}
  }
  function clearDmReply() {
    dmReplyTo = null;
    if (dmReplyPreview) dmReplyPreview.classList.remove("open");
  }
  function jumpToDmMessage(id) {
    const row = dmRowsById.get(id);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("pulse");
    setTimeout(() => row.classList.remove("pulse"), 900);
  }

  function buildDmRow(m) {
    const createdAt = new Date(m.created_at);
    const isMe = me && m.sender_id === me.id;
    const row = document.createElement("div");
    row.className = "row " + (isMe ? "me" : "other");
    row.dataset.id = m.id;
    row.dataset.userId = m.sender_id;

    if (!isMe) {
      const avBtn = document.createElement("button");
      avBtn.className = "avatar-btn";
      avBtn.type = "button";
      avBtn.setAttribute("aria-label", "Open profile");
      const img = document.createElement("img");
      img.className = "avatar";
      img.alt = ""; img.loading = "lazy";
      img.src = m.avatar_url || (currentDmRoom && currentDmRoom.otherProfile && currentDmRoom.otherProfile.avatar_url) || "";
      img.onerror = () => {
        img.style.display = "none";
        const fb = document.createElement("div");
        fb.className = "avatar";
        Object.assign(fb.style, {
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: "700", color: "#fff", background: "#8e8e93"
        });
        const seed = m.username || (currentDmRoom && currentDmRoom.otherProfile && currentDmRoom.otherProfile.username) || "?";
        fb.textContent = seed.trim().charAt(0).toUpperCase() || "?";
        avBtn.appendChild(fb);
      };
      avBtn.appendChild(img);
      avBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = currentDmRoom && currentDmRoom.otherProfile;
        openProfileFor({ id: m.sender_id, username: (p && p.username) || m.username, avatar_url: (p && p.avatar_url) || m.avatar_url });
      });
      row.appendChild(avBtn);
    }

    const stack = document.createElement("div");
    stack.className = "stack";

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap";

    const hasImage = !!m.image_url;
    const hasText = !!(m.content && m.content.length);
    const bubble = document.createElement("div");
    bubble.className = "bubble" + (hasImage && !hasText ? " image-only" : (hasImage && hasText ? " has-image image-with-caption" : ""));
    bubble.dataset.id = m.id;

    if (m.reply_to_id) {
      const snip = document.createElement("button");
      snip.type = "button";
      snip.className = "reply-snippet";
      const parent = dmMessagesById.get(m.reply_to_id);
      if (parent) {
        snip.innerHTML =
          '<span class="reply-to">' + escapeHtml(parent.username || "User") + '</span>' +
          '<span class="reply-text">' + escapeHtml(dmSnippet(parent)) + '</span>';
      } else {
        snip.className += " missing";
        snip.innerHTML = '<span class="reply-to">Reply</span><span class="reply-text">Original message unavailable</span>';
      }
      snip.addEventListener("click", (e) => { e.stopPropagation(); jumpToDmMessage(m.reply_to_id); });
      bubble.appendChild(snip);
    }

    if (hasImage) {
      const mi = document.createElement("img");
      mi.className = "msg-image";
      mi.alt = ""; mi.loading = "lazy"; mi.src = m.image_url;
      mi.addEventListener("click", (e) => { e.stopPropagation(); openImageViewer(m.image_url); });
      mi.onerror = () => {
        const fb = document.createElement("div");
        fb.textContent = "Image failed to load";
        fb.style.cssText = "color:var(--muted);font-size:12px;padding:8px 2px;";
        mi.replaceWith(fb);
      };
      bubble.appendChild(mi);
    }
    if (hasText) {
      const textNode = document.createElement("span");
      textNode.className = "msg-text";
      // DMs allow links (no blocking). Render text + autolink, no mention processing needed.
      textNode.innerHTML = autolinkDmContent(m.content);
      bubble.appendChild(textNode);
    }

    // ---- Telegram-style read receipt (sender-only; DM-only) ----
    // One tick = sent, two ticks = seen by the recipient. Scoped strictly
    // to 1:1 DM bubbles (`isMe` inside a dm_messages row). Group/public
    // rows never get this element because this function only runs for
    // dm_messages. The element is always rendered but starts hidden;
    // `_dmApplyReadStateToRow` fades it in and switches between states
    // so the bubble width never jumps.
    if (isMe) {
      const rr = _dmBuildReceiptEl();
      bubble.appendChild(rr);
    }

    bubble.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const r = bubble.getBoundingClientRect();
      currentActionMode = "dm";
      openReactionPicker(m.id, r.left + r.width / 2, r.top);
    });

    wrap.appendChild(bubble);

    // Inline reply + 3-dot
    const actions = document.createElement("div");
    actions.className = "inline-actions";
    const replyBtn = document.createElement("button");
    replyBtn.type = "button"; replyBtn.title = "Reply"; replyBtn.setAttribute("aria-label", "Reply");
    replyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v2"/></svg>';
    replyBtn.addEventListener("click", (e) => { e.stopPropagation(); setDmReplyTo(m); });
    const moreBtn = document.createElement("button");
    moreBtn.type = "button"; moreBtn.title = "More"; moreBtn.setAttribute("aria-label", "More actions");
    moreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      currentActionMode = "dm";
      drawerTargetId = m.id;
      applyImageOnlyActions(drawerEl, m);
      drawerEl.classList.add("open");
    });
    actions.appendChild(replyBtn);
    actions.appendChild(moreBtn);
    wrap.appendChild(actions);

    stack.appendChild(wrap);

    const reactsEl = document.createElement("div");
    reactsEl.className = "reactions";
    reactsEl.dataset.msgId = m.id;
    stack.appendChild(reactsEl);

    row.appendChild(stack);

    const rowTime = document.createElement("div");
    rowTime.className = "row-time";
    rowTime.textContent = fmtTime(createdAt);
    row.appendChild(rowTime);
    return row;
  }

  function renderDmMessage(m) {
    if (!m || dmRowsById.has(m.id)) return;
    dmMessagesById.set(m.id, m);
    const createdAt = new Date(m.created_at);
    const dayKey = createdAt.toDateString();
    if (dmLastDateLabel !== dayKey) {
      const div = document.createElement("div");
      div.className = "day-divider";
      div.innerHTML = '<strong>' + escapeHtml(fmtDayLabel(createdAt)) + '</strong>';
      dmRoomMessages.appendChild(div);
      dmLastDateLabel = dayKey;
      dmLastSenderId = null;
    }
    const isMeDm = !!(me && m.sender_id === me.id);
    const showName = m.sender_id !== dmLastSenderId;
    dmLastSenderId = m.sender_id;
    if (showName) {
      const dispName = isMeDm
        ? (me && me.username ? me.username : "")
        : (m.username
            || (currentDmRoom && currentDmRoom.otherProfile && m.sender_id === currentDmRoom.otherId && currentDmRoom.otherProfile.username)
            || "");
      if (dispName) {
        const n = document.createElement("div");
        n.className = "name-small" + (isMeDm ? " me" : "");
        n.textContent = dispName;
        dmRoomMessages.appendChild(n);
      }
    }
    const row = buildDmRow(m);
    dmRoomMessages.appendChild(row);
    dmRowsById.set(m.id, row);
    renderDmReactionsFor(m.id);
    // Apply current read-state to this row. For my own rows this toggles
    // between 1 tick (sent) and 2 ticks (seen). For the recipient's rows
    // this is a no-op (the receipt element was never rendered) but we
    // also queue the row for read-marking via _dmTryMarkAsRead.
    _dmApplyReadStateToRow(m);
    _dmObserveRowForRead(row, m);
  }

  function handleDmAction(act, id) {
    const m = dmMessagesById.get(id);
    if (!m) { currentActionMode = "main"; return; }
    if (act === "reply") {
      setDmReplyTo(m);
    } else if (act === "react") {
      const row = dmRowsById.get(id);
      const bubble = row && row.querySelector(".bubble");
      const target = bubble || row;
      const r = target.getBoundingClientRect();
      openReactionPicker(id, r.left + r.width / 2, r.top);
    } else if (act === "download") {
      if (!m.image_url) return;
      downloadMessageImage({ image_url: m.image_url, id: m.id });
    } else if (act === "report") {
      reportDmMessage(m);
    } else if (act === "self-delete") {
      if (!me || m.sender_id !== me.id) return;
      selfDeleteDmMessage(m);
    }
    // mode stays 'dm' for picker flows; reset on close-picker is handled there
  }

  async function selfDeleteDmMessage(m) {
    if (!m || !me || m.sender_id !== me.id) return;
    if (!confirm("Delete this message? This cannot be undone.")) return;
    try {
      const { error } = await sb.from("dm_messages").delete().eq("id", m.id).eq("sender_id", me.id);
      if (error) throw error;
      const row = dmRowsById.get(m.id);
      if (row) row.remove();
      dmRowsById.delete(m.id);
      dmMessagesById.delete(m.id);
    } catch (err) {
      console.error("[Self] DM delete failed", err);
      toast("Could not delete: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  async function reportDmMessage(m) {
    if (!me || !m) return;
    try {
      const { error } = await sb.from("dm_reports").insert({
        reporter_id: me.id,
        message_id: m.id,
        room_id: m.room_id || (currentDmRoom && currentDmRoom.id),
        target_user_id: m.sender_id
      });
      if (error) throw error;
      toast("Message reported. Thanks for letting us know.", "default", 2200);
    } catch (err) {
      console.error("[DM] report failed", err);
      toast("Could not report: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  async function openDmRoom(roomId, otherProfile, meta) {
    if (!me || !roomId) return;
    clearDmRoomState();
    const isReq = !!(meta && meta.is_request);
    const requesterId = (meta && meta.requester_id) || null;
    currentDmRoom = {
      id: roomId,
      otherId: otherProfile && otherProfile.id,
      otherProfile: otherProfile || null,
      is_request: isReq,
      requester_id: requesterId
    };
    // Fix 2 — always render a real image in the DM room header.
    dmRoomAvatar.src = resolveAvatarUrl(otherProfile && otherProfile.avatar_url);
    dmRoomAvatar.onerror = () => {
      if (dmRoomAvatar.src.indexOf(DEFAULT_AVATAR_URL) === -1) dmRoomAvatar.src = DEFAULT_AVATAR_URL;
      else dmRoomAvatar.style.visibility = "hidden";
    };
    dmRoomAvatar.style.visibility = "";
    dmRoomName.textContent = (otherProfile && otherProfile.username) || "User";
    dmRoomBackdrop.classList.add("open");

    // Request-bar visibility: show only to the receiver of an unaccepted request.
    applyDmRequestBarState();

    dmRoomMessages.innerHTML = '<div class="dm-loading">Loading\u2026</div>';
    // Reset the viewport observer for this room. It drives auto-mark-as-read
    // for incoming messages and must be scoped to the currently-open room
    // (old observers from a previous room are discarded here).
    _dmResetReadObserver();
    const [msgsRes, reactsRes] = await Promise.all([
      sb.from("dm_messages")
        .select("id, room_id, sender_id, content, image_url, reply_to_id, username, avatar_url, created_at, read_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(500),
      sb.from("dm_message_reactions")
        .select("message_id, user_id, emoji")
        .limit(5000)
    ]);
    dmRoomMessages.innerHTML = "";
    if (msgsRes.error) {
      console.warn("[DM] load messages failed", msgsRes.error);
      const e = document.createElement("div"); e.className = "dm-empty";
      e.textContent = "Could not load messages.";
      dmRoomMessages.appendChild(e);
      return;
    }
    const msgs = msgsRes.data || [];
    for (const m of msgs) dmMessagesById.set(m.id, m);
    if (reactsRes.data) {
      // dm_message_reactions is filtered by RLS to messages I can see in my rooms
      const msgIds = new Set(msgs.map(m => m.id));
      for (const r of reactsRes.data) if (msgIds.has(r.message_id)) dmAddReactionToState(r);
    }
    if (!msgs.length) {
      const e = document.createElement("div"); e.className = "dm-empty";
      e.textContent = "No messages yet. Say hi \uD83D\uDC4B";
      dmRoomMessages.appendChild(e);
    } else {
      for (const m of msgs) renderDmMessage(m);
      for (const id of dmRowsById.keys()) renderDmReactionsFor(id);
    }
    requestAnimationFrame(() => {
      dmRoomMessages.scrollTop = dmRoomMessages.scrollHeight;
      // After first layout, sweep for any message already in the viewport
      // and mark it read. The IntersectionObserver picks up later scrolls.
      _dmMarkAllVisibleAsRead();
    });
    subscribeDmRoom(roomId);
    setTimeout(() => { try { dmRoomInput.focus(); } catch(_){} }, 60);
  }

  function applyDmRequestBarState() {
    if (!currentDmRoom || !dmRequestBar) return;
    const meId = me && me.id;
    const iAmReceiver = currentDmRoom.is_request
      && currentDmRoom.requester_id && meId
      && currentDmRoom.requester_id !== meId;
    const iSentRequest = currentDmRoom.is_request
      && currentDmRoom.requester_id === meId;
    if (iAmReceiver) {
      dmRequestBar.hidden = false;
      if (dmRequestText) {
        const name = (currentDmRoom.otherProfile && currentDmRoom.otherProfile.username) || "This user";
        dmRequestText.textContent = "Accept this message request from " + name + " to reply.";
      }
      dmRoomInput.disabled = true;
      dmRoomSend.disabled = true;
      dmAttachBtn && (dmAttachBtn.disabled = true);
      dmRoomInput.placeholder = "Accept request to reply";
    } else {
      dmRequestBar.hidden = true;
      dmRoomInput.disabled = false;
      dmAttachBtn && (dmAttachBtn.disabled = false);
      dmRoomInput.placeholder = iSentRequest ? "Message request sent" : "Message";
      dmRoomSend.disabled = !canDmSend();
    }
  }
  function canDmSend() {
    if (!currentDmRoom) return false;
    const hasText = (dmRoomInput.value || "").trim().length > 0;
    const hasImage = !!dmPendingImage;
    return hasText || hasImage;
  }

  function closeDmRoom() {
    dmRoomBackdrop.classList.remove("open");
    clearDmRoomState();
  }

  function subscribeDmRoom(roomId) {
    if (dmRoomChannel) { try { sb.removeChannel(dmRoomChannel); } catch(_){} dmRoomChannel = null; }
    if (dmReactChannel) { try { sb.removeChannel(dmReactChannel); } catch(_){} dmReactChannel = null; }
    if (dmTypingChannel) { try { sb.removeChannel(dmTypingChannel); } catch(_){} dmTypingChannel = null; }
    dmTyping.clearAllRemote();
    dmTypingChannel = sb.channel("dm_typing:" + roomId, { config: { broadcast: { self: false, ack: false } } })
      .on("broadcast", { event: "typing:start" }, ({ payload }) => dmTyping.handleBroadcast("typing:start", payload))
      .on("broadcast", { event: "typing:stop"  }, ({ payload }) => dmTyping.handleBroadcast("typing:stop",  payload))
      .subscribe();
    dmRoomChannel = sb.channel("dm_room:" + roomId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: "room_id=eq." + roomId }, (payload) => {
        const m = payload.new; if (!m) return;
        const empty = dmRoomMessages.querySelector(".dm-empty");
        if (empty) empty.remove();
        const wasAtBottom = (dmRoomMessages.scrollHeight - dmRoomMessages.scrollTop - dmRoomMessages.clientHeight) < 80;
        renderDmMessage(m);
        if (wasAtBottom || (me && m.sender_id === me.id)) {
          requestAnimationFrame(() => {
            dmRoomMessages.scrollTop = dmRoomMessages.scrollHeight;
            // An incoming message that lands in the viewport should flip
            // to "seen" immediately (matching Telegram's behaviour when
            // the thread is open). IO will also pick it up, but this
            // shortcut avoids a one-tick-of-delay where the server
            // write races the observer.
            if (me && m.sender_id !== me.id) _dmTryMarkAsRead(m);
          });
        } else if (me && m.sender_id !== me.id) {
          // Not auto-scrolled (user is scrolled up reading history):
          // the IntersectionObserver attached in renderDmMessage will
          // handle marking when/if the row enters the viewport.
        }
        // Remote sender sent a message → clear their typing indicator.
        if (m && m.sender_id) dmTyping.handleBroadcast("typing:stop", { user_id: m.sender_id });
      })
      // --- "Seen" receipt propagation ---
      // When the recipient marks one of my messages as read, Supabase
      // fires a postgres UPDATE event with read_at set. We repaint that
      // bubble's ticks from 1 → 2 in-place.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_messages", filter: "room_id=eq." + roomId }, (payload) => {
        const m = payload.new; if (!m || !m.id) return;
        const cached = dmMessagesById.get(m.id);
        if (cached) {
          cached.read_at = m.read_at;
          _dmApplyReadStateToRow(cached);
        } else {
          // Edge case: UPDATE arrived before we cached the row (e.g. a
          // message we haven't loaded yet). Store the truth so the
          // row renders correctly when buildDmRow eventually runs.
          dmMessagesById.set(m.id, m);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_rooms", filter: "id=eq." + roomId }, (payload) => {
        const r = payload.new; if (!r || !currentDmRoom || currentDmRoom.id !== r.id) return;
        currentDmRoom.is_request = !!r.is_request;
        currentDmRoom.requester_id = r.requester_id || null;
        applyDmRequestBarState();
        // Refresh list on tab reopen
        const idx = dmRoomsList.findIndex(x => x.id === r.id);
        if (idx >= 0) { dmRoomsList[idx].is_request = !!r.is_request; dmRoomsList[idx].requester_id = r.requester_id || null; }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.log("[DM] Realtime connected:", roomId);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[DM] Realtime disconnected:", status);
      });

    dmReactChannel = sb.channel("dm_reacts:" + roomId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_message_reactions" }, (payload) => {
        const r = payload.new; if (!r || !dmMessagesById.has(r.message_id)) return;
        if (dmAddReactionToState(r)) renderDmReactionsFor(r.message_id);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "dm_message_reactions" }, (payload) => {
        const r = payload.old; if (!r || !dmMessagesById.has(r.message_id)) return;
        if (dmRemoveReactionFromState(r)) renderDmReactionsFor(r.message_id);
      })
      .subscribe();
  }

  async function uploadDmImage(file, roomId) {
    if (!file || !me) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const path = "dm/" + roomId + "/" + me.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + (ext || "jpg");
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type
    });
    if (error) { console.error("[DM] image upload failed", error); return null; }
    const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return (data && data.publicUrl) || null;
  }

  async function sendDmMessage() {
    if (!me || !currentDmRoom || !currentDmRoom.id) return;
    if (!myEmailVerified) { toast("Verify your email to send messages", "warn"); updateVerifyBanner(); return; }
    // Receiver of an unaccepted request cannot reply until they accept.
    if (currentDmRoom.is_request && currentDmRoom.requester_id && currentDmRoom.requester_id !== me.id) {
      toast("Accept this request to reply.", "warn", 1800);
      return;
    }
    const raw = dmRoomInput.value;
    const text = (raw || "").trim();
    const imageFile = dmPendingImage && dmPendingImage.file;
    if (!text && !imageFile) return;
    dmRoomSend.disabled = true;
    try { dmTyping.onLocalSend(); } catch (_) {}
    const replySnapshot = dmReplyTo;
    let imageUrl = null;
    if (imageFile) {
      toast("Uploading photo\u2026", "default", 1200);
      imageUrl = await uploadDmImage(imageFile, currentDmRoom.id);
      if (!imageUrl) {
        toast("Could not upload image.", "error");
        dmRoomSend.disabled = !canDmSend();
        return;
      }
    }
    dmRoomInput.value = "";
    dmRoomInput.style.height = "";
    dmPendingImage = null;
    if (dmImagePreview) dmImagePreview.classList.remove("open");
    if (dmImagePreviewImg) dmImagePreviewImg.src = "";
    if (dmFileInput) dmFileInput.value = "";
    clearDmReply();
    const payload = {
      room_id: currentDmRoom.id,
      sender_id: me.id,
      content: text || null,
      image_url: imageUrl,
      reply_to_id: (replySnapshot && replySnapshot.id) || null,
      username: me.username || null,
      avatar_url: me.avatar_url || null
    };
    const { error } = await sb.from("dm_messages").insert(payload);
    if (error) {
      console.error("[DM] send failed", error);
      toast("Failed to send: " + error.message, "error");
      dmRoomInput.value = text;
    }
    dmRoomSend.disabled = !canDmSend();
    try { dmRoomInput.focus(); } catch(_){}
  }

  async function openDmWithUser(otherUserId, otherProfileHint) {
    if (!me || !otherUserId) return;
    if (otherUserId === me.id) return;
    try {
      const { data, error } = await sb.rpc("open_dm_room", { p_other: otherUserId });
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      if (!room || !room.id) throw new Error("No room returned");
      let other = otherProfileHint || null;
      if (!other || !other.username) {
        const profiles = await getMiniProfiles([otherUserId]);
        other = profiles[otherUserId] || other || { id: otherUserId, username: "User", avatar_url: "" };
      }
      try { profileBackdrop.classList.remove("open"); } catch(_){}
      openDmRoom(room.id, other, { is_request: !!room.is_request, requester_id: room.requester_id });
    } catch (err) {
      console.error("[DM] open_dm_room failed", err);
      toast("Could not open DM: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  async function acceptDmRequest() {
    if (!me || !currentDmRoom || !currentDmRoom.id) return;
    if (!currentDmRoom.is_request) return;
    if (dmRequestAccept) dmRequestAccept.disabled = true;
    try {
      const { data, error } = await sb.rpc("accept_dm_request", { p_room: currentDmRoom.id });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      currentDmRoom.is_request = !!(r && r.is_request);
      applyDmRequestBarState();
      // Fix 2 — refresh list state AND re-render both the mobile modal and the
      // PC side panel so the accepted request moves out of the Requests tab
      // into All immediately (no lingering entries).
      const idx = dmRoomsList.findIndex(x => x.id === currentDmRoom.id);
      if (idx >= 0) dmRoomsList[idx].is_request = currentDmRoom.is_request;
      updateDmRequestsBadge();
      if (typeof renderDmList === "function") renderDmList();
      if (typeof renderDmSidePanel === "function") renderDmSidePanel();
      toast("Request accepted", "default", 1400);
    } catch (err) {
      console.error("[DM] accept failed", err);
      toast("Could not accept: " + (err && err.message ? err.message : "error"), "error");
    } finally {
      if (dmRequestAccept) dmRequestAccept.disabled = false;
    }
  }

  // ---------- Moderation ----------
  async function loadModerators() {
    try {
      const { data, error } = await sb.from("profiles").select("user_id").eq("is_moderator", true).limit(500);
      if (error) { console.warn("[Mod] load moderators failed", error); return; }
      moderatorIds.clear();
      for (const r of (data || [])) if (r && r.user_id) moderatorIds.add(r.user_id);
      if (me && myIsModerator) moderatorIds.add(me.id);
      // Refresh any already-rendered rows so badges show up immediately.
      refreshModBadges();
    } catch (err) { console.warn("[Mod] moderator load crashed", err); }
  }
  function refreshModBadges() {
    for (const [mid, rowEl] of rowsById.entries()) {
      const m = messagesById.get(mid);
      if (!m || !rowEl) continue;
      const avBtn = rowEl.querySelector(".avatar-btn");
      if (!avBtn) continue;
      const existing = avBtn.querySelector(".mod-badge");
      const shouldHave = isModeratorId(m.user_id);
      if (shouldHave && !existing) {
        const mb = document.createElement("span");
        mb.className = "mod-badge";
        mb.title = "Moderator";
        mb.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>' +
          '<polyline points="9 12 11 14 15 10"/></svg>';
        avBtn.appendChild(mb);
      } else if (!shouldHave && existing) {
        existing.remove();
      }
    }
  }
  async function loadBannedSelf() {
    if (!me) return;
    try {
      // Use `user_id` (the stable PK of bans in this schema) rather than `id`,
      // which may not exist depending on migration state. Prevents
      // "column 'id' does not exist" (42703) on loadBannedSelf().
      const { data, error } = await sb.from("bans").select("user_id").eq("user_id", me.id).limit(1);
      if (error) return;
      myIsBanned = !!(data && data.length);
      if (myIsBanned) {
        toast("Your account has been banned. You can read but not send.", "error", 4000);
        if (typeof updateSendDisabled === "function") updateSendDisabled();
        if (sendBtn) sendBtn.disabled = true;
        if (inputEl) inputEl.disabled = true;
      }
    } catch (_) {}
  }

  // ---------- Presence ----------
  const PRESENCE_ONLINE_WINDOW_MS = 60 * 1000;
  const PRESENCE_PING_INTERVAL_MS = 30 * 1000;
  let presenceTimer = null;
  let presenceChannel = null;
  async function pingPresence() {
    if (!me || document.hidden) return;
    try { await sb.rpc("touch_presence"); } catch (_) {}
  }
  function startPresenceLoop() {
    if (presenceTimer) return;
    pingPresence();
    presenceTimer = setInterval(pingPresence, PRESENCE_PING_INTERVAL_MS);
    // One-shot load of everyone's recent presence for initial dot colors.
    loadPresenceSnapshot().catch(()=>{});
    subscribePresenceRealtime();
    // Re-ping on visibility / focus so quick tab switches look responsive.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pingPresence(); });
    window.addEventListener("focus", pingPresence);
  }
  async function loadPresenceSnapshot() {
    try {
      const since = new Date(Date.now() - PRESENCE_ONLINE_WINDOW_MS * 10).toISOString();
      const { data, error } = await sb.from("user_presence").select("user_id, last_seen").gte("last_seen", since).limit(2000);
      if (error) { console.warn("[Presence] snapshot failed", error); return; }
      const now = Date.now();
      for (const r of (data || [])) {
        if (!r || !r.user_id) continue;
        const ts = r.last_seen ? new Date(r.last_seen).getTime() : 0;
        presenceMap.set(r.user_id, { last_seen: ts, online: (now - ts) < PRESENCE_ONLINE_WINDOW_MS });
      }
      refreshPresenceDots();
    } catch (_) {}
  }
  function subscribePresenceRealtime() {
    if (presenceChannel) return;
    try {
      presenceChannel = sb.channel("presence-watch")
        .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, (payload) => {
          const row = payload.new || payload.old;
          if (!row || !row.user_id) return;
          const ts = row.last_seen ? new Date(row.last_seen).getTime() : 0;
          const online = (Date.now() - ts) < PRESENCE_ONLINE_WINDOW_MS;
          presenceMap.set(row.user_id, { last_seen: ts, online });
          refreshPresenceDotsFor(row.user_id);
        })
        .subscribe();
    } catch (err) { console.warn("[Presence] subscribe failed", err); }
  }
  function presenceStateFor(userId) {
    if (!userId) return "offline";
    const p = presenceMap.get(userId);
    if (!p) return "offline";
    return ((Date.now() - (p.last_seen || 0)) < PRESENCE_ONLINE_WINDOW_MS) ? "online" : "offline";
  }
  function applyPresenceDotElement(dot, userId) {
    if (!dot) return;
    const state = presenceStateFor(userId);
    dot.classList.toggle("online", state === "online");
    dot.classList.toggle("offline", state !== "online");
    dot.setAttribute("aria-label", state === "online" ? "Online" : "Offline");
    dot.title = state === "online" ? "Online" : "Offline";
  }
  function refreshPresenceDotsFor(userId) {
    const nodes = document.querySelectorAll('.presence-dot[data-user-id="' + (window.CSS && CSS.escape ? CSS.escape(userId) : userId) + '"]');
    for (const n of nodes) applyPresenceDotElement(n, userId);
  }
  function refreshPresenceDots() {
    const nodes = document.querySelectorAll(".presence-dot[data-user-id]");
    for (const n of nodes) applyPresenceDotElement(n, n.dataset.userId);
  }

  // ---------- Friends ----------
  async function getFriendStatus(peerId) {
    if (!me || !peerId || peerId === me.id) return { state: "none" };
    if (friendStatusCache.has(peerId)) return friendStatusCache.get(peerId);
    const { data, error } = await sb
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .or("and(sender_id.eq." + me.id + ",receiver_id.eq." + peerId + "),and(sender_id.eq." + peerId + ",receiver_id.eq." + me.id + ")")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) { console.warn("[Friends] status lookup failed", error); return { state: "none" }; }
    const row = data && data[0];
    let state = "none";
    let request_id = null;
    if (row) {
      request_id = row.id;
      if (row.status === "accepted") state = "accepted";
      else if (row.status === "pending" && row.sender_id === me.id) state = "outgoing_pending";
      else if (row.status === "pending" && row.receiver_id === me.id) state = "incoming_pending";
    }
    const result = { state, request_id };
    friendStatusCache.set(peerId, result);
    return result;
  }

  const ICON_ADD_FRIEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>';
  const ICON_PENDING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>';
  const ICON_ACCEPTED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>';

  function applyFriendButtonState(state) {
    if (!profileAddFriend) return;
    profileAddFriend.classList.remove("pending", "accepted");
    profileAddFriend.dataset.friendState = state;
    if (state === "outgoing_pending" || state === "incoming_pending") {
      profileAddFriend.classList.add("pending");
      if (profileAddFriendLabel) profileAddFriendLabel.textContent = "Friend Request Pending";
      if (profileAddFriendIcon) profileAddFriendIcon.innerHTML = ICON_PENDING;
      profileAddFriend.disabled = true;
    } else if (state === "accepted") {
      profileAddFriend.classList.add("accepted");
      if (profileAddFriendLabel) profileAddFriendLabel.textContent = "Added";
      if (profileAddFriendIcon) profileAddFriendIcon.innerHTML = ICON_ACCEPTED;
      profileAddFriend.disabled = false;
    } else {
      if (profileAddFriendLabel) profileAddFriendLabel.textContent = "Add Friend";
      if (profileAddFriendIcon) profileAddFriendIcon.innerHTML = ICON_ADD_FRIEND;
      profileAddFriend.disabled = false;
    }
  }

  async function sendFriendRequestTo(receiverId) {
    if (!me || !receiverId || receiverId === me.id) return;
    if (friendRequestSending) return;
    friendRequestSending = true;
    if (profileAddFriend) profileAddFriend.disabled = true;
    try {
      const { error } = await sb.rpc("send_friend_request", { p_receiver: receiverId });
      if (error) throw error;
      toast("Friend request sent", "default", 1800);
      friendStatusCache.set(receiverId, { state: "outgoing_pending", request_id: null });
      applyFriendButtonState("outgoing_pending");
    } catch (err) {
      console.error("[Friends] send failed", err);
      const msg = err && err.message ? err.message : "Could not send friend request";
      if (/already|duplicate|pending|accepted/i.test(msg)) {
        toast("Friend request already pending", "warn", 2000);
        friendStatusCache.set(receiverId, { state: "outgoing_pending", request_id: null });
        applyFriendButtonState("outgoing_pending");
      } else {
        toast(msg, "error");
        applyFriendButtonState("none");
      }
    } finally {
      friendRequestSending = false;
    }
  }

  async function respondFriendRequest(requestId, accept) {
    // Fix 2 — optimistically identify affected notifications now so we can
    // remove them from UI + state immediately on success (no lingering rows).
    const affectedIds = [];
    for (const n of notifications) {
      const info = parseNotifContent(n);
      if (n.type === "friend_request" && info && info.request_id === requestId) {
        affectedIds.push(n.id);
      }
    }
    try {
      const { error } = await sb.rpc("respond_friend_request", { p_request: requestId, p_accept: !!accept });
      if (error) throw error;
      // Cleanup: drop the affected notifications from local state + UI.
      if (affectedIds.length) {
        notifications = notifications.filter(n => !affectedIds.includes(n.id));
        for (const id of affectedIds) notifIds.delete(id);
        updateInboxBadge();
        if (inboxBackdrop.classList.contains("open")) renderInbox();
        // Best-effort server delete so they don't come back on next fetch.
        try { await sb.from("notifications").delete().in("id", affectedIds); } catch(_){}
      }
      toast(accept ? "Friend added" : "Request declined", "default", 1600);
      // Invalidate cache so the Profile shows the new state next time.
      friendStatusCache.clear();
    } catch (err) {
      console.error("[Friends] respond failed", err);
      toast("Could not update request: " + (err && err.message ? err.message : "error"), "error");
      // On failure, re-fetch so UI stays in sync with server truth.
      await fetchNotifications();
      if (inboxBackdrop.classList.contains("open")) renderInbox();
    }
    // If the profile modal is currently showing the other party of this request, refresh its friend button.
    if (currentProfileSubject && profileBackdrop.classList.contains("open")) {
      getFriendStatus(currentProfileSubject.id).then(s => applyFriendButtonState(s.state));
    }
  }

  // ---------- Friends list ----------
  let friendsListRows = []; // [{ peerId, since, username, avatar_url }]
  let pendingRemoveFriend = null; // { peerId, peerName, source }

  async function fetchFriendsList() {
    if (!me) return [];
    const { data, error } = await sb
      .from("friend_requests")
      .select("sender_id, receiver_id, status, created_at")
      .or("sender_id.eq." + me.id + ",receiver_id.eq." + me.id)
      .eq("status", "accepted");
    if (error) { console.warn("[Friends] list fetch failed", error); return []; }
    const rows = [];
    for (const fr of (data || [])) {
      const peerId = (fr.sender_id === me.id) ? fr.receiver_id : fr.sender_id;
      if (peerId && peerId !== me.id) rows.push({ peerId, since: fr.created_at });
    }
    return rows;
  }

  function fmtFriendsSince(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  }

  async function renderFriendsList() {
    if (!friendsBody) return;
    friendsBody.innerHTML = "";
    if (!friendsListRows.length) {
      const empty = document.createElement("div");
      empty.className = "popup-empty";
      empty.textContent = "You haven't added any friends yet.";
      friendsBody.appendChild(empty);
      return;
    }
    const ids = friendsListRows.map(r => r.peerId);
    if (typeof getMiniProfiles === "function") { try { await getMiniProfiles(ids); } catch(_){} }
    friendsBody.innerHTML = "";
    let rendered = 0;
    for (const r of friendsListRows) {
      const p = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(r.peerId) : null;
      const username = (p && p.username) ? p.username : "";
      if (!username) continue;
      const row = document.createElement("div");
      row.className = "friend-row";
      row.dataset.peerId = r.peerId;

      const av = document.createElement("span");
      av.className = "friend-avatar";
      const img = document.createElement("img"); img.alt = "";
      if (p && p.avatar_url) img.src = p.avatar_url;
      else img.style.visibility = "hidden";
      img.onerror = () => { img.style.visibility = "hidden"; };
      av.appendChild(img);
      const dot = document.createElement("span");
      const ps = (typeof presenceStateFor === "function") ? presenceStateFor(r.peerId) : null;
      const online = !!(ps && ps.online);
      dot.className = "presence-dot " + (online ? "online" : "offline");
      dot.dataset.userId = r.peerId;
      dot.setAttribute("aria-label", online ? "Online" : "Offline");
      dot.title = online ? "Online" : "Offline";
      av.appendChild(dot);
      row.appendChild(av);

      const main = document.createElement("div");
      main.className = "friend-main";
      const nameEl = document.createElement("div"); nameEl.className = "friend-name"; nameEl.textContent = username;
      const sinceEl = document.createElement("div"); sinceEl.className = "friend-since";
      const sinceStr = fmtFriendsSince(r.since);
      sinceEl.textContent = sinceStr ? ("Friends since " + sinceStr) : "Friends";
      main.appendChild(nameEl);
      main.appendChild(sinceEl);
      row.appendChild(main);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "friend-remove";
      removeBtn.setAttribute("aria-label", "Remove friend");
      removeBtn.title = "Remove friend";
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openRemoveFriendConfirm({ peerId: r.peerId, peerName: username, source: "list" });
      });
      row.appendChild(removeBtn);

      // Clicking the row (not the remove button) opens the profile.
      row.addEventListener("click", () => {
        closeFriendsList();
        openProfileFor({ id: r.peerId, username, avatar_url: p ? p.avatar_url : null });
      });

      friendsBody.appendChild(row);
      rendered++;
    }
    if (!rendered) {
      friendsBody.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "popup-empty";
      empty.textContent = "You haven't added any friends yet.";
      friendsBody.appendChild(empty);
    }
  }

  async function openFriendsList() {
    if (!me || !friendsBackdrop) return;
    friendsBackdrop.classList.add("open");
    // Preserve last-selected tab across reopens; default to "friends" on first open.
    setFriendsActiveTab(friendsActiveTab || "friends");
    friendsBody.innerHTML = '<div class="popup-empty">Loading\u2026</div>';
    if (friendsRequestsBody) friendsRequestsBody.innerHTML = '<div class="popup-empty">Loading\u2026</div>';
    try {
      // Fetch both lists in parallel so switching tabs is instant and the
      // Requests badge is accurate the moment the modal opens.
      const [rows, reqs] = await Promise.all([fetchFriendsList(), fetchFriendRequests()]);
      friendsListRows = rows;
      friendRequestRows = reqs;
      await renderFriendsList();
      await renderFriendRequests();
      updateFriendsRequestsBadge();
    } catch (err) {
      console.error("[Friends] list failed", err);
      friendsBody.innerHTML = '<div class="popup-empty">Could not load friends.</div>';
      if (friendsRequestsBody) friendsRequestsBody.innerHTML = '<div class="popup-empty">Could not load requests.</div>';
    }
  }
  function closeFriendsList() {
    if (friendsBackdrop) friendsBackdrop.classList.remove("open");
  }

  // ---------- Friend requests (Friends → Requests tab) ----------
  let friendRequestRows = []; // [{ requestId, peerId, created_at }]
  let pendingAcceptRequest = null; // { requestId, peerId, peerName }
  let pendingDenyRequest = null;   // { requestId, peerId, peerName }
  let friendsActiveTab = "friends"; // "friends" | "requests"

  function setFriendsActiveTab(tab) {
    friendsActiveTab = (tab === "requests") ? "requests" : "friends";
    if (friendsTabFriends) {
      friendsTabFriends.classList.toggle("active", friendsActiveTab === "friends");
      friendsTabFriends.setAttribute("aria-selected", friendsActiveTab === "friends" ? "true" : "false");
    }
    if (friendsTabRequests) {
      friendsTabRequests.classList.toggle("active", friendsActiveTab === "requests");
      friendsTabRequests.setAttribute("aria-selected", friendsActiveTab === "requests" ? "true" : "false");
    }
    if (friendsBody) friendsBody.hidden = (friendsActiveTab !== "friends");
    if (friendsRequestsBody) friendsRequestsBody.hidden = (friendsActiveTab !== "requests");
  }

  async function fetchFriendRequests() {
    if (!me) return [];
    // Only pending requests WHERE I am the receiver. Outgoing pending requests
    // stay hidden (the sender already sees "Pending" on the profile card).
    const { data, error } = await sb
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("receiver_id", me.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) { console.warn("[Friends] requests fetch failed", error); return []; }
    const rows = [];
    for (const fr of (data || [])) {
      if (!fr || !fr.sender_id || fr.sender_id === me.id) continue;
      rows.push({ requestId: fr.id, peerId: fr.sender_id, created_at: fr.created_at });
    }
    return rows;
  }

  function updateFriendsRequestsBadge() {
    if (!friendsRequestsBadge) return;
    const n = friendRequestRows.length;
    if (n > 0) {
      friendsRequestsBadge.textContent = n > 99 ? "99+" : String(n);
      friendsRequestsBadge.hidden = false;
    } else {
      friendsRequestsBadge.hidden = true;
    }
  }

  async function renderFriendRequests() {
    if (!friendsRequestsBody) return;
    friendsRequestsBody.innerHTML = "";
    if (!friendRequestRows.length) {
      const empty = document.createElement("div");
      empty.className = "popup-empty";
      empty.textContent = "No pending friend requests.";
      friendsRequestsBody.appendChild(empty);
      return;
    }
    const ids = friendRequestRows.map(r => r.peerId);
    if (typeof getMiniProfiles === "function") { try { await getMiniProfiles(ids); } catch(_){} }
    friendsRequestsBody.innerHTML = "";
    let rendered = 0;
    for (const r of friendRequestRows) {
      const p = (typeof profileMiniCache !== "undefined" && profileMiniCache.get) ? profileMiniCache.get(r.peerId) : null;
      const username = (p && p.username) ? p.username : "";
      if (!username) continue;
      const row = document.createElement("div");
      row.className = "friend-row";
      row.dataset.requestId = r.requestId;
      row.dataset.peerId = r.peerId;

      const av = document.createElement("span");
      av.className = "friend-avatar";
      const img = document.createElement("img"); img.alt = "";
      if (p && p.avatar_url) img.src = p.avatar_url;
      else img.style.visibility = "hidden";
      img.onerror = () => { img.style.visibility = "hidden"; };
      av.appendChild(img);
      const dot = document.createElement("span");
      const ps = (typeof presenceStateFor === "function") ? presenceStateFor(r.peerId) : null;
      const online = !!(ps && ps.online);
      dot.className = "presence-dot " + (online ? "online" : "offline");
      dot.dataset.userId = r.peerId;
      dot.setAttribute("aria-label", online ? "Online" : "Offline");
      dot.title = online ? "Online" : "Offline";
      av.appendChild(dot);
      row.appendChild(av);

      const main = document.createElement("div");
      main.className = "friend-main";
      const nameEl = document.createElement("div"); nameEl.className = "friend-name"; nameEl.textContent = username;
      const sinceEl = document.createElement("div"); sinceEl.className = "friend-since";
      sinceEl.textContent = "Requested " + (fmtRelTime ? fmtRelTime(r.created_at) : "");
      main.appendChild(nameEl);
      main.appendChild(sinceEl);
      row.appendChild(main);

      const actions = document.createElement("div");
      actions.className = "friend-req-actions";

      const acceptBtn = document.createElement("button");
      acceptBtn.type = "button";
      acceptBtn.className = "friend-req-btn accept";
      acceptBtn.setAttribute("aria-label", "Accept friend request");
      acceptBtn.title = "Accept";
      acceptBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      acceptBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAcceptRequestConfirm({ requestId: r.requestId, peerId: r.peerId, peerName: username });
      });

      const denyBtn = document.createElement("button");
      denyBtn.type = "button";
      denyBtn.className = "friend-req-btn deny";
      denyBtn.setAttribute("aria-label", "Deny friend request");
      denyBtn.title = "Deny";
      denyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      denyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openDenyRequestConfirm({ requestId: r.requestId, peerId: r.peerId, peerName: username });
      });

      actions.appendChild(acceptBtn);
      actions.appendChild(denyBtn);
      row.appendChild(actions);

      // Clicking the row (outside action buttons) opens the sender's profile.
      row.addEventListener("click", () => {
        closeFriendsList();
        openProfileFor({ id: r.peerId, username, avatar_url: p ? p.avatar_url : null });
      });

      friendsRequestsBody.appendChild(row);
      rendered++;
    }
    if (!rendered) {
      friendsRequestsBody.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "popup-empty";
      empty.textContent = "No pending friend requests.";
      friendsRequestsBody.appendChild(empty);
    }
  }

  function openAcceptRequestConfirm({ requestId, peerId, peerName }) {
    if (!requestId || !peerId) return;
    pendingAcceptRequest = { requestId, peerId, peerName: peerName || "this person" };
    if (confirmAcceptRequestName) confirmAcceptRequestName.textContent = pendingAcceptRequest.peerName;
    if (confirmAcceptRequestOk) confirmAcceptRequestOk.disabled = false;
    if (confirmAcceptRequestCancel) confirmAcceptRequestCancel.disabled = false;
    if (confirmAcceptRequestBackdrop) confirmAcceptRequestBackdrop.classList.add("open");
  }
  function closeAcceptRequestConfirm() {
    pendingAcceptRequest = null;
    if (confirmAcceptRequestBackdrop) confirmAcceptRequestBackdrop.classList.remove("open");
  }

  function openDenyRequestConfirm({ requestId, peerId, peerName }) {
    if (!requestId || !peerId) return;
    pendingDenyRequest = { requestId, peerId, peerName: peerName || "this person" };
    if (confirmDenyRequestName) confirmDenyRequestName.textContent = pendingDenyRequest.peerName;
    if (confirmDenyRequestOk) confirmDenyRequestOk.disabled = false;
    if (confirmDenyRequestCancel) confirmDenyRequestCancel.disabled = false;
    if (confirmDenyRequestBackdrop) confirmDenyRequestBackdrop.classList.add("open");
  }
  function closeDenyRequestConfirm() {
    pendingDenyRequest = null;
    if (confirmDenyRequestBackdrop) confirmDenyRequestBackdrop.classList.remove("open");
  }

  async function handleConfirmAcceptRequest() {
    if (!pendingAcceptRequest) return;
    const { requestId, peerId, peerName } = pendingAcceptRequest;
    if (confirmAcceptRequestOk) confirmAcceptRequestOk.disabled = true;
    if (confirmAcceptRequestCancel) confirmAcceptRequestCancel.disabled = true;
    try {
      await respondFriendRequest(requestId, true);
      // Optimistic UI: remove from Requests tab, add to Friends tab.
      friendRequestRows = friendRequestRows.filter(r => r.requestId !== requestId);
      if (!friendsListRows.some(r => r.peerId === peerId)) {
        friendsListRows = [{ peerId, since: new Date().toISOString() }, ...friendsListRows];
      }
      friendStatusCache.set(peerId, { state: "accepted", request_id: requestId });
      if (friendsBackdrop && friendsBackdrop.classList.contains("open")) {
        await renderFriendRequests();
        await renderFriendsList();
        updateFriendsRequestsBadge();
      }
      if (currentProfileSubject && currentProfileSubject.id === peerId && profileBackdrop.classList.contains("open")) {
        applyFriendButtonState("accepted");
      }
      closeAcceptRequestConfirm();
    } catch (err) {
      console.error("[Friends] accept failed", err);
      toast("Could not accept: " + (err && err.message ? err.message : "error"), "error");
      if (confirmAcceptRequestOk) confirmAcceptRequestOk.disabled = false;
      if (confirmAcceptRequestCancel) confirmAcceptRequestCancel.disabled = false;
    }
  }

  async function handleConfirmDenyRequest() {
    if (!pendingDenyRequest) return;
    const { requestId, peerId } = pendingDenyRequest;
    if (confirmDenyRequestOk) confirmDenyRequestOk.disabled = true;
    if (confirmDenyRequestCancel) confirmDenyRequestCancel.disabled = true;
    try {
      await respondFriendRequest(requestId, false);
      friendRequestRows = friendRequestRows.filter(r => r.requestId !== requestId);
      friendStatusCache.set(peerId, { state: "none", request_id: null });
      if (friendsBackdrop && friendsBackdrop.classList.contains("open")) {
        await renderFriendRequests();
        updateFriendsRequestsBadge();
      }
      if (currentProfileSubject && currentProfileSubject.id === peerId && profileBackdrop.classList.contains("open")) {
        applyFriendButtonState("none");
      }
      closeDenyRequestConfirm();
    } catch (err) {
      console.error("[Friends] deny failed", err);
      toast("Could not deny: " + (err && err.message ? err.message : "error"), "error");
      if (confirmDenyRequestOk) confirmDenyRequestOk.disabled = false;
      if (confirmDenyRequestCancel) confirmDenyRequestCancel.disabled = false;
    }
  }

  // Realtime sync on the friend_requests table — keeps the Requests tab and
  // Friends tab live across sessions without requiring a refresh. Handles
  // incoming INSERTs (new request → appears in Requests tab), UPDATEs
  // (accepted elsewhere → removed from Requests, added to Friends), and
  // DELETEs (withdrawn / removed → pruned from both tabs).
  async function refreshFriendsDataFromServer() {
    if (!me) return;
    try {
      const [rows, reqs] = await Promise.all([fetchFriendsList(), fetchFriendRequests()]);
      friendsListRows = rows;
      friendRequestRows = reqs;
      if (friendsBackdrop && friendsBackdrop.classList.contains("open")) {
        await renderFriendRequests();
        await renderFriendsList();
      }
      updateFriendsRequestsBadge();
    } catch (err) {
      console.warn("[Friends] refresh failed", err);
    }
  }

  function subscribeFriendRequests() {
    if (!me) return;
    if (friendRequestsChannel) { try { sb.removeChannel(friendRequestsChannel); } catch(_){} friendRequestsChannel = null; }
    const onChange = () => {
      // Invalidate the per-peer friend-status cache so profile cards re-query.
      friendStatusCache.clear();
      refreshFriendsDataFromServer();
    };
    friendRequestsChannel = sb.channel("friend_requests:" + me.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: "receiver_id=eq." + me.id }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: "sender_id=eq." + me.id }, onChange)
      .subscribe();
  }

  function openRemoveFriendConfirm({ peerId, peerName, source }) {
    if (!peerId) return;
    pendingRemoveFriend = { peerId, peerName: peerName || "this person", source: source || "profile" };
    if (confirmRemoveFriendName) confirmRemoveFriendName.textContent = pendingRemoveFriend.peerName;
    if (confirmRemoveFriendOk) confirmRemoveFriendOk.disabled = false;
    if (confirmRemoveFriendCancel) confirmRemoveFriendCancel.disabled = false;
    if (confirmRemoveFriendBackdrop) confirmRemoveFriendBackdrop.classList.add("open");
  }
  function closeRemoveFriendConfirm() {
    pendingRemoveFriend = null;
    if (confirmRemoveFriendBackdrop) confirmRemoveFriendBackdrop.classList.remove("open");
  }

  async function removeFriendById(peerId) {
    if (!me || !peerId) return false;
    // Try RPC first (if the project exposes one), then fall back to a direct
    // delete on friend_requests in either direction.
    let tried = 0;
    for (const rpcName of ["remove_friend", "unfriend", "delete_friend"]) {
      try {
        const res = await sb.rpc(rpcName, { p_peer: peerId });
        tried++;
        if (res && !res.error) return true;
        // 404 / function-not-found style errors fall through to direct delete.
        const msg = (res && res.error && res.error.message) ? res.error.message : "";
        if (/function|does not exist|not found|schema cache/i.test(msg)) break;
      } catch (_) { /* try next */ }
    }
    // Fallback: direct delete of the accepted friend_requests row in either direction.
    const filter =
      "and(sender_id.eq." + me.id + ",receiver_id.eq." + peerId + ")," +
      "and(sender_id.eq." + peerId + ",receiver_id.eq." + me.id + ")";
    const { error } = await sb
      .from("friend_requests")
      .delete()
      .eq("status", "accepted")
      .or(filter);
    if (error) throw error;
    return true;
  }

  async function handleConfirmRemoveFriend() {
    if (!pendingRemoveFriend) return;
    const { peerId, peerName, source } = pendingRemoveFriend;
    if (confirmRemoveFriendOk) confirmRemoveFriendOk.disabled = true;
    if (confirmRemoveFriendCancel) confirmRemoveFriendCancel.disabled = true;
    try {
      await removeFriendById(peerId);
      friendStatusCache.set(peerId, { state: "none", request_id: null });
      // Optimistic UI updates — no refresh required.
      friendsListRows = friendsListRows.filter(r => r.peerId !== peerId);
      if (friendsBackdrop && friendsBackdrop.classList.contains("open")) {
        await renderFriendsList();
      }
      if (currentProfileSubject && currentProfileSubject.id === peerId) {
        applyFriendButtonState("none");
      }
      toast((peerName ? peerName + " removed" : "Friend removed"), "default", 1600);
      closeRemoveFriendConfirm();
    } catch (err) {
      console.error("[Friends] remove failed", err);
      toast("Could not remove friend: " + (err && err.message ? err.message : "error"), "error");
      if (confirmRemoveFriendOk) confirmRemoveFriendOk.disabled = false;
      if (confirmRemoveFriendCancel) confirmRemoveFriendCancel.disabled = false;
    }
  }

  // ---------- Notifications ----------
  async function fetchNotifications() {
    if (!me) return [];
    const { data, error } = await sb
      .from("notifications")
      .select("id, user_id, type, content, read, created_at")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) { console.warn("[Notif] fetch failed", error); return []; }
    notifications = data || [];
    notifIds = new Set(notifications.map(n => n.id));
    updateInboxBadge();
    return notifications;
  }
  function updateInboxBadge() {
    // Friend-request notifications now live in the Friends → Requests tab,
    // not the inbox, so they must not contribute to the inbox unread count.
    const unread = notifications.filter(n => !n.read && n.type !== "friend_request").length;
    if (unread > 0) { inboxBadge.textContent = unread > 99 ? "99+" : String(unread); inboxBadge.hidden = false; }
    else { inboxBadge.hidden = true; }
  }
  function parseNotifContent(n) {
    if (!n || !n.content) return {};
    try { return JSON.parse(n.content); } catch(_) { return { message: String(n.content) }; }
  }
  async function renderInbox() {
    inboxBody.innerHTML = "";
    // Friend-request notifications now live in the Friends → Requests tab.
    // Filter them out of the inbox view entirely so they do not appear here.
    const visibleNotifs = notifications.filter(n => n.type !== "friend_request");
    if (!visibleNotifs.length) {
      const empty = document.createElement("div");
      empty.className = "popup-empty";
      empty.textContent = "No notifications yet.";
      inboxBody.appendChild(empty);
      return;
    }
    // Fallback lookup: older notifications (pre-enrichment) may not carry sender fields in JSON.
    const missingIds = [];
    for (const n of visibleNotifs) {
      const info = parseNotifContent(n);
      if (n.type === "dm_request" && info.sender_id && !info.sender_username && !info.sender_avatar) {
        missingIds.push(info.sender_id);
      }
    }
    if (missingIds.length) { try { await getMiniProfiles(missingIds); } catch(_){} }
    for (const n of visibleNotifs) {
      const info = parseNotifContent(n);
      let senderUsername = info.sender_username || null;
      let senderAvatar = info.sender_avatar || null;
      if ((!senderUsername || !senderAvatar) && info.sender_id) {
        const mini = profileMiniCache.get(info.sender_id);
        if (mini) { senderUsername = senderUsername || mini.username; senderAvatar = senderAvatar || mini.avatar_url; }
      }
      // For DM request notifications, require a resolved username (no placeholder). System notifications still render.
      const isRequestType = (n.type === "dm_request");
      if (isRequestType && !senderUsername) continue;
      const row = document.createElement("div");
      row.className = "popup-row" + (!n.read ? " unread" : "");
      const avatar = document.createElement("img"); avatar.className = "avatar"; avatar.alt = "";
      if (senderAvatar) avatar.src = senderAvatar;
      else avatar.style.visibility = "hidden";
      avatar.onerror = () => { avatar.style.visibility = "hidden"; };
      row.appendChild(avatar);
      const main = document.createElement("div"); main.className = "row-main";
      const top = document.createElement("div"); top.className = "row-top";
      const nameEl = document.createElement("span"); nameEl.className = "row-name";
      if (senderUsername) {
        nameEl.textContent = senderUsername;
      } else {
        nameEl.textContent = n.type === "system" ? "Update" : "Notification";
      }
      const ts = document.createElement("span"); ts.className = "row-ts";
      ts.textContent = fmtRelTime(n.created_at);
      top.appendChild(nameEl); top.appendChild(ts);
      main.appendChild(top);
      const sub = document.createElement("div"); sub.className = "row-sub";
      let subText = info.message;
      if (!subText) {
        if (n.type === "dm_request") subText = "Sent you a message request.";
        else subText = "";
      }
      sub.textContent = subText;
      main.appendChild(sub);
      row.appendChild(main);
      // Clicking the row opens the sender's profile so the receiver can see full context.
      if (info.sender_id) {
        row.style.cursor = "pointer";
        row.addEventListener("click", (e) => {
          if (e.target.closest(".notif-actions")) return;
          closeInbox();
          openProfileFor({ id: info.sender_id, username: senderUsername, avatar_url: senderAvatar });
        });
      }
      inboxBody.appendChild(row);
    }
  }
  async function markAllNotificationsRead() {
    if (!me) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (!unreadIds.length) return;
    const { error } = await sb.from("notifications").update({ read: true }).in("id", unreadIds);
    if (error) { console.warn("[Notif] mark read failed", error); return; }
    for (const n of notifications) if (unreadIds.includes(n.id)) n.read = true;
    updateInboxBadge();
  }
  async function openInbox() {
    if (!me) return;
    inboxBackdrop.classList.add("open");
    inboxBody.innerHTML = '<div class="popup-empty">Loading\u2026</div>';
    await fetchNotifications();
    renderInbox();
    setTimeout(() => { markAllNotificationsRead(); }, 1200);
  }
  function closeInbox() { inboxBackdrop.classList.remove("open"); }

  function subscribeNotifications() {
    if (notifChannel) { try { sb.removeChannel(notifChannel); } catch(_){} notifChannel = null; }
    if (!me) return;
    notifChannel = sb.channel("notifications:" + me.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + me.id }, (payload) => {
        const n = payload.new; if (!n || notifIds.has(n.id)) return;
        notifications.unshift(n); notifIds.add(n.id);
        updateInboxBadge();
        if (inboxBackdrop.classList.contains("open")) renderInbox();
        if (n.type === "friend_request") {
          const info = parseNotifContent(n);
          toast((info && info.message) || "New friend request", "default", 2400);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: "user_id=eq." + me.id }, (payload) => {
        const n = payload.new; if (!n) return;
        const idx = notifications.findIndex(x => x.id === n.id);
        if (idx >= 0) notifications[idx] = n;
        updateInboxBadge();
        if (inboxBackdrop.classList.contains("open")) renderInbox();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.log("[Notif] Realtime connected");
      });
  }

  // Called once `me` is known (after auth + profile load)
  let featuresInitialized = false;
  async function initFeaturesForUser() {
    if (featuresInitialized || !me) return;
    featuresInitialized = true;
    try { await fetchNotifications(); } catch(_){}
    try { subscribeNotifications(); } catch(_){}
    // Prime the Requests-tab badge + subscribe to live friend_requests changes
    // so accepted / denied / new incoming requests reflect without refresh.
    try {
      friendRequestRows = await fetchFriendRequests();
      updateFriendsRequestsBadge();
    } catch(_){}
    try { subscribeFriendRequests(); } catch(_){}
  }

  // Wrap the existing applyMeFromProfile so features kick in once we have a user.
  const __origApplyMeFromProfile = applyMeFromProfile;
  applyMeFromProfile = function(profile) {
    __origApplyMeFromProfile(profile);
    if (me && me.id) initFeaturesForUser();
  };

  // ---------- Event wiring ----------
  dmBtn.addEventListener("click", openDmList);
  dmListClose.addEventListener("click", closeDmList);
  dmListBackdrop.addEventListener("click", (e) => { if (e.target === dmListBackdrop) closeDmList(); });

  dmRoomBack.addEventListener("click", closeDmRoom);
  dmRoomBackdrop.addEventListener("click", (e) => { if (e.target === dmRoomBackdrop) closeDmRoom(); });
  dmRoomSend.addEventListener("click", sendDmMessage);

  // --- Read-receipt triggers (DM) ---
  // Tab hidden → reopened: re-sweep visible messages in case they weren't
  // marked while the page was in the background. (The IntersectionObserver
  // still fires while hidden, but we early-return on document.hidden, so
  // we need to re-sweep on return.)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) _dmMarkAllVisibleAsRead();
  });
  // Scroll-driven fallback: cheap rAF-gated sweep in case the observer
  // missed a row (e.g. legacy browsers, very tall bubbles that trigger
  // partial-intersection only at a threshold we don't observe).
  let _dmScrollRaf = 0;
  dmRoomMessages.addEventListener("scroll", () => {
    if (_dmScrollRaf) return;
    _dmScrollRaf = requestAnimationFrame(() => {
      _dmScrollRaf = 0;
      _dmMarkAllVisibleAsRead();
    });
  }, { passive: true });
  // Focus/click inside the DM container (e.g. user returns to the tab and
  // starts interacting) should also trigger a sweep.
  dmRoomMessages.addEventListener("pointerdown", () => _dmMarkAllVisibleAsRead(), { passive: true });
  dmRoomInput.addEventListener("focus", () => _dmMarkAllVisibleAsRead());
  dmRoomInput.addEventListener("input", () => {
    dmRoomSend.disabled = !canDmSend();
    dmRoomInput.style.height = "auto";
    dmRoomInput.style.height = Math.min(120, dmRoomInput.scrollHeight) + "px";
    // Announce typing on the DM channel (ephemeral, debounced).
    if (me && currentDmRoom && (dmRoomInput.value || "").length > 0
        && !(currentDmRoom.is_request && currentDmRoom.requester_id && currentDmRoom.requester_id !== me.id)) {
      dmTyping.onLocalInput();
    }
  });
  dmRoomInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!dmRoomSend.disabled) sendDmMessage();
    }
  });

  // DM tabs
  if (dmSideTabBtns && dmSideTabBtns.length) {
    dmSideTabBtns.forEach(b => b.addEventListener("click", () => setDmSideTab(b.dataset.sideTab)));
  }
  if (dmTabBtns && dmTabBtns.length) {
    dmTabBtns.forEach(b => b.addEventListener("click", () => setDmTab(b.dataset.dmTab)));
  }

  // DM attachments + reply + accept
  if (dmAttachBtn && dmFileInput) {
    dmAttachBtn.addEventListener("click", () => { if (!dmAttachBtn.disabled) dmFileInput.click(); });
    dmFileInput.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast("Only image files are allowed.", "error"); dmFileInput.value = ""; return; }
      if (f.size > 10 * 1024 * 1024) { toast("Image too large (max 10 MB).", "error"); dmFileInput.value = ""; return; }
      const url = URL.createObjectURL(f);
      dmPendingImage = { file: f, url };
      if (dmImagePreviewImg) dmImagePreviewImg.src = url;
      if (dmImagePreview) dmImagePreview.classList.add("open");
      dmRoomSend.disabled = !canDmSend();
    });
  }
  if (dmImagePreviewRm) {
    dmImagePreviewRm.addEventListener("click", () => {
      dmPendingImage = null;
      if (dmImagePreviewImg) dmImagePreviewImg.src = "";
      if (dmImagePreview) dmImagePreview.classList.remove("open");
      if (dmFileInput) dmFileInput.value = "";
      dmRoomSend.disabled = !canDmSend();
    });
  }
  if (dmReplyClose) dmReplyClose.addEventListener("click", clearDmReply);
  if (dmRequestAccept) dmRequestAccept.addEventListener("click", acceptDmRequest);
  dmRoomPeer.addEventListener("click", () => {
    if (!currentDmRoom || !currentDmRoom.otherId) return;
    const other = currentDmRoom.otherProfile || { id: currentDmRoom.otherId };
    openProfileFor({ id: other.id, username: other.username, avatar_url: other.avatar_url });
  });

  inboxBtn.addEventListener("click", openInbox);
  inboxClose.addEventListener("click", closeInbox);
  inboxBackdrop.addEventListener("click", (e) => { if (e.target === inboxBackdrop) closeInbox(); });

  if (friendsClose) friendsClose.addEventListener("click", closeFriendsList);
  if (friendsBackdrop) friendsBackdrop.addEventListener("click", (e) => { if (e.target === friendsBackdrop) closeFriendsList(); });
  if (friendsTabFriends) friendsTabFriends.addEventListener("click", () => setFriendsActiveTab("friends"));
  if (friendsTabRequests) friendsTabRequests.addEventListener("click", () => setFriendsActiveTab("requests"));
  if (confirmRemoveFriendCancel) confirmRemoveFriendCancel.addEventListener("click", closeRemoveFriendConfirm);
  if (confirmRemoveFriendBackdrop) confirmRemoveFriendBackdrop.addEventListener("click", (e) => { if (e.target === confirmRemoveFriendBackdrop) closeRemoveFriendConfirm(); });
  if (confirmRemoveFriendOk) confirmRemoveFriendOk.addEventListener("click", handleConfirmRemoveFriend);
  if (confirmAcceptRequestCancel) confirmAcceptRequestCancel.addEventListener("click", closeAcceptRequestConfirm);
  if (confirmAcceptRequestBackdrop) confirmAcceptRequestBackdrop.addEventListener("click", (e) => { if (e.target === confirmAcceptRequestBackdrop) closeAcceptRequestConfirm(); });
  if (confirmAcceptRequestOk) confirmAcceptRequestOk.addEventListener("click", handleConfirmAcceptRequest);
  if (confirmDenyRequestCancel) confirmDenyRequestCancel.addEventListener("click", closeDenyRequestConfirm);
  if (confirmDenyRequestBackdrop) confirmDenyRequestBackdrop.addEventListener("click", (e) => { if (e.target === confirmDenyRequestBackdrop) closeDenyRequestConfirm(); });
  if (confirmDenyRequestOk) confirmDenyRequestOk.addEventListener("click", handleConfirmDenyRequest);

  profileDm.addEventListener("click", () => {
    if (!currentProfileSubject || !currentProfileSubject.id) return;
    if (me && currentProfileSubject.id === me.id) return;
    openDmWithUser(currentProfileSubject.id, {
      id: currentProfileSubject.id,
      username: currentProfileSubject.username,
      avatar_url: currentProfileSubject.avatar_url
    });
  });
  profileAddFriend.addEventListener("click", () => {
    if (!currentProfileSubject || !currentProfileSubject.id) return;
    if (me && currentProfileSubject.id === me.id) return;
    const state = profileAddFriend.dataset.friendState || "none";
    if (state === "accepted") {
      openRemoveFriendConfirm({
        peerId: currentProfileSubject.id,
        peerName: currentProfileSubject.username || "this person",
        source: "profile"
      });
      return;
    }
    if (state === "outgoing_pending" || state === "incoming_pending") return;
    sendFriendRequestTo(currentProfileSubject.id);
  });

  // ---- Groups: create-group modal, group room, add-member overlay ----
  const dmListNewGroupBtn = document.getElementById("dm-list-new-group");
  const dmSideNewGroupBtn = document.getElementById("dm-side-new-group");
  if (dmListNewGroupBtn) dmListNewGroupBtn.addEventListener("click", () => { closeDmList(); openCreateGroup(); });
  if (dmSideNewGroupBtn) dmSideNewGroupBtn.addEventListener("click", openCreateGroup);

  if (groupCreateClose)  groupCreateClose.addEventListener("click", closeCreateGroup);
  if (groupCreateCancel) groupCreateCancel.addEventListener("click", closeCreateGroup);
  if (groupCreateBackdrop) groupCreateBackdrop.addEventListener("click", (e) => { if (e.target === groupCreateBackdrop) closeCreateGroup(); });
  if (groupCreateNameEl) groupCreateNameEl.addEventListener("input", updateCreateGroupDisabled);
  if (groupCreateSubmitBtn) groupCreateSubmitBtn.addEventListener("click", submitCreateGroup);
  if (groupCreateAvatarPrev && groupCreateImageInput) {
    groupCreateAvatarPrev.addEventListener("click", () => groupCreateImageInput.click());
  }
  if (groupCreateImageInput) {
    groupCreateImageInput.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast("Only image files are allowed.", "error"); groupCreateImageInput.value = ""; return; }
      if (f.size > 8 * 1024 * 1024) { toast("Image too large (max 8 MB).", "error"); groupCreateImageInput.value = ""; return; }
      groupCreatePendingImage = f;
      const url = URL.createObjectURL(f);
      if (groupCreateAvatarPrev) {
        groupCreateAvatarPrev.innerHTML = "";
        const img = document.createElement("img");
        img.src = url; img.alt = "";
        img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "cover"; img.style.borderRadius = "inherit";
        groupCreateAvatarPrev.appendChild(img);
      }
    });
  }

  // Group room controls
  if (groupRoomBack) groupRoomBack.addEventListener("click", closeGroupRoom);
  if (groupRoomBackdrop) groupRoomBackdrop.addEventListener("click", (e) => { if (e.target === groupRoomBackdrop) closeGroupRoom(); });
  if (groupRoomSendBtn) groupRoomSendBtn.addEventListener("click", sendGroupMessage);
  if (groupRoomInput) {
    groupRoomInput.addEventListener("input", () => {
      const has = !!(groupRoomInput.value || "").trim() || !!groupPendingImage;
      if (groupRoomSendBtn) groupRoomSendBtn.disabled = !has;
      autoResizeGroupInput();
      if (me && currentGroupId && (groupRoomInput.value || "").length > 0) {
        groupTyping.onLocalInput();
      }
    });
    groupRoomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (groupRoomSendBtn && !groupRoomSendBtn.disabled) sendGroupMessage();
      }
    });
  }
  if (groupAttachBtn && groupFileInput) {
    groupAttachBtn.addEventListener("click", () => groupFileInput.click());
    groupFileInput.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      groupFileInput.value = "";
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast("Only image files are allowed.", "error"); return; }
      if (f.size > 10 * 1024 * 1024) { toast("Image too large (max 10 MB).", "error"); return; }
      groupPendingImage = f;
      const url = URL.createObjectURL(f);
      if (groupImagePreviewImg) groupImagePreviewImg.src = url;
      if (groupImagePreview) groupImagePreview.classList.add("open");
      if (groupRoomSendBtn) groupRoomSendBtn.disabled = false;
    });
  }
  if (groupImagePreviewRm) {
    groupImagePreviewRm.addEventListener("click", () => {
      groupPendingImage = null;
      if (groupImagePreviewImg) groupImagePreviewImg.src = "";
      if (groupImagePreview) groupImagePreview.classList.remove("open");
      if (groupRoomSendBtn) groupRoomSendBtn.disabled = !(groupRoomInput && (groupRoomInput.value || "").trim());
    });
  }
  if (groupReplyClose) groupReplyClose.addEventListener("click", clearGroupReply);
  if (groupRoomPeerBtn) groupRoomPeerBtn.addEventListener("click", () => {
    if (typeof openGroupSettings === "function") openGroupSettings();
  });
  if (groupRoomAddBtn) groupRoomAddBtn.addEventListener("click", openAddMember);
  if (groupAddCloseBtn) groupAddCloseBtn.addEventListener("click", closeAddMember);
  if (groupAddBackdrop) groupAddBackdrop.addEventListener("click", (e) => { if (e.target === groupAddBackdrop) closeAddMember(); });

  // Escape closes feature popups (innermost first)
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (confirmAcceptRequestBackdrop && confirmAcceptRequestBackdrop.classList.contains("open")) { closeAcceptRequestConfirm(); return; }
    if (confirmDenyRequestBackdrop && confirmDenyRequestBackdrop.classList.contains("open")) { closeDenyRequestConfirm(); return; }
    if (confirmRemoveFriendBackdrop && confirmRemoveFriendBackdrop.classList.contains("open")) { closeRemoveFriendConfirm(); return; }
    if (friendsBackdrop && friendsBackdrop.classList.contains("open")) { closeFriendsList(); return; }
    if (groupSettingsBackdrop && groupSettingsBackdrop.classList.contains("open")) { closeGroupSettings(); return; }
    if (groupAddBackdrop && groupAddBackdrop.classList.contains("open")) { closeAddMember(); return; }
    if (groupCreateBackdrop && groupCreateBackdrop.classList.contains("open")) { closeCreateGroup(); return; }
    if (groupRoomBackdrop && groupRoomBackdrop.classList.contains("open")) { closeGroupRoom(); return; }
    if (dmRoomBackdrop.classList.contains("open")) { closeDmRoom(); return; }
    if (dmListBackdrop.classList.contains("open")) { closeDmList(); return; }
    if (inboxBackdrop.classList.contains("open")) { closeInbox(); return; }
  });
  // ========== END FEATURE EXPANSION ==========

  // Best-effort "stop typing" broadcast on tab close / refresh / background.
  // `pagehide` fires more reliably than `unload` on mobile. `visibilitychange`
  // with state "hidden" also catches the common case of switching tabs /
  // locking the phone. All three paths send an ephemeral `typing:stop` so
  // remote peers don't see a frozen indicator.
  function broadcastAllTypingStop() {
    try { publicTyping.onLocalLeave(); } catch (_) {}
    try { dmTyping.onLocalLeave(); }     catch (_) {}
    try { groupTyping.onLocalLeave(); }  catch (_) {}
  }
  window.addEventListener("pagehide", broadcastAllTypingStop);
  window.addEventListener("beforeunload", broadcastAllTypingStop);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") broadcastAllTypingStop();
  });

  // ==================================================================
  // Account Center — fullscreen multi-account management (additive).
  // All state is kept in a parallel localStorage registry. The Supabase
  // client is the single source of truth for the currently active
  // session; the registry only persists tokens for other accounts so we
  // can switch back to them without re-entering credentials.
  // ==================================================================
  const AC_REG_KEY = "relay_account_registry_v1";
  const AC_ADDING_FLAG_KEY = "relay_ac_adding_v1";

  const acOverlayEl = $("ac-overlay");
  const acCloseBtn = $("ac-close");
  const acListEl = $("ac-list");
  const acAddBtn = $("ac-add-btn");
  const acEmailInput = $("ac-email");
  const acSaveEmailBtn = $("ac-save-email");
  const acEmailMsg = $("ac-email-msg");
  const acPwCurrent = $("ac-pw-current");
  const acPwNew = $("ac-pw-new");
  const acPwConfirm = $("ac-pw-confirm");
  const acSavePwBtn = $("ac-save-pw");
  const acPwMsg = $("ac-pw-msg");
  const acSignoutBtn = $("ac-signout-btn");
  const acDeleteBtn = $("ac-delete-btn");
  const acConfirmBack = $("ac-confirm-back");
  const acConfirmPw = $("ac-confirm-pw");
  const acConfirmMsg = $("ac-confirm-msg");
  const acConfirmOk = $("ac-confirm-ok");
  const acConfirmCancel = $("ac-confirm-cancel");

  function acReadRegistry() {
    try {
      const raw = localStorage.getItem(AC_REG_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function acWriteRegistry(arr) {
    try { localStorage.setItem(AC_REG_KEY, JSON.stringify(arr || [])); } catch (_) {}
  }
  function acUpsertAccount(entry) {
    if (!entry || !entry.user_id) return;
    const list = acReadRegistry();
    const i = list.findIndex(a => a.user_id === entry.user_id);
    if (i >= 0) list[i] = Object.assign({}, list[i], entry);
    else list.push(entry);
    acWriteRegistry(list);
  }
  function acRemoveAccount(uid) {
    if (!uid) return;
    const list = acReadRegistry().filter(a => a.user_id !== uid);
    acWriteRegistry(list);
  }

  async function acSyncCurrentSessionToRegistry() {
    try {
      const { data } = await sb.auth.getSession();
      const s = data && data.session;
      if (!s || !s.user || !s.access_token || !s.refresh_token) return;
      let prof = null;
      try { prof = await fetchProfile(s.user.id); } catch (_) {}
      const currentUsername = (prof && prof.username)
        || (me && me.id === s.user.id && me.username)
        || (s.user.email ? s.user.email.split("@")[0] : "User");
      const currentAvatar = (prof && prof.avatar_url)
        || (me && me.id === s.user.id && me.avatar_url)
        || "";
      acUpsertAccount({
        user_id: s.user.id,
        email: s.user.email || "",
        username: currentUsername,
        avatar_url: currentAvatar,
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at || null,
        provider: (s.user.app_metadata && s.user.app_metadata.provider) || "email",
        saved_at: Date.now()
      });
    } catch (_) {}
  }

  // Secondary auth-state listener — purely additive, never touches the
  // original onAuthStateChange handler. Keeps the registry in sync with
  // the active session (including silent token refreshes).
  try {
    sb.auth.onAuthStateChange((event, session) => {
      if (!session || !session.user) return;
      if (event === "SIGNED_IN"
          || event === "TOKEN_REFRESHED"
          || event === "USER_UPDATED"
          || event === "INITIAL_SESSION") {
        acSyncCurrentSessionToRegistry();
      }
    });
  } catch (_) {}

  function acAvatarInitial(name, email) {
    const s = String(name || email || "?").trim();
    return s ? s.charAt(0).toUpperCase() : "?";
  }

  function acRenderList() {
    if (!acListEl) return;
    const list = acReadRegistry();
    acListEl.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "ac-empty";
      empty.textContent = "No accounts saved on this device yet.";
      acListEl.appendChild(empty);
      return;
    }
    const activeId = me && me.id;
    list.sort((a, b) => {
      if (a.user_id === activeId) return -1;
      if (b.user_id === activeId) return 1;
      return (b.saved_at || 0) - (a.saved_at || 0);
    });
    for (const acct of list) {
      const row = document.createElement("div");
      row.className = "ac-acct" + (acct.user_id === activeId ? " active" : "");
      row.setAttribute("role", "listitem");
      row.tabIndex = 0;

      const av = document.createElement("div");
      av.className = "ac-acct-avatar";
      if (acct.avatar_url) {
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.src = acct.avatar_url;
        img.onerror = () => {
          img.remove();
          av.textContent = acAvatarInitial(acct.username, acct.email);
        };
        av.appendChild(img);
      } else {
        av.textContent = acAvatarInitial(acct.username, acct.email);
      }

      const meta = document.createElement("div");
      meta.className = "ac-acct-meta";
      const name = document.createElement("div");
      name.className = "ac-acct-name";
      name.textContent = acct.username || "User";
      const mail = document.createElement("div");
      mail.className = "ac-acct-email";
      mail.textContent = acct.email || "";
      meta.appendChild(name);
      if (acct.email) meta.appendChild(mail);

      row.appendChild(av);
      row.appendChild(meta);

      if (acct.user_id === activeId) {
        const tag = document.createElement("span");
        tag.className = "ac-acct-active";
        tag.textContent = "Active";
        row.appendChild(tag);
      }

      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "ac-acct-remove";
      rm.title = "Remove from this device";
      rm.setAttribute("aria-label", "Remove " + (acct.username || "account") + " from this device");
      rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        acHandleRemoveDevice(acct);
      });
      row.appendChild(rm);

      row.addEventListener("click", () => acHandleSwitch(acct));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          acHandleSwitch(acct);
        }
      });

      acListEl.appendChild(row);
    }
  }

  async function acHandleSwitch(acct) {
    if (!acct || !acct.user_id) return;
    if (me && me.id === acct.user_id) return;
    if (!acct.access_token || !acct.refresh_token) {
      if (typeof toast === "function") toast("Stored session is incomplete — please sign in again.", "error");
      acRemoveAccount(acct.user_id);
      acRenderList();
      return;
    }
    try {
      await acSyncCurrentSessionToRegistry();
    } catch (_) {}
    try {
      const { error } = await sb.auth.setSession({
        access_token: acct.access_token,
        refresh_token: acct.refresh_token
      });
      if (error) throw error;
      // onAuthStateChange → onSignedIn will refresh the chat UI.
      // Re-render immediately so the UI feels instant.
      acRenderList();
      acSyncActiveAccountFields();
      closeAccountCenter();
      if (typeof toast === "function") toast("Switched to " + (acct.username || acct.email || "account"), "default");
    } catch (err) {
      console.warn("[AccountCenter] Switch failed", err);
      if (typeof toast === "function") toast("Couldn't switch: " + (err && err.message || "Session expired"), "error");
      acRemoveAccount(acct.user_id);
      acRenderList();
    }
  }

  function acHandleRemoveDevice(acct) {
    if (!acct) return;
    const isActive = me && me.id === acct.user_id;
    if (isActive) {
      // Removing the active account from this device == local sign-out.
      const other = acReadRegistry().find(a => a.user_id !== acct.user_id);
      acRemoveAccount(acct.user_id);
      if (other) {
        acHandleSwitch(other);
      } else {
        // No other accounts — fall through to a clean local sign-out.
        try { sb.auth.signOut({ scope: "local" }); }
        catch (_) { try { sb.auth.signOut(); } catch(__) {} }
        closeAccountCenter();
      }
      return;
    }
    acRemoveAccount(acct.user_id);
    acRenderList();
  }

  async function acHandleAddAccount() {
    // Persist the current session so it can be switched back to.
    await acSyncCurrentSessionToRegistry();
    try { sessionStorage.setItem(AC_ADDING_FLAG_KEY, "1"); } catch (_) {}
    closeAccountCenter();
    try {
      const res = await sb.auth.signOut({ scope: "local" });
      if (res && res.error) throw res.error;
    } catch (err) {
      // Older clients may not support scope: local — fall back silently.
      try { await sb.auth.signOut(); } catch (_) {}
    }
    // onSignedOut runs → showLogin() — user can now sign in as another
    // account without affecting the saved registry entries.
  }

  function acSyncActiveAccountFields() {
    if (!acEmailInput) return;
    sb.auth.getUser().then(({ data }) => {
      const user = data && data.user;
      acEmailInput.value = (user && user.email) || "";
      const hasEmailProvider = !!(user && user.app_metadata && (
        user.app_metadata.provider === "email"
        || (Array.isArray(user.app_metadata.providers) && user.app_metadata.providers.indexOf("email") !== -1)
      ));
      // Password change is only meaningful for email-password users.
      if (acSavePwBtn) {
        acSavePwBtn.disabled = !hasEmailProvider;
        acSavePwBtn.title = hasEmailProvider ? "" : "Only available for email-password accounts.";
      }
      if (acPwMsg && !hasEmailProvider) {
        acPwMsg.className = "ac-msg";
        acPwMsg.textContent = "Password change isn't available for OAuth-only accounts.";
      } else if (acPwMsg) {
        acPwMsg.className = "ac-msg";
        acPwMsg.textContent = "";
      }
    }).catch(() => {});
    if (acEmailMsg) { acEmailMsg.className = "ac-msg"; acEmailMsg.textContent = ""; }
    if (acPwCurrent) acPwCurrent.value = "";
    if (acPwNew) acPwNew.value = "";
    if (acPwConfirm) acPwConfirm.value = "";
  }

  function openAccountCenter() {
    if (!acOverlayEl) return;
    if (!me) return; // Never openable while logged out.
    acSyncCurrentSessionToRegistry().finally(() => {
      acRenderList();
      acSyncActiveAccountFields();
    });
    acOverlayEl.classList.add("open");
    acOverlayEl.setAttribute("aria-hidden", "false");
    // Prevent body scroll behind the overlay.
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (acCloseBtn) setTimeout(() => { try { acCloseBtn.focus(); } catch (_) {} }, 0);
    document.addEventListener("keydown", acOverlayKeydown);
  }
  function closeAccountCenter() {
    if (!acOverlayEl) return;
    acOverlayEl.classList.remove("open");
    acOverlayEl.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.removeEventListener("keydown", acOverlayKeydown);
    acCloseConfirm();
  }
  function acOverlayKeydown(e) {
    if (e.key === "Escape") {
      if (acConfirmBack && acConfirmBack.classList.contains("open")) {
        acCloseConfirm();
      } else {
        closeAccountCenter();
      }
    }
  }
  // Make openAccountCenter reachable from the 3-dot menu handler.
  window.openAccountCenter = openAccountCenter;

  if (acCloseBtn) acCloseBtn.addEventListener("click", closeAccountCenter);
  if (acOverlayEl) {
    // Clicking the solid background inside the overlay should not close it;
    // it's a full-screen page, so only the X button closes. But we still
    // guard against accidental bubbling from the close button.
    acOverlayEl.addEventListener("click", (e) => {
      if (e.target === acOverlayEl) {
        // Don't auto-close on background click — fullscreen is intentional.
      }
    });
  }
  if (acAddBtn) acAddBtn.addEventListener("click", acHandleAddAccount);
  if (acSignoutBtn) acSignoutBtn.addEventListener("click", async () => {
    closeAccountCenter();
    try { await sb.auth.signOut(); } catch (_) {}
  });
  if (acSaveEmailBtn) acSaveEmailBtn.addEventListener("click", async () => {
    if (!acEmailInput || !acEmailMsg) return;
    const newEmail = (acEmailInput.value || "").trim();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      acEmailMsg.className = "ac-msg error";
      acEmailMsg.textContent = "Enter a valid email address.";
      return;
    }
    acEmailMsg.className = "ac-msg";
    acEmailMsg.textContent = "Saving…";
    acSaveEmailBtn.disabled = true;
    try {
      const { error } = await sb.auth.updateUser({ email: newEmail });
      if (error) throw error;
      acEmailMsg.className = "ac-msg ok";
      acEmailMsg.textContent = "Check your inbox for a confirmation email.";
      await acSyncCurrentSessionToRegistry();
      acRenderList();
    } catch (err) {
      acEmailMsg.className = "ac-msg error";
      acEmailMsg.textContent = (err && err.message) || "Couldn't update email.";
    } finally {
      acSaveEmailBtn.disabled = false;
    }
  });
  if (acSavePwBtn) acSavePwBtn.addEventListener("click", async () => {
    if (!acPwCurrent || !acPwNew || !acPwConfirm || !acPwMsg) return;
    const current = acPwCurrent.value || "";
    const next = acPwNew.value || "";
    const confirm = acPwConfirm.value || "";
    if (next.length < 6) {
      acPwMsg.className = "ac-msg error";
      acPwMsg.textContent = "New password must be at least 6 characters.";
      return;
    }
    if (next !== confirm) {
      acPwMsg.className = "ac-msg error";
      acPwMsg.textContent = "New passwords don't match.";
      return;
    }
    acPwMsg.className = "ac-msg";
    acPwMsg.textContent = "Saving…";
    acSavePwBtn.disabled = true;
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user || !user.email) throw new Error("No email on this account.");
      if (current) {
        // Re-auth to verify the current password.
        const { error: reErr } = await sb.auth.signInWithPassword({ email: user.email, password: current });
        if (reErr) throw new Error("Current password is incorrect.");
      }
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) throw error;
      acPwMsg.className = "ac-msg ok";
      acPwMsg.textContent = "Password updated.";
      acPwCurrent.value = ""; acPwNew.value = ""; acPwConfirm.value = "";
      await acSyncCurrentSessionToRegistry();
    } catch (err) {
      acPwMsg.className = "ac-msg error";
      acPwMsg.textContent = (err && err.message) || "Couldn't update password.";
    } finally {
      acSavePwBtn.disabled = false;
    }
  });

  function acOpenConfirm() {
    if (!acConfirmBack) return;
    acConfirmPw.value = "";
    acConfirmMsg.className = "ac-msg";
    acConfirmMsg.textContent = "";
    acConfirmBack.classList.add("open");
    acConfirmBack.setAttribute("aria-hidden", "false");
    setTimeout(() => { try { acConfirmPw.focus(); } catch (_) {} }, 0);
  }
  function acCloseConfirm() {
    if (!acConfirmBack) return;
    acConfirmBack.classList.remove("open");
    acConfirmBack.setAttribute("aria-hidden", "true");
  }
  if (acConfirmCancel) acConfirmCancel.addEventListener("click", acCloseConfirm);
  if (acConfirmBack) acConfirmBack.addEventListener("click", (e) => {
    if (e.target === acConfirmBack) acCloseConfirm();
  });
  if (acDeleteBtn) acDeleteBtn.addEventListener("click", acOpenConfirm);
  if (acConfirmOk) acConfirmOk.addEventListener("click", async () => {
    if (!acConfirmPw || !acConfirmMsg) return;
    const password = acConfirmPw.value || "";
    if (!password) {
      acConfirmMsg.className = "ac-msg error";
      acConfirmMsg.textContent = "Enter your password to confirm.";
      return;
    }
    acConfirmMsg.className = "ac-msg";
    acConfirmMsg.textContent = "Deleting…";
    acConfirmOk.disabled = true;
    acConfirmCancel.disabled = true;
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      if (!user.email) throw new Error("Account has no email for re-auth.");
      // Verify the password by re-authenticating.
      const { error: reErr } = await sb.auth.signInWithPassword({
        email: user.email, password
      });
      if (reErr) throw new Error("Password is incorrect.");
      // Ask the server to delete the account. Requires the SQL function
      // `public.delete_my_account()` (see Account Center SQL setup).
      const { error: rpcErr } = await sb.rpc("delete_my_account");
      if (rpcErr) {
        // Helpful fallback: drop the user's profile row at minimum.
        try { await sb.from("profiles").delete().eq("user_id", user.id); } catch (_) {}
        throw new Error(
          (rpcErr.message || "Deletion failed")
          + " — If this is the first delete, run the `delete_my_account` SQL function in Supabase."
        );
      }
      acRemoveAccount(user.id);
      try { await sb.auth.signOut(); } catch (_) {}
      acCloseConfirm();
      closeAccountCenter();
      if (typeof toast === "function") toast("Your account has been deleted.", "default");
    } catch (err) {
      acConfirmMsg.className = "ac-msg error";
      acConfirmMsg.textContent = (err && err.message) || "Couldn't delete account.";
    } finally {
      acConfirmOk.disabled = false;
      acConfirmCancel.disabled = false;
    }
  });

  // =====================================================================
  //  SETTINGS (fullscreen overlay)
  //  New feature — sits between Account Center and Terms/Privacy in the
  //  3-dot menu. Two-pane layout: collapsible left sidebar + empty main
  //  content area, ready to receive future settings panels.
  // =====================================================================
  const settingsOverlayEl = $("settings-overlay");
  const settingsCloseBtn = $("settings-close");
  const settingsCloseX = $("settings-close-x");
  const settingsSidebarToggle = $("settings-sidebar-toggle");
  const SETTINGS_COLLAPSED_KEY = "relay_settings_sidebar_collapsed_v1";

  function settingsApplyCollapsedFromStorage() {
    if (!settingsOverlayEl) return;
    let collapsed = false;
    try { collapsed = localStorage.getItem(SETTINGS_COLLAPSED_KEY) === "1"; } catch (_) {}
    settingsOverlayEl.classList.toggle("collapsed", !!collapsed);
    if (settingsSidebarToggle) {
      settingsSidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      settingsSidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
      settingsSidebarToggle.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
    }
  }

  function openSettings() {
    if (!settingsOverlayEl) return;
    if (!me) return; // Never openable while logged out.
    settingsApplyCollapsedFromStorage();
    settingsOverlayEl.classList.add("open");
    settingsOverlayEl.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (settingsCloseX) setTimeout(() => { try { settingsCloseX.focus(); } catch (_) {} }, 0);
    document.addEventListener("keydown", settingsOverlayKeydown);
  }
  function closeSettings() {
    if (!settingsOverlayEl) return;
    settingsOverlayEl.classList.remove("open");
    settingsOverlayEl.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.removeEventListener("keydown", settingsOverlayKeydown);
  }
  function settingsOverlayKeydown(e) {
    if (e.key === "Escape") closeSettings();
  }
  function toggleSettingsSidebar() {
    if (!settingsOverlayEl) return;
    const nextCollapsed = !settingsOverlayEl.classList.contains("collapsed");
    settingsOverlayEl.classList.toggle("collapsed", nextCollapsed);
    try { localStorage.setItem(SETTINGS_COLLAPSED_KEY, nextCollapsed ? "1" : "0"); } catch (_) {}
    if (settingsSidebarToggle) {
      settingsSidebarToggle.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
      settingsSidebarToggle.setAttribute("aria-label", nextCollapsed ? "Expand sidebar" : "Collapse sidebar");
      settingsSidebarToggle.setAttribute("title", nextCollapsed ? "Expand sidebar" : "Collapse sidebar");
    }
  }
  window.openSettings = openSettings;
  if (settingsCloseBtn) settingsCloseBtn.addEventListener("click", closeSettings);
  if (settingsCloseX) settingsCloseX.addEventListener("click", closeSettings);
  if (settingsSidebarToggle) settingsSidebarToggle.addEventListener("click", toggleSettingsSidebar);
  settingsApplyCollapsedFromStorage();

  // =====================================================================
  //  MODERATOR PANEL (Ctrl+Shift+M)
  //  Activated by a keyboard shortcut that silently no-ops for non-mods.
  //  Server-side access is enforced by RLS on `moderator_notes` /
  //  `moderator_logs` and by the existing `is_moderator` column on
  //  `profiles`. This block is purely additive and never modifies
  //  unrelated UI, auth, chat, or realtime logic.
  // =====================================================================
  const modOverlay      = $("mod-overlay");
  const modCloseBtn     = $("mod-close");
  const modRefreshBtn   = $("mod-refresh");
  const modNoteInput    = $("mod-note-input");
  const modNoteSubmit   = $("mod-note-submit");
  const modNoteCount    = $("mod-note-count");
  const modNotesList    = $("mod-notes-list");
  const modLogsList     = $("mod-logs-list");
  const modCheckInput   = $("mod-check-input");
  const modCheckSubmit  = $("mod-check-submit");
  const modCheckResult  = $("mod-check-result");
  const modModsList     = $("mod-mods-list");
  const modStatUsers    = $("mod-stat-users");
  const modStatActive   = $("mod-stat-active");
  const modStatMessages = $("mod-stat-messages");
  const modStatActions  = $("mod-stat-actions");

  let modPanelOpen        = false;
  let modChartMessages    = null;
  let modChartUsers       = null;
  let modChartActions     = null;
  let modNotesChannel     = null;
  let modLogsChannel      = null;
  const modAvatarCache    = new Map(); // user_id -> { username, avatar_url }

  function modFmtNum(n) {
    if (n === null || typeof n === "undefined") return "–";
    if (n >= 1000) return (Math.round(n / 100) / 10).toString().replace(/\.0$/, "") + "k";
    return String(n);
  }
  function modFmtTime(iso) {
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (_) { return ""; }
  }
  function modEscape(s) {
    if (s === null || typeof s === "undefined") return "";
    return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  async function modEnsureProfiles(ids) {
    const missing = [];
    for (const id of ids) if (id && !modAvatarCache.has(id)) missing.push(id);
    if (!missing.length) return;
    try {
      const { data } = await sb.from("profiles").select("user_id, username, avatar_url").in("user_id", missing);
      if (Array.isArray(data)) {
        for (const p of data) modAvatarCache.set(p.user_id, { username: p.username || null, avatar_url: p.avatar_url || null });
      }
    } catch (_) {}
  }

  // ---- Charts ----------------------------------------------------------
  function modBuildBuckets(days) {
    const labels = [], keys = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      keys.push(key);
      labels.push(d.toLocaleDateString([], { month: "short", day: "numeric" }));
    }
    return { labels, keys };
  }
  function modBucketize(rows, tsKey, buckets) {
    const counts = Object.fromEntries(buckets.keys.map(k => [k, 0]));
    for (const r of rows || []) {
      const k = (r && r[tsKey]) ? String(r[tsKey]).slice(0, 10) : null;
      if (k && k in counts) counts[k]++;
    }
    return buckets.keys.map(k => counts[k]);
  }
  function modMkChart(ctx, label, color, labels, data) {
    return new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{
        label, data,
        backgroundColor: color,
        borderColor: color,
        borderRadius: 4,
        maxBarThickness: 22
      }]},
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 7, font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: "rgba(128,128,128,0.12)" } }
        }
      }
    });
  }
  function modDestroyCharts() {
    if (modChartMessages) { modChartMessages.destroy(); modChartMessages = null; }
    if (modChartUsers)    { modChartUsers.destroy();    modChartUsers    = null; }
    if (modChartActions)  { modChartActions.destroy();  modChartActions  = null; }
  }

  async function modLoadCharts() {
    if (typeof Chart === "undefined") return;
    const days = 14;
    const buckets = modBuildBuckets(days);
    const since = new Date(Date.now() - (days - 1) * 86400000);
    since.setHours(0, 0, 0, 0);
    const sinceIso = since.toISOString();
    const [msgsRes, usersRes, actionsRes] = await Promise.all([
      sb.from("messages").select("created_at").gte("created_at", sinceIso).limit(20000),
      sb.from("profiles").select("created_at").gte("created_at", sinceIso).limit(20000),
      sb.from("moderator_logs").select("created_at").gte("created_at", sinceIso).limit(20000)
    ]);
    const msgsData = modBucketize(msgsRes.data || [], "created_at", buckets);
    const usersData = modBucketize(usersRes.data || [], "created_at", buckets);
    const actionsData = modBucketize(actionsRes.data || [], "created_at", buckets);
    modDestroyCharts();
    const cm = document.getElementById("mod-chart-messages");
    const cu = document.getElementById("mod-chart-users");
    const ca = document.getElementById("mod-chart-actions");
    if (cm) modChartMessages = modMkChart(cm.getContext("2d"), "Messages per day",       "#2873ce", buckets.labels, msgsData);
    if (cu) modChartUsers    = modMkChart(cu.getContext("2d"), "New users per day",      "#2da15d", buckets.labels, usersData);
    if (ca) modChartActions  = modMkChart(ca.getContext("2d"), "Mod actions per day",    "#c67600", buckets.labels, actionsData);
  }

  // ---- Stats -----------------------------------------------------------
  async function modLoadStats() {
    try {
      const { data, error } = await sb.rpc("moderator_stats");
      if (error) throw error;
      const s = data || {};
      modStatUsers.textContent    = modFmtNum(s.total_users);
      modStatActive.textContent   = modFmtNum(s.active_users_24h);
      modStatMessages.textContent = modFmtNum(s.total_messages);
      modStatActions.textContent  = modFmtNum(s.total_mod_actions);
    } catch (_) {
      // Graceful fallback: pull basic counts individually.
      try {
        const [u, m, a] = await Promise.all([
          sb.from("profiles").select("*", { count: "exact", head: true }),
          sb.from("messages").select("*", { count: "exact", head: true }),
          sb.from("moderator_logs").select("*", { count: "exact", head: true })
        ]);
        modStatUsers.textContent    = modFmtNum(u.count);
        modStatMessages.textContent = modFmtNum(m.count);
        modStatActions.textContent  = modFmtNum(a.count);
        modStatActive.textContent   = "–";
      } catch (_) {}
    }
  }

  // ---- Notes -----------------------------------------------------------
  function modRenderNote(n) {
    const author = modAvatarCache.get(n.author_id) || {};
    const name = modEscape(author.username || "moderator");
    const isMine = me && n.author_id === me.id;
    const delBtn = isMine
      ? `<button class="mod-note-del" data-note-del="${modEscape(n.id)}" title="Delete your note">Delete</button>`
      : "";
    return `
      <div class="mod-note" data-note-id="${modEscape(n.id)}">
        <div class="mod-note-head">
          <span class="mod-note-author">${name}</span>
          <span>${modEscape(modFmtTime(n.created_at))} ${delBtn}</span>
        </div>
        <div class="mod-note-body">${modEscape(n.content)}</div>
      </div>`;
  }
  async function modLoadNotes() {
    try {
      const { data, error } = await sb
        .from("moderator_notes")
        .select("id, author_id, content, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const notes = data || [];
      modNoteCount.textContent = notes.length + " note" + (notes.length === 1 ? "" : "s");
      await modEnsureProfiles(notes.map(n => n.author_id));
      modNotesList.innerHTML = notes.length
        ? notes.map(modRenderNote).join("")
        : '<div class="mod-empty">No notes yet. Be the first to post one.</div>';
    } catch (err) {
      modNotesList.innerHTML = '<div class="mod-empty">Could not load notes. Ensure the `moderator_notes` table + RLS policies are set up.</div>';
    }
  }
  async function modPostNote() {
    if (!myIsModerator || !me) return;
    const content = (modNoteInput.value || "").trim();
    if (!content) return;
    modNoteSubmit.disabled = true;
    try {
      const { error } = await sb.from("moderator_notes").insert({ author_id: me.id, content });
      if (error) throw error;
      modNoteInput.value = "";
      await modLoadNotes();
    } catch (err) {
      toast("Could not post note: " + (err && err.message ? err.message : "error"), "error");
    } finally {
      modNoteSubmit.disabled = false;
    }
  }
  async function modDeleteNote(id) {
    if (!myIsModerator || !me || !id) return;
    if (!confirm("Delete this note?")) return;
    try {
      const { error } = await sb.from("moderator_notes").delete().eq("id", id).eq("author_id", me.id);
      if (error) throw error;
      await modLoadNotes();
    } catch (err) {
      toast("Could not delete note: " + (err && err.message ? err.message : "error"), "error");
    }
  }

  // ---- Logs ------------------------------------------------------------
  const MOD_ACTION_META = {
    delete_message: { label: "Deleted message", cls: "danger" },
    ban_user:       { label: "Banned user",     cls: "danger" },
    unban_user:     { label: "Unbanned user",   cls: "" },
    report:         { label: "Report",          cls: "warn" }
  };
  function modRenderLog(l) {
    const meta = MOD_ACTION_META[l.action_type] || { label: l.action_type, cls: "" };
    const actor = modAvatarCache.get(l.actor_id) || {};
    const target = modAvatarCache.get(l.target_user_id) || {};
    const actorName = modEscape(actor.username || (l.actor_id ? l.actor_id.slice(0, 8) : "unknown"));
    const targetName = l.target_user_id
      ? ("<b>" + modEscape(target.username || l.target_user_id.slice(0, 8)) + "</b>")
      : "";
    const details = l.details && typeof l.details === "object" ? l.details : {};
    let extra = "";
    if (details.content_preview) extra = ' <span style="color:var(--muted)">— "' + modEscape(details.content_preview) + '"</span>';
    return `
      <div class="mod-log" data-log-id="${modEscape(l.id)}">
        <div class="mod-log-head">
          <span><span class="mod-badge ${meta.cls}">${modEscape(meta.label)}</span>
          <span class="mod-log-actor" style="margin-left:6px">${actorName}</span></span>
          <span>${modEscape(modFmtTime(l.created_at))}</span>
        </div>
        <div class="mod-log-body">${targetName}${extra}</div>
      </div>`;
  }
  async function modLoadLogs() {
    try {
      const { data, error } = await sb
        .from("moderator_logs")
        .select("id, actor_id, action_type, target_user_id, target_message_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const logs = data || [];
      const ids = new Set();
      for (const l of logs) {
        if (l.actor_id) ids.add(l.actor_id);
        if (l.target_user_id) ids.add(l.target_user_id);
      }
      await modEnsureProfiles(Array.from(ids));
      modLogsList.innerHTML = logs.length
        ? logs.map(modRenderLog).join("")
        : '<div class="mod-empty">No moderation actions logged yet.</div>';
    } catch (err) {
      modLogsList.innerHTML = '<div class="mod-empty">Could not load logs. Ensure the `moderator_logs` table + RLS policies are set up.</div>';
    }
  }

  function modSubscribeRealtime() {
    if (modNotesChannel || modLogsChannel) return;
    try {
      modNotesChannel = sb.channel("mod-notes-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "moderator_notes" }, () => {
          if (modPanelOpen) modLoadNotes();
        })
        .subscribe();
    } catch (_) {}
    try {
      modLogsChannel = sb.channel("mod-logs-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "moderator_logs" }, () => {
          if (modPanelOpen) { modLoadLogs(); modLoadStats(); }
        })
        .subscribe();
    } catch (_) {}
  }
  function modUnsubscribeRealtime() {
    try { if (modNotesChannel) sb.removeChannel(modNotesChannel); } catch (_) {}
    try { if (modLogsChannel)  sb.removeChannel(modLogsChannel);  } catch (_) {}
    modNotesChannel = null; modLogsChannel = null;
  }

  // ---- User checker ---------------------------------------------------
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function modRunUserCheck() {
    if (!myIsModerator) return;
    const raw = (modCheckInput.value || "").trim();
    if (!raw) { modCheckResult.innerHTML = ""; return; }
    if (!UUID_RE.test(raw)) {
      modCheckResult.innerHTML = '<div class="mod-check-card"><div class="mod-empty">Please enter a valid user UUID (from profiles.user_id).</div></div>';
      return;
    }
    modCheckResult.innerHTML = '<div class="mod-check-card"><div class="mod-empty">Looking up…</div></div>';
    try {
      const { data, error } = await sb.rpc("moderator_user_check", { p_user: raw });
      if (error) throw error;
      const d = data || {};
      const p = d.profile || {};
      const avatar = p.avatar_url ? modEscape(p.avatar_url) : "";
      const name = modEscape(p.username || "(no username)");
      const uid  = modEscape(p.user_unique_id || raw);
      const banned = !!d.is_banned;
      const messageCount = d.message_count || 0;
      const recent = Array.isArray(d.recent_actions) ? d.recent_actions : [];
      const ids = new Set();
      for (const a of recent) { if (a.actor_id) ids.add(a.actor_id); }
      await modEnsureProfiles(Array.from(ids));
      const history = recent.length
        ? '<div class="mod-list" style="margin-top:10px;max-height:180px">' + recent.map(modRenderLog).join("") + '</div>'
        : '<div class="mod-empty">No moderation history.</div>';
      modCheckResult.innerHTML = `
        <div class="mod-check-card">
          <div class="mod-check-head">
            ${avatar ? `<img class="mod-check-avatar" src="${avatar}" alt="" />` : `<div class="mod-check-avatar"></div>`}
            <div>
              <div class="mod-check-name">${name}</div>
              <div class="mod-check-sub">${uid}</div>
            </div>
            ${banned ? '<span class="mod-badge danger" style="margin-left:auto">Banned</span>' : ''}
          </div>
          <div class="mod-check-stats">
            <div><b>${modFmtNum(messageCount)}</b><span>Messages</span></div>
            <div><b>${modFmtNum(recent.length)}</b><span>Mod actions</span></div>
            <div><b>${modEscape(p.region || "–")}</b><span>Region</span></div>
            <div><b>${modEscape(modFmtTime(p.created_at) || "–")}</b><span>Joined</span></div>
          </div>
          ${history}
        </div>`;
    } catch (err) {
      modCheckResult.innerHTML = '<div class="mod-check-card"><div class="mod-empty">Lookup failed: ' + modEscape((err && err.message) || "error") + '</div></div>';
    }
  }

  // ---- Moderator list -------------------------------------------------
  async function modLoadModList() {
    try {
      const { data, error } = await sb
        .from("profiles")
        .select("user_id, username, avatar_url")
        .eq("is_moderator", true)
        .order("username", { ascending: true });
      if (error) throw error;
      const mods = data || [];
      modModsList.innerHTML = mods.length
        ? mods.map(m => {
            const avatar = m.avatar_url ? modEscape(m.avatar_url) : "";
            const name = modEscape(m.username || "(no username)");
            return `<div class="mod-mod-card">
              ${avatar ? `<img src="${avatar}" alt="" />` : `<img alt="" />`}
              <span class="mod-mod-name">${name}</span>
            </div>`;
          }).join("")
        : '<div class="mod-empty">No moderators configured.</div>';
    } catch (err) {
      modModsList.innerHTML = '<div class="mod-empty">Could not load moderator list.</div>';
    }
  }

  // ---- Open / Close ---------------------------------------------------
  async function modLoadAll() {
    await Promise.all([
      modLoadStats(),
      modLoadCharts(),
      modLoadNotes(),
      modLoadLogs(),
      modLoadModList()
    ]);
  }

  function openModPanel() {
    if (!myIsModerator || !me) return; // hard gate for non-mods
    if (modPanelOpen) return;
    modPanelOpen = true;
    modOverlay.classList.add("open");
    modOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    modSubscribeRealtime();
    modLoadAll().catch(()=>{});
  }
  function closeModPanel() {
    if (!modPanelOpen) return;
    modPanelOpen = false;
    modOverlay.classList.remove("open");
    modOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    modUnsubscribeRealtime();
    modDestroyCharts();
  }

  // Ctrl+Shift+M global shortcut. Silent no-op for non-moderators so
  // there is no UI flash, no partial access, and no feature discovery.
  document.addEventListener("keydown", (e) => {
    const key = (e.key || "").toLowerCase();
    if (!e.ctrlKey || !e.shiftKey || key !== "m") return;
    if (!myIsModerator || !me) return; // non-mods: do nothing
    e.preventDefault();
    if (modPanelOpen) closeModPanel(); else openModPanel();
  });
  // ESC closes the panel
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modPanelOpen) { e.preventDefault(); closeModPanel(); }
  });

  if (modCloseBtn)   modCloseBtn.addEventListener("click", closeModPanel);
  if (modRefreshBtn) modRefreshBtn.addEventListener("click", () => { modLoadAll().catch(()=>{}); });
  if (modNoteSubmit) modNoteSubmit.addEventListener("click", modPostNote);
  if (modNoteInput)  modNoteInput.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); modPostNote(); }
  });
  if (modCheckSubmit) modCheckSubmit.addEventListener("click", modRunUserCheck);
  if (modCheckInput)  modCheckInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); modRunUserCheck(); }
  });
  if (modNotesList) modNotesList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-note-del]");
    if (!btn) return;
    modDeleteNote(btn.getAttribute("data-note-del"));
  });

  // =====================================================================
  //                PHASE-2 FEATURE EXPANSION (Oct 2025)
  //   Attachment drawer + emoji picker + multi-file bundled upload +
  //   chat-row context menus + disposed DM chats + image-viewer download.
  // Everything in this block is ADDITIVE — no existing handler/variable
  // is renamed or removed.
  // =====================================================================

  // --- Fullscreen image viewer: download button ---
  const ivDownloadBtn = document.getElementById("iv-download");
  if (ivDownloadBtn && typeof ivImg !== "undefined" && ivImg) {
    ivDownloadBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const url = ivImg.src || "";
      if (!url) return;
      let ext = "png";
      try {
        const p = new URL(url, location.href).pathname;
        const m = /\.([A-Za-z0-9]+)(?:$|\?)/.exec(p);
        if (m) ext = m[1].toLowerCase();
      } catch(_) {}
      const filename = "image-" + Date.now() + "." + ext;
      try {
        const res = await fetch(url, { mode: "cors", cache: "no-store" });
        if (!res.ok) throw new Error("http " + res.status);
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = obj; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(obj); } catch(_){} }, 2000);
      } catch (err) {
        console.warn("[IV] direct fetch failed, falling back", err);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
      }
    });
  }

  // --- Video / generic-file rendering in message bubbles ---
  const VIDEO_EXTS = new Set(["mp4","webm","ogg","ogv","mov","m4v","mkv"]);
  const IMG_EXTS   = new Set(["png","jpg","jpeg","gif","webp","bmp","svg","heic","heif","avif"]);
  function _extOf(u) {
    try {
      const p = new URL(u, location.href).pathname;
      const m = /\.([A-Za-z0-9]+)(?:$|\?)/.exec(p);
      return m ? m[1].toLowerCase() : "";
    } catch (_) { return ""; }
  }
  function _fileNameOf(u) {
    try {
      const p = new URL(u, location.href).pathname;
      const seg = p.split("/").filter(Boolean);
      return decodeURIComponent(seg[seg.length - 1] || "file");
    } catch (_) { return "file"; }
  }
  function _escapeText(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }
  function patchBubbleMedia(root) {
    if (!root || !root.querySelectorAll) return;
    const imgs = root.querySelectorAll("img.msg-image:not([data-media-patched])");
    for (const img of imgs) {
      const url = img.getAttribute("src") || img.src || "";
      if (!url) { img.setAttribute("data-media-patched", "1"); continue; }
      const ext = _extOf(url);
      if (IMG_EXTS.has(ext) || !ext) { img.setAttribute("data-media-patched", "1"); continue; }
      if (VIDEO_EXTS.has(ext)) {
        const v = document.createElement("video");
        v.className = "msg-video";
        v.src = url;
        v.controls = true;
        v.preload = "metadata";
        v.playsInline = true;
        v.setAttribute("data-media-patched", "1");
        img.replaceWith(v);
      } else {
        const a = document.createElement("a");
        a.className = "msg-file";
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.download = _fileNameOf(url);
        a.setAttribute("data-media-patched", "1");
        const fname = _fileNameOf(url);
        a.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
          '<span class="msg-file-main"><span class="msg-file-name">' + _escapeText(fname) +
          '</span><span class="msg-file-hint">Tap to open</span></span>';
        img.replaceWith(a);
      }
    }
  }
  const _mediaTargets = [
    document.getElementById("messages"),
    document.getElementById("dm-room-messages"),
    document.getElementById("group-room-messages")
  ].filter(Boolean);
  try {
    const _mediaObs = new MutationObserver((muts) => {
      for (const m of muts) patchBubbleMedia(m.target);
    });
    for (const t of _mediaTargets) {
      patchBubbleMedia(t);
      _mediaObs.observe(t, { childList: true, subtree: true });
    }
  } catch (err) { console.warn("[Media] observer failed", err); }

  // --- Attachment drawer ---
  const ad = document.getElementById("attach-drawer");
  const adPhotosBtn = document.getElementById("attach-opt-photos");
  const adFilesBtn  = document.getElementById("attach-opt-files");
  const adPhotosIn  = document.getElementById("attach-photos-input");
  const adFilesIn   = document.getElementById("attach-files-input");
  let _adCtx = null;
  function openAttachDrawer(ctx, anchor) {
    _adCtx = ctx;
    ad.style.visibility = "hidden";
    ad.classList.add("open");
    const r = anchor.getBoundingClientRect();
    const w = ad.offsetWidth || 220;
    ad.style.top = (r.top - 8) + "px";
    let x = r.left;
    if (x + w + 8 > window.innerWidth) x = window.innerWidth - w - 8;
    ad.style.left = Math.max(8, x) + "px";
    ad.style.visibility = "";
  }
  function closeAttachDrawer() { ad.classList.remove("open"); }
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-attach-open]");
    if (trigger) {
      e.preventDefault(); e.stopPropagation();
      // Belt-and-suspenders: refuse to open the drawer for unverified users
      // even if the trigger's `disabled` attribute was bypassed (DevTools etc).
      if (me && !myEmailVerified) {
        try { toast("Verify your email to send attachments", "warn"); } catch(_){}
        try { updateVerifyBanner(); } catch(_){}
        return;
      }
      if (ad.classList.contains("open")) { closeAttachDrawer(); return; }
      openAttachDrawer(trigger.getAttribute("data-attach-open"), trigger);
      return;
    }
    if (ad.classList.contains("open") && !e.target.closest("#attach-drawer")) {
      closeAttachDrawer();
    }
  }, true);
  if (adPhotosBtn) adPhotosBtn.addEventListener("click", () => {
    if (me && !myEmailVerified) { try { toast("Verify your email to send attachments", "warn"); } catch(_){} return; }
    closeAttachDrawer(); adPhotosIn.click();
  });
  if (adFilesBtn)  adFilesBtn .addEventListener("click", () => {
    if (me && !myEmailVerified) { try { toast("Verify your email to send attachments", "warn"); } catch(_){} return; }
    closeAttachDrawer(); adFilesIn .click();
  });
  if (adPhotosIn) adPhotosIn.addEventListener("change", () => {
    const files = Array.from(adPhotosIn.files || []);
    adPhotosIn.value = "";
    if (me && !myEmailVerified) { try { toast("Verify your email to send attachments", "warn"); } catch(_){} return; }
    if (files.length) sendBundledAttachments(files);
  });
  if (adFilesIn) adFilesIn.addEventListener("change", () => {
    const files = Array.from(adFilesIn.files || []);
    adFilesIn.value = "";
    if (me && !myEmailVerified) { try { toast("Verify your email to send attachments", "warn"); } catch(_){} return; }
    if (files.length) sendBundledAttachments(files);
  });

  async function uploadOneAttachment(file) {
    if (!me || !file) return null;
    const safeName = (file.name || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
    const path = (me.id || "anon") + "/" + Date.now() + "-" + Math.random().toString(36).slice(2,8) + "-" + safeName;
    try {
      const { error } = await sb.storage.from("chat-images").upload(path, file, {
        cacheControl: "3600", upsert: false,
        contentType: file.type || "application/octet-stream"
      });
      if (error) throw error;
      const { data } = sb.storage.from("chat-images").getPublicUrl(path);
      return (data && data.publicUrl) || null;
    } catch (err) {
      console.error("[Upload] failed", err);
      return null;
    }
  }

  async function sendBundledAttachments(files) {
    if (!me || !files || !files.length) return;
    if (!myEmailVerified) { try { toast("Verify your email to send attachments", "warn"); } catch(_){} updateVerifyBanner(); return; }
    const ctx = _adCtx || "main";
    if (ctx === "dm" && (!currentDmRoom || !currentDmRoom.id)) {
      try { toast("Open a DM first", "warn"); } catch(_){} return;
    }
    if (ctx === "group" && !currentGroupId) {
      try { toast("Open a group first", "warn"); } catch(_){} return;
    }
    if (ctx === "main" && typeof isRestricted === "function" && isRestricted()) {
      try { toast("Messaging disabled", "warn"); } catch(_){} return;
    }
    try { toast("Uploading " + files.length + (files.length === 1 ? " file" : " files") + "\u2026", "default", 1600); } catch(_){}
    // Sequential send preserves order (each INSERT gets a later created_at).
    for (const f of files) {
      const url = await uploadOneAttachment(f);
      if (!url) { try { toast("Upload failed: " + (f.name || ""), "error"); } catch(_){} continue; }
      try {
        if (ctx === "dm") {
          await sb.from("dm_messages").insert({
            room_id: currentDmRoom.id,
            sender_id: me.id,
            content: null,
            image_url: url,
            reply_to_id: null,
            username: me.username || null,
            avatar_url: me.avatar_url || null
          });
        } else if (ctx === "group") {
          await sb.from("group_messages").insert({
            group_id: currentGroupId,
            sender_id: me.id,
            content: null,
            image_url: url,
            reply_to_id: null
          });
        } else {
          await sb.from("messages").insert({
            user_id: me.id,
            username: me.username,
            avatar_url: me.avatar_url,
            content: "",
            image_url: url,
            reply_to_id: null
          });
        }
      } catch (err) {
        console.error("[Bundled] insert failed", err);
      }
    }
  }

  // --- Emoji picker (PC only, hidden on coarse pointers via CSS) ---
  const ep = document.getElementById("emoji-picker");
  const epGrid = document.getElementById("ep-grid");
  const EMOJIS = [
    "\u{1F600}","\u{1F603}","\u{1F604}","\u{1F601}","\u{1F606}","\u{1F605}","\u{1F923}","\u{1F602}",
    "\u{1F642}","\u{1F643}","\u{1F609}","\u{1F60A}","\u{1F60D}","\u{1F970}","\u{1F618}","\u{1F61A}",
    "\u{1F60B}","\u{1F61B}","\u{1F61C}","\u{1F92A}","\u{1F61D}","\u{1F914}","\u{1F910}","\u{1F928}",
    "\u{1F610}","\u{1F611}","\u{1F636}","\u{1F60F}","\u{1F612}","\u{1F644}","\u{1F62A}","\u{1F634}",
    "\u{1F62D}","\u{1F62C}","\u{1F620}","\u{1F621}","\u{1F92C}","\u{1F608}","\u{1F47F}","\u{1F480}",
    "\u{1F47B}","\u{1F47D}","\u{1F916}","\u{2764}\uFE0F","\u{1F9E1}","\u{1F49B}","\u{1F49A}","\u{1F499}",
    "\u{1F49C}","\u{1F5A4}","\u{1F90D}","\u{1F494}","\u{1F495}","\u{1F4AF}","\u{1F525}","\u{2728}",
    "\u{1F389}","\u{1F38A}","\u{1F44D}","\u{1F44E}","\u{1F44F}","\u{1F64C}","\u{1F64F}","\u{1F4AA}",
    "\u{1F91D}","\u{1F91E}","\u{270C}\uFE0F","\u{1F440}","\u{1F441}\uFE0F","\u{1F44B}","\u{1F44C}","\u{1F913}"
  ];
  let _epCtx = null;
  function buildEpGrid() {
    if (!epGrid || epGrid.childElementCount) return;
    const frag = document.createDocumentFragment();
    for (const ch of EMOJIS) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ep-btn"; b.textContent = ch;
      b.addEventListener("click", () => insertEmoji(ch));
      frag.appendChild(b);
    }
    epGrid.appendChild(frag);
  }
  function openEmojiPicker(ctx, anchor) {
    buildEpGrid();
    _epCtx = ctx;
    ep.style.visibility = "hidden";
    ep.classList.add("open");
    const r = anchor.getBoundingClientRect();
    const w = ep.offsetWidth || 280;
    const h = ep.offsetHeight || 280;
    ep.style.top = Math.max(8, r.top - h - 8) + "px";
    let x = r.left;
    if (x + w + 8 > window.innerWidth) x = window.innerWidth - w - 8;
    ep.style.left = Math.max(8, x) + "px";
    ep.style.visibility = "";
  }
  function closeEmojiPicker() { ep.classList.remove("open"); }
  function insertEmoji(ch) {
    let target = null;
    if (_epCtx === "dm") target = document.getElementById("dm-room-input");
    else if (_epCtx === "group") target = document.getElementById("group-room-input");
    else target = document.getElementById("input");
    if (!target) return;
    const start = target.selectionStart == null ? target.value.length : target.selectionStart;
    const end   = target.selectionEnd   == null ? target.value.length : target.selectionEnd;
    target.value = target.value.slice(0, start) + ch + target.value.slice(end);
    const pos = start + ch.length;
    try { target.setSelectionRange(pos, pos); } catch(_){}
    target.dispatchEvent(new Event("input", { bubbles: true }));
    try { target.focus(); } catch(_){}
  }
  document.addEventListener("click", (e) => {
    const trg = e.target.closest("[data-emoji-open]");
    if (trg) {
      e.preventDefault(); e.stopPropagation();
      if (me && !myEmailVerified) {
        try { toast("Verify your email to chat", "warn"); } catch(_){}
        try { updateVerifyBanner(); } catch(_){}
        return;
      }
      if (ep.classList.contains("open")) { closeEmojiPicker(); return; }
      openEmojiPicker(trg.getAttribute("data-emoji-open"), trg);
      return;
    }
    if (ep.classList.contains("open") && !e.target.closest("#emoji-picker")) {
      closeEmojiPicker();
    }
  }, true);

  // --- Disposed & pinned state (localStorage, per user) ---
  function _uidKey() { return (me && me.id) ? me.id : "anon"; }
  function _disposedKey() { return "disposed_dms:" + _uidKey(); }
  function _pinnedKey()   { return "pinned_chats:" + _uidKey(); }
  function _loadJson(k) {
    try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; }
    catch(_) { return {}; }
  }
  function _saveJson(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v || {})); } catch(_) {}
  }
  function loadDisposed() { return _loadJson(_disposedKey()); }
  function saveDisposed(v){ _saveJson(_disposedKey(), v); }
  function loadPinned()   { return _loadJson(_pinnedKey()); }
  function savePinned(v)  { _saveJson(_pinnedKey(), v); }
  function isPinnedDm(id)    { return !!loadPinned()["dm:" + id]; }
  function isPinnedGroup(id) { return !!loadPinned()["group:" + id]; }
  function togglePinned(type, id) {
    if (!id) return;
    const p = loadPinned(); const k = type + ":" + id;
    if (p[k]) delete p[k]; else p[k] = { at: Date.now() };
    savePinned(p);
    try { if (typeof renderDmList === "function") renderDmList(); } catch(_){}
    try { if (typeof renderDmSidePanel === "function") renderDmSidePanel(); } catch(_){}
    try { if (typeof renderGroupsListModal === "function") renderGroupsListModal(); } catch(_){}
    try { if (typeof renderGroupsSidePanel === "function") renderGroupsSidePanel(); } catch(_){}
  }
  function disposeRoom(roomId) {
    if (!roomId) return;
    const d = loadDisposed(); d[roomId] = { at: Date.now() };
    saveDisposed(d);
    try { if (typeof renderDmList === "function") renderDmList(); } catch(_){}
    try { if (typeof renderDmSidePanel === "function") renderDmSidePanel(); } catch(_){}
    renderDisposedOverlay();
  }
  function restoreRoom(roomId) {
    if (!roomId) return;
    const d = loadDisposed(); delete d[roomId];
    saveDisposed(d);
    try { if (typeof renderDmList === "function") renderDmList(); } catch(_){}
    try { if (typeof renderDmSidePanel === "function") renderDmSidePanel(); } catch(_){}
    renderDisposedOverlay();
  }

  // --- Chat-row context menu ---
  const crc = document.getElementById("chat-row-ctx");
  function closeChatRowCtx() { crc.classList.remove("open"); crc.innerHTML = ""; }
  function _positionAt(el, x, y) {
    el.style.visibility = "hidden";
    el.classList.add("open");
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let nx = x, ny = y;
    if (nx + r.width + 8 > vw)  nx = vw - r.width - 8;
    if (ny + r.height + 8 > vh) ny = vh - r.height - 8;
    el.style.left = Math.max(8, nx) + "px";
    el.style.top  = Math.max(8, ny) + "px";
    el.style.visibility = "";
  }
  const _CRC_ICONS = {
    pin:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
    trash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
    user:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    copy:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    hash:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
    logout:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    members: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  };
  function _ctxBtn(label, icon, danger) {
    const b = document.createElement("button");
    b.type = "button";
    if (danger) b.className = "danger";
    b.innerHTML = (_CRC_ICONS[icon] || "") + "<span>" + _escapeText(label) + "</span>";
    return b;
  }
  function _findDmRoom(id) {
    return (typeof dmRoomsList !== "undefined" && Array.isArray(dmRoomsList))
      ? dmRoomsList.find(r => r.id === id) : null;
  }
  function _findGroup(id) {
    return (typeof myGroups !== "undefined" && Array.isArray(myGroups))
      ? myGroups.find(g => g.id === id) : null;
  }
  function openDmRowCtx(x, y, room) {
    crc.innerHTML = "";
    const other = room && room.other;
    const otherId = (other && other.id) || room.other_id || "";
    const otherName = (other && other.username) || "";
    const pinned = isPinnedDm(room && room.id);
    const pin = _ctxBtn(pinned ? "Unpin" : "Pin", "pin");
    pin.addEventListener("click", () => { closeChatRowCtx(); togglePinned("dm", room.id); });
    const dispose = _ctxBtn("Dispose", "trash", true);
    dispose.addEventListener("click", () => { closeChatRowCtx(); disposeRoom(room.id); try { toast("Chat disposed", "default", 1600); } catch(_){} });
    const viewProfile = _ctxBtn("View Profile", "user");
    viewProfile.addEventListener("click", () => {
      closeChatRowCtx();
      try {
        if (typeof openUserProfileById === "function") { openUserProfileById(otherId); return; }
        if (typeof openProfileForUser  === "function") { openProfileForUser({ id: otherId, username: otherName, avatar_url: other && other.avatar_url }); return; }
        if (typeof showProfileFor      === "function") { showProfileFor(otherId); return; }
      } catch(_){}
      try { toast("Profile viewer not available", "warn"); } catch(_){}
    });
    // Spec: Copy User ID + Copy Username use the SAME copy SVG icon.
    const copyId = _ctxBtn("Copy User ID", "copy");
    copyId.addEventListener("click", async () => {
      closeChatRowCtx();
      const uid = String(otherId || "");
      if (!uid) { try { toast("User ID not available", "warn"); } catch(_){} return; }
      try { await navigator.clipboard.writeText(uid); toast("User ID copied", "default", 1400); }
      catch(_) { try { toast("Could not copy", "error"); } catch(__){} }
    });
    const copyName = _ctxBtn("Copy Username", "copy");
    copyName.addEventListener("click", async () => {
      closeChatRowCtx();
      // Spec: "Must match stored username exactly" — no "@" prefix.
      const uname = String(otherName || "");
      if (!uname) { try { toast("Username not available", "warn"); } catch(_){} return; }
      try { await navigator.clipboard.writeText(uname); toast("Username copied", "default", 1400); }
      catch(_) { try { toast("Could not copy", "error"); } catch(__){} }
    });
    crc.appendChild(pin);
    crc.appendChild(dispose);
    crc.appendChild(viewProfile);
    crc.appendChild(copyId);
    crc.appendChild(copyName);
    _positionAt(crc, x, y);
  }
  function openGroupRowCtx(x, y, group) {
    crc.innerHTML = "";
    const isOwner = !!(group && me && group.created_by === me.id);
    const pinned = isPinnedGroup(group && group.id);
    const pin = _ctxBtn(pinned ? "Unpin" : "Pin", "pin");
    pin.addEventListener("click", () => { closeChatRowCtx(); togglePinned("group", group.id); });
    const members = _ctxBtn("View Members", "members");
    members.addEventListener("click", () => {
      closeChatRowCtx();
      try {
        if (typeof openGroupRoom === "function") openGroupRoom(group.id);
      } catch(_){}
      setTimeout(() => { try { if (typeof openGroupSettings === "function") openGroupSettings(); } catch(_){} }, 220);
    });
    const leave = _ctxBtn("Leave Group", "logout", true);
    leave.addEventListener("click", async () => {
      closeChatRowCtx();
      if (!confirm("Leave this group?")) return;
      try {
        const { error } = await sb.from("group_members").delete().eq("group_id", group.id).eq("user_id", me.id);
        if (error) throw error;
        const i = (typeof myGroups !== "undefined") ? myGroups.findIndex(x => x.id === group.id) : -1;
        if (i >= 0) myGroups.splice(i, 1);
        try { if (typeof renderGroupsListModal === "function") renderGroupsListModal(); } catch(_){}
        try { if (typeof renderGroupsSidePanel === "function") renderGroupsSidePanel(); } catch(_){}
        try { toast("Left group", "default", 1400); } catch(_){}
      } catch (err) {
        console.error("[Groups] leave failed", err);
        try { toast("Could not leave group", "error"); } catch(_){}
      }
    });
    crc.appendChild(pin);
    crc.appendChild(members);
    crc.appendChild(leave);
    if (isOwner) {
      const del = _ctxBtn("Delete Group", "trash", true);
      del.addEventListener("click", async () => {
        closeChatRowCtx();
        if (!confirm("Delete this group? This cannot be undone.")) return;
        try {
          const { error } = await sb.rpc("delete_group", { p_group: group.id });
          if (error) throw error;
          const i = (typeof myGroups !== "undefined") ? myGroups.findIndex(x => x.id === group.id) : -1;
          if (i >= 0) myGroups.splice(i, 1);
          try { if (typeof renderGroupsListModal === "function") renderGroupsListModal(); } catch(_){}
          try { if (typeof renderGroupsSidePanel === "function") renderGroupsSidePanel(); } catch(_){}
          try { toast("Group deleted", "default", 1400); } catch(_){}
        } catch (err) {
          console.error("[Groups] delete failed", err);
          try { toast("Could not delete group", "error"); } catch(_){}
        }
      });
      crc.appendChild(del);
    }
    _positionAt(crc, x, y);
  }
  document.addEventListener("click", (e) => {
    if (crc.classList.contains("open") && !e.target.closest("#chat-row-ctx")) closeChatRowCtx();
  }, true);
  window.addEventListener("scroll", () => closeChatRowCtx(), true);
  window.addEventListener("resize", () => { closeChatRowCtx(); closeAttachDrawer(); closeEmojiPicker(); closeDisposedMini(); });

  function _attachLongPress(el, cb) {
    let timer = null;
    let startX = 0, startY = 0;
    function clear() { if (timer) { clearTimeout(timer); timer = null; } }
    el.addEventListener("touchstart", (e) => {
      clear();
      const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
      timer = setTimeout(() => { cb(startX, startY); timer = null; }, 520);
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) clear();
    }, { passive: true });
    el.addEventListener("touchend", clear, { passive: true });
    el.addEventListener("touchcancel", clear, { passive: true });
  }
  function _enhanceDmRow(row) {
    const id = row.dataset.roomId;
    if (!id || row.dataset.ctxAttached === "1") return;
    row.dataset.ctxAttached = "1";
    if (isPinnedDm(id)) row.classList.add("pinned");
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const room = _findDmRoom(id); if (!room) return;
      openDmRowCtx(e.clientX, e.clientY, room);
    });
    _attachLongPress(row, (x, y) => {
      const room = _findDmRoom(id); if (!room) return;
      openDmRowCtx(x, y, room);
    });
  }
  function _enhanceGroupRow(row) {
    const id = row.dataset.groupId;
    if (!id || row.dataset.ctxAttached === "1") return;
    row.dataset.ctxAttached = "1";
    if (isPinnedGroup(id)) row.classList.add("pinned");
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const g = _findGroup(id); if (!g) return;
      openGroupRowCtx(e.clientX, e.clientY, g);
    });
    _attachLongPress(row, (x, y) => {
      const g = _findGroup(id); if (!g) return;
      openGroupRowCtx(x, y, g);
    });
  }

  function _decorateChatList(containerSel, variant) {
    const container = (typeof containerSel === "string") ? document.querySelector(containerSel) : containerSel;
    if (!container) return;
    const prev = container.querySelector(".dm-injected-header");
    if (prev) prev.remove();

    let activeTab = null;
    if (variant === "side") activeTab = (typeof dmSideTab !== "undefined") ? dmSideTab : "all";
    else if (variant === "modal") activeTab = (typeof dmTab !== "undefined") ? dmTab : "all";

    // Filter disposed DM rows (only on Chats tab — spec: not in Groups/Requests).
    if (activeTab === "all") {
      const disposed = loadDisposed();
      const rows = container.querySelectorAll("[data-room-id]");
      for (const r of rows) {
        const rid = r.dataset.roomId;
        if (rid && disposed[rid]) r.remove();
      }
    }

    // Attach context handlers + pinned class.
    const dmRows = container.querySelectorAll("[data-room-id]");
    for (const r of dmRows) _enhanceDmRow(r);
    const grpRows = container.querySelectorAll("[data-group-id]");
    for (const g of grpRows) _enhanceGroupRow(g);

    // Pinned first.
    const pinRows = Array.from(container.querySelectorAll("[data-room-id].pinned, [data-group-id].pinned"));
    for (let i = pinRows.length - 1; i >= 0; i--) {
      container.insertBefore(pinRows[i], container.firstChild);
    }

    // Inject 3-dot "Chats menu" header ONLY on the Chats tab.
    if (activeTab === "all") {
      const header = document.createElement("div");
      header.className = "dm-injected-header";
      header.style.cssText = "display:flex; align-items:center; padding:2px 0 4px;";
      const btn = document.createElement("button");
      btn.className = "dm-side-disposed-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Chats menu");
      btn.title = "Chats menu";
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
      btn.addEventListener("click", (e) => { e.stopPropagation(); openDisposedMini(btn); });
      header.appendChild(btn);
      container.insertBefore(header, container.firstChild);
    }
  }

  const _origRenderDmList      = (typeof renderDmList      === "function") ? renderDmList      : null;
  const _origRenderDmSidePanel = (typeof renderDmSidePanel === "function") ? renderDmSidePanel : null;
  const _origRenderGroupsListModal = (typeof renderGroupsListModal === "function") ? renderGroupsListModal : null;
  const _origRenderGroupsSidePanel = (typeof renderGroupsSidePanel === "function") ? renderGroupsSidePanel : null;
  if (_origRenderDmList) {
    renderDmList = function() {
      const out = _origRenderDmList.apply(this, arguments);
      try { _decorateChatList("#dm-list-body", "modal"); } catch(err){ console.warn("[DM] decorate failed", err); }
      return out;
    };
  }
  if (_origRenderDmSidePanel) {
    renderDmSidePanel = function() {
      const out = _origRenderDmSidePanel.apply(this, arguments);
      try { _decorateChatList("#dm-side-body", "side"); } catch(err){ console.warn("[DM] side decorate failed", err); }
      return out;
    };
  }
  if (_origRenderGroupsListModal) {
    renderGroupsListModal = function() {
      const out = _origRenderGroupsListModal.apply(this, arguments);
      try { _decorateChatList("#dm-list-body", "modal"); } catch(err){ console.warn("[Groups] decorate failed", err); }
      return out;
    };
  }
  if (_origRenderGroupsSidePanel) {
    renderGroupsSidePanel = function() {
      const out = _origRenderGroupsSidePanel.apply(this, arguments);
      try { _decorateChatList("#dm-side-body", "side"); } catch(err){ console.warn("[Groups] side decorate failed", err); }
      return out;
    };
  }

  // --- Disposed mini menu + overlay ---
  const disposedMini = document.getElementById("disposed-mini");
  const disposedOpenBtn = document.getElementById("disposed-open-btn");
  const disposedOverlay = document.getElementById("disposed-overlay");
  const disposedCloseBtn = document.getElementById("disposed-close");
  const disposedBody = document.getElementById("disposed-body");
  function openDisposedMini(anchor) {
    disposedMini.style.visibility = "hidden";
    disposedMini.classList.add("open");
    const r = anchor.getBoundingClientRect();
    const w = disposedMini.offsetWidth || 180;
    let x = r.left;
    if (x + w + 8 > window.innerWidth) x = window.innerWidth - w - 8;
    disposedMini.style.left = Math.max(8, x) + "px";
    disposedMini.style.top = (r.bottom + 6) + "px";
    disposedMini.style.visibility = "";
  }
  function closeDisposedMini() { disposedMini.classList.remove("open"); }
  document.addEventListener("click", (e) => {
    if (disposedMini.classList.contains("open")
        && !e.target.closest("#disposed-mini")
        && !e.target.closest(".dm-side-disposed-btn")) {
      closeDisposedMini();
    }
  }, true);
  if (disposedOpenBtn) disposedOpenBtn.addEventListener("click", () => { closeDisposedMini(); openDisposedOverlay(); });
  function _relTime(ts) {
    if (!ts) return "";
    const d = Math.max(0, Date.now() - ts);
    const s = Math.floor(d / 1000);
    if (s < 60)   return s + "s ago";
    const m = Math.floor(s / 60);
    if (m < 60)   return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24)   return h + "h ago";
    const dd = Math.floor(h / 24);
    if (dd < 30)  return dd + "d ago";
    const mm = Math.floor(dd / 30);
    if (mm < 12)  return mm + "mo ago";
    const y  = Math.floor(mm / 12);
    return y + "y ago";
  }
  function renderDisposedOverlay() {
    if (!disposedBody) return;
    disposedBody.innerHTML = "";
    const d = loadDisposed();
    const ids = Object.keys(d);
    if (!ids.length) {
      const empty = document.createElement("div");
      empty.className = "disposed-empty";
      empty.textContent = "No disposed chats.";
      disposedBody.appendChild(empty);
      return;
    }
    ids.sort((a, b) => (d[b].at || 0) - (d[a].at || 0));
    for (const rid of ids) {
      const room = _findDmRoom(rid);
      const other = room && room.other;
      const row = document.createElement("div");
      row.className = "disposed-row";
      const img = document.createElement("img");
      if (other && other.avatar_url) img.src = other.avatar_url;
      else img.style.visibility = "hidden";
      img.onerror = () => { img.style.visibility = "hidden"; };
      row.appendChild(img);
      const main = document.createElement("div");
      main.className = "dr-main";
      const name = document.createElement("div");
      name.className = "dr-name";
      name.textContent = (other && other.username) ? ("@" + other.username) : "(unknown chat)";
      const time = document.createElement("div");
      time.className = "dr-time";
      time.textContent = "Disposed " + _relTime(d[rid].at);
      main.appendChild(name); main.appendChild(time);
      row.appendChild(main);
      const reload = document.createElement("button");
      reload.className = "dr-restore";
      reload.type = "button";
      reload.title = "Restore";
      reload.setAttribute("aria-label", "Restore chat");
      reload.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>';
      reload.addEventListener("click", (e) => { e.stopPropagation(); restoreRoom(rid); });
      row.appendChild(reload);
      disposedBody.appendChild(row);
    }
  }
  function openDisposedOverlay() { renderDisposedOverlay(); disposedOverlay.classList.add("open"); }
  function closeDisposedOverlay() { disposedOverlay.classList.remove("open"); }
  if (disposedCloseBtn) disposedCloseBtn.addEventListener("click", closeDisposedOverlay);
  if (disposedOverlay) disposedOverlay.addEventListener("click", (e) => { if (e.target === disposedOverlay) closeDisposedOverlay(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (disposedOverlay && disposedOverlay.classList.contains("open")) { closeDisposedOverlay(); }
      if (crc && crc.classList.contains("open"))   { closeChatRowCtx(); }
      if (ad && ad.classList.contains("open"))     { closeAttachDrawer(); }
      if (ep && ep.classList.contains("open"))     { closeEmojiPicker(); }
      if (disposedMini && disposedMini.classList.contains("open")) { closeDisposedMini(); }
    }
  });

  // --- Neutralize legacy single-file pickers so + opens the drawer instead.
  // The old flows still exist for the image-preview bubble UI, but the + / attach
  // button clicks now open the drawer. We suppress the old direct triggers by
  // short-circuiting at the capture phase. (These inputs remain reachable from
  // internal code paths that call them programmatically, preserving fallbacks.)
  // The data-attach-open="..." click handler above already handles the drawer.

  // --- Initial paint of injected decorations if chat lists are already visible ---
  try { _decorateChatList("#dm-side-body", "side"); } catch(_){}
  try { _decorateChatList("#dm-list-body", "modal"); } catch(_){}

  // ---------- Init ----------
  applyRestrictionUI();
  updateSendDisabled();
})();
