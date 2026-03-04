/**
 *  NUTELLA SNIPER v3.0 — ULTRA SPEED EDITION
 *  • Gateway WebSocket  → anlık GUILD_UPDATE/DELETE detection
 *  • Auto-join          → hedef sunucuya katıl, Gateway kör kalmasın
 *  • Pre-built buffers  → hot-path'de SIFIR JSON işlemi
 *  • Pre-warmed TLS     → TCP/TLS handshake gecikmesi YOK
 *  • 10 paralel PATCH   → ilk geçen kazanır
 *  • 10ms polling       → Gateway yedek sigortası
 *  • setImmediate loop  → event loop bloklanmaz
 */

"use strict";

process.title = "NUTELLA Sniper";

const WebSocket = require("ws");
const https     = require("https");
const readline  = require("readline");
const fs        = require("fs");
const { performance } = require("perf_hooks");

// ── RENKLER ────────────────────────────────────────────────────────────────
const R    = "\x1b[0m";
const BOLD = "\x1b[1m";
const Y    = "\x1b[33m";
const G    = "\x1b[32m";
const RE   = "\x1b[31m";
const CY   = "\x1b[36m";
const GR   = "\x1b[90m";
const WH   = "\x1b[97m";

function ts() {
  return `${GR}[${new Date().toISOString().replace("T"," ").slice(0,-1)}]${R}`;
}
function log(icon, col, msg) { console.log(`${ts()} ${col}${icon} ${msg}${R}`); }

function banner() {
  console.clear();
  console.log('\x1b[33m%s\x1b[0m', ' ▄▄▄       ██░ ██  ██    ██  ██    ██      ██████  ███▄    █  ██▓ ██▓███  ▓█████  ██▀███  ');
  console.log('\x1b[33m%s\x1b[0m', '▒████▄    ▓██░ ██▒ ██  ▓██▒  ██  ▓██▒    ▒██    ▒  ██ ▀█   █ ▓██▒▓██░  ██▒▓█   ▀ ▓██ ▒ ██▒');
  console.log('\x1b[33m%s\x1b[0m', '▒██  ▀█▄  ▒██▀▀██░▓██  ▒██░ ▓██  ▒██░    ░ ▓██▄   ▓██  ▀█ ██▒▒██▒▓██░ ██▓▒▒███   ▓██ ░▄█ ▒');
  console.log('\x1b[33m%s\x1b[0m', '░██▄▄▄▄██ ░▓█ ░██ ▓▓█  ░██░ ▓▓█  ░██░      ▒   ██▒▓██▒  ▐▌██▒░██░▒██▄█▓▒ ▒▒▓█  ▄ ▒██▀▀█▄  ');
  console.log('\x1b[33m%s\x1b[0m', ' ▓█   ▓██▒░▓█▒░██▓▒▒█████▓  ▒▒█████▓    ▒██████▒▒▒██░   ▓██░░██░▒██▒ ░  ░░▒████▒░██▓ ▒██▒');
  console.log('\x1b[33m%s\x1b[0m', ' ▒▒   ▓▒█░ ▒ ░░▒░▒░▒▓▒ ▒ ▒  ░▒▓▒ ▒ ▒    ▒ ▒▓▒ ▒ ░░ ▒░   ▒ ▒ ░▓  ▒▓▒░ ░  ░░░ ▒░ ░░ ▒▓ ░▒▓░');
  console.log('\x1b[33m%s\x1b[0m', '  ▒   ▒▒ ░ ▒ ░▒░ ░░░▒░ ░ ░  ░░▒░ ░ ░    ░ ░▒  ░ ░░ ░░   ░ ▒░ ▒ ░░▒ ░      ░ ░  ░  ░▒ ░ ▒░');
  console.log('\x1b[33m%s\x1b[0m', '  ░   ▒    ░  ░░ ░ ░░░ ░ ░   ░░░ ░ ░    ░  ░  ░     ░   ░ ░  ▒ ░░░            ░     ░░   ░ ');
  console.log('\x1b[33m%s\x1b[0m', '      ░  ░ ░  ░  ░   ░                                        ░                             ');
  console.log('\x1b[90m%s\x1b[0m', '                               > cannutella\n');
  console.log('\x1b[90m%s\x1b[0m', '  v3.0 ULTRA │ Gateway+Polling Hybrid │ Pre-warmed TLS │ 10x Parallel\n');
}

// ── DURUM ──────────────────────────────────────────────────────────────────
let CFG           = {};
let claimed       = false;
let pollActive    = true;
let wsConn        = null;
let hbTimer       = null;
let wsSeq         = null;
let watchedGuilds = {};
let pollCount     = 0;

// ── PRE-BUILT BUFFER & PRE-WARMED SOCKETS ──────────────────────────────────
let PATCH_BODY_BUF = null;
let PATCH_OPTIONS  = null;
let WARMED_AGENT   = null;
let GET_OPTIONS    = null;

function buildBuffers() {
  const body = JSON.stringify({ code: CFG.vanityUrl });
  PATCH_BODY_BUF = Buffer.from(body);

  WARMED_AGENT = new https.Agent({
    keepAlive      : true,
    keepAliveMsecs : 30000,
    maxSockets     : 20,
    maxFreeSockets : 20,
    timeout        : 5000,
    scheduling     : "fifo",
  });

  PATCH_OPTIONS = {
    hostname: "discord.com",
    port    : 443,
    path    : `/api/v10/guilds/${CFG.guildId}/vanity-url`,
    method  : "PATCH",
    agent   : WARMED_AGENT,
    headers : {
      "Authorization"  : CFG.token,
      "Content-Type"   : "application/json",
      "Content-Length" : PATCH_BODY_BUF.length,
      "User-Agent"     : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection"     : "keep-alive",
    },
  };

  GET_OPTIONS = {
    hostname: "discord.com",
    port    : 443,
    path    : `/api/v9/invites/${CFG.vanityUrl}?with_counts=false&with_expiration=false`,
    method  : "GET",
    agent   : WARMED_AGENT,
    headers : {
      "Authorization"  : CFG.token,
      "User-Agent"     : "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Connection"     : "keep-alive",
      "Accept-Encoding": "gzip, deflate, br",
    },
  };
}

// ── SOCKET ISITMA ──────────────────────────────────────────────────────────
async function warmSockets() {
  log("🔥", CY, "TLS soketleri ısıtılıyor (10 bağlantı)...");
  const warmReqs = Array(10).fill(null).map(() =>
    new Promise((resolve) => {
      const req = https.request({
        hostname: "discord.com",
        port    : 443,
        path    : "/api/v10/gateway",
        method  : "GET",
        agent   : WARMED_AGENT,
        headers : { "User-Agent": "Mozilla/5.0", "Connection": "keep-alive" },
      }, (res) => { res.resume(); resolve(); });
      req.on("error", resolve);
      req.setTimeout(4000, () => { req.destroy(); resolve(); });
      req.end();
    })
  );
  await Promise.all(warmReqs);
  log("✅", G, "10 TLS soketi ısıtıldı. Claim anında handshake gecikmesi YOK.");
}

// ── HIZLI HTTP ─────────────────────────────────────────────────────────────
function fastRequest(options, bodyBuf = null) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(0));
    req.setTimeout(4000, () => { req.destroy(); resolve(0); });
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function httpGet(options) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: 0, body: "" }); });
    req.end();
  });
}

// ── CLAIM — HOT PATH ───────────────────────────────────────────────────────
function FIRE(reason) {
  if (claimed) return;
  claimed    = true;
  pollActive = false;

  const t0 = performance.now();

  const reqs = [];
  for (let i = 0; i < 10; i++) {
    reqs.push(fastRequest(PATCH_OPTIONS, PATCH_BODY_BUF));
  }

  Promise.all(reqs).then((codes) => {
    const elapsed = (performance.now() - t0).toFixed(2);
    const ok = codes.includes(200);

    if (ok) {
      process.stdout.write(
        `\n${G}${BOLD}` +
        `  ╔══════════════════════════════════════════════╗\n` +
        `  ║  ✅  BAŞARILI!  discord.gg/${CFG.vanityUrl.padEnd(17)}║\n` +
        `  ║  ⚡  Claim süresi : ${(elapsed + "ms").padEnd(23)}║\n` +
        `  ║  🎯  Sebep        : ${reason.slice(0,23).padEnd(23)}║\n` +
        `  ╚══════════════════════════════════════════════╝${R}\n\n`
      );
      sendWebhook(true, elapsed, reason);
    } else {
      log("❌", RE + BOLD, `BAŞARISIZ! Kodlar: [${codes.join(",")}] — ${elapsed}ms`);
      log("ℹ️ ", GR, "Sebep: Başkası daha hızlıydı ya da token/guild yetkisi yok.");
      sendWebhook(false, elapsed, reason, codes.join(","));
    }

    setTimeout(() => process.exit(0), 2500);
  });
}

// ── WEBHOOK ────────────────────────────────────────────────────────────────
function sendWebhook(ok, ms, reason, codes = "") {
  if (!CFG.webhookUrl || !CFG.webhookUrl.startsWith("http")) return;
  let u; try { u = new URL(CFG.webhookUrl); } catch { return; }

  const body = Buffer.from(JSON.stringify({
    content   : ok ? `@everyone 🍫 **discord.gg/${CFG.vanityUrl}** ALINDI!` : null,
    username  : "NUTELLA Sniper",
    avatar_url: "https://i.imgur.com/oKzncfw.png",
    embeds: [{
      title      : ok ? "🍫 SNIPE BAŞARILI!" : "❌ SNIPE BAŞARISIZ",
      description: ok
        ? `**discord.gg/${CFG.vanityUrl}** alındı!\n⚡ Claim süresi: \`${ms}ms\`\n🎯 Sebep: \`${reason}\``
        : `**discord.gg/${CFG.vanityUrl}** alınamadı.\nKodlar: \`${codes}\``,
      color    : ok ? 0xF5A623 : 0xFF4444,
      footer   : { text: "NUTELLA Sniper v3.0 Ultra" },
      timestamp: new Date().toISOString(),
    }],
  }));

  const req = https.request({
    hostname: u.hostname,
    path    : u.pathname + u.search,
    method  : "POST",
    headers : { "Content-Type": "application/json", "Content-Length": body.length },
  }, (r) => r.resume());
  req.on("error", () => {});
  req.write(body);
  req.end();
}

// ── POLLING — 10ms ARALIK ──────────────────────────────────────────────────
async function startPolling() {
  log("🔄", CY, `Polling aktif (10ms) — yedek sistem`);

  const opt = { ...GET_OPTIONS };
  let rateLimitUntil = 0;

  function tick() {
    if (!pollActive || claimed) return;

    const now = Date.now();
    if (now < rateLimitUntil) {
      setTimeout(tick, rateLimitUntil - now);
      return;
    }

    const req = https.request(opt, (res) => {
      pollCount++;

      if (res.statusCode === 404) {
        res.resume();
        FIRE("POLLING-404");
        return;
      }

      if (res.statusCode === 429) {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let wait = 2000;
          try { wait = Math.ceil((JSON.parse(raw).retry_after || 2) * 1000); } catch {}
          log("⛔", RE, `Rate limit! ${wait}ms bekleniyor...`);
          rateLimitUntil = Date.now() + wait;
          setTimeout(tick, wait);
        });
        return;
      }

      res.resume();

      if (pollCount % 200 === 0) {
        process.stdout.write(`\r${GR}  [POLL #${pollCount}] discord.gg/${CFG.vanityUrl} aktif...   ${R}`);
      }

      setTimeout(tick, 10);
    });

    req.on("error", () => { if (!claimed) setTimeout(tick, 50); });
    req.setTimeout(3000, () => { req.destroy(); if (!claimed) setTimeout(tick, 50); });
    req.end();
  }

  tick();
}

// ── GATEWAY — ANLIK DETECTION ──────────────────────────────────────────────
function startGateway() {
  log("🌐", CY, "Discord Gateway WebSocket bağlanıyor...");

  wsConn = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json", {
    handshakeTimeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  wsConn.on("open", () => log("🔗", G, "Gateway bağlantısı kuruldu."));

  wsConn.on("message", (raw) => {
    let p;
    try { p = JSON.parse(raw); } catch { return; }

    const op = p.op;
    const t  = p.t;
    const d  = p.d;
    if (p.s !== null && p.s !== undefined) wsSeq = p.s;

    if (op === 10) {
      const ms = d.heartbeat_interval;

      setTimeout(() => wsConn.readyState === 1 &&
        wsConn.send(`{"op":1,"d":${wsSeq}}`),
        Math.floor(Math.random() * ms)
      );

      hbTimer = setInterval(() =>
        wsConn.readyState === 1 && wsConn.send(`{"op":1,"d":${wsSeq || "null"}}`),
        ms
      );

      wsConn.send(JSON.stringify({
        op: 2,
        d : {
          token     : CFG.token,
          intents   : 1 | (1 << 9),
          properties: { os: "windows", browser: "chrome", device: "desktop" },
          presence  : { status: "invisible", afk: false },
        },
      }));
      return;
    }

    if (op === 11) return;
    if (op === 7)  { reconnectGW(); return; }
    if (op === 9)  { reconnectGW(); return; }
    if (op !== 0)  return;

    if (t === "READY") {
      const guilds = d.guilds || [];
      log("✅", G + BOLD, `Gateway READY! ${d.user?.username}#${d.user?.discriminator} | ${guilds.length} sunucu`);
      log("👁️ ", Y, `Hedef izleniyor: discord.gg/${CFG.vanityUrl}`);
      guilds.forEach((g) => {
        if (g.vanity_url_code) watchedGuilds[g.id] = g.vanity_url_code;
      });
      return;
    }

    if (t === "GUILD_UPDATE" && !claimed) {
      const prev = watchedGuilds[d.id];
      const curr = d.vanity_url_code || null;
      if (prev === CFG.vanityUrl && curr !== CFG.vanityUrl) {
        FIRE(`GW:GUILD_UPDATE:${d.id}`);
        return;
      }
      if (curr) watchedGuilds[d.id] = curr;
      else delete watchedGuilds[d.id];
      return;
    }

    if (t === "GUILD_DELETE" && !claimed) {
      if (watchedGuilds[d.id] === CFG.vanityUrl) {
        FIRE(`GW:GUILD_DELETE:${d.id}`);
      }
      delete watchedGuilds[d.id];
      return;
    }

    if (t === "GUILD_CREATE") {
      if (d.vanity_url_code) watchedGuilds[d.id] = d.vanity_url_code;
      return;
    }
  });

  wsConn.on("close", (code) => {
    clearInterval(hbTimer);
    if (!claimed && pollActive) {
      log("🔌", RE, `Gateway kapandı (${code}). 2s sonra yeniden bağlanıyor...`);
      setTimeout(startGateway, 2000);
    }
  });

  wsConn.on("error", (e) => log("⚠️ ", RE, `GW hata: ${e.message}`));
}

function reconnectGW() {
  clearInterval(hbTimer);
  try { wsConn?.terminate(); } catch {}
  setTimeout(startGateway, 1000);
}

// ── AUTO JOIN ──────────────────────────────────────────────────────────────
async function autoJoinTarget() {
  log("🔍", Y, `Hedef URL sahibi aranıyor: discord.gg/${CFG.vanityUrl}`);

  const res = await httpGet({
    hostname: "discord.com",
    port    : 443,
    path    : `/api/v9/invites/${CFG.vanityUrl}?with_counts=false`,
    method  : "GET",
    agent   : WARMED_AGENT,
    headers : { "Authorization": CFG.token, "User-Agent": "Mozilla/5.0" },
  });

  if (res.status === 404) {
    log("⚡", Y + BOLD, "URL zaten müsait! Hemen alınıyor...");
    FIRE("STARTUP-404");
    return;
  }

  if (res.status !== 200) {
    log("⚠️ ", RE, `Invite kontrol başarısız: ${res.status}. Token geçerli mi?`);
    return;
  }

  let invite;
  try { invite = JSON.parse(res.body); } catch {
    log("⚠️ ", RE, "Invite JSON parse hatası.");
    return;
  }

  const guildId   = invite?.guild?.id;
  const guildName = invite?.guild?.name || "?";

  if (!guildId) { log("⚠️ ", RE, "Guild ID bulunamadı."); return; }

  if (watchedGuilds[guildId]) {
    log("✅", G, `Zaten bu sunucudasın: ${guildName} (${guildId})`);
    log("👁️ ", G, "Gateway o sunucuyu anlık izliyor!");
    return;
  }

  log("🚪", CY, `Sunucuya join atılıyor: ${guildName} (${guildId})`);

  const joinReq = https.request({
    hostname: "discord.com",
    port    : 443,
    path    : `/api/v9/invites/${CFG.vanityUrl}`,
    method  : "POST",
    agent   : WARMED_AGENT,
    headers : {
      "Authorization"  : CFG.token,
      "Content-Type"   : "application/json",
      "Content-Length" : "2",
      "User-Agent"     : "Mozilla/5.0",
    },
  }, (r) => {
    let d = ""; r.on("data", c => d += c);
    r.on("end", () => {
      if (r.statusCode === 200 || r.statusCode === 204) {
        log("✅", G + BOLD, `Sunucuya katıldın: ${guildName}`);
        log("⚡", G, "Gateway artık ANLIK İZLİYOR — polling sadece yedek.");
        watchedGuilds[guildId] = CFG.vanityUrl;
      } else {
        log("⚠️ ", RE, `Join başarısız: ${r.statusCode}. Polling devam ediyor.`);
      }
    });
  });
  joinReq.on("error", () => {});
  joinReq.write("{}");
  joinReq.end();
}

// ── YARDIMCI ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ask(rl, q) { return new Promise((r) => rl.question(q, r)); }

function loadCfg() {
  if (fs.existsSync("config.json")) {
    try { return JSON.parse(fs.readFileSync("config.json", "utf-8")); } catch {}
  }
  return null;
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  banner();

  const rl    = readline.createInterface({ input: process.stdin, output: process.stdout });
  const saved = loadCfg();

  if (saved?.token) {
    process.stdout.write(`${GR}  Kayıtlı config: discord.gg/${saved.vanityUrl}${R}\n\n`);
    const ans = await ask(rl, `${Y}  Kayıtlı config kullan? (e/h): ${R}`);
    if (ans.trim().toLowerCase() === "e") CFG = saved;
  }

  if (!CFG.token) {
    process.stdout.write(`${GR}  ─────────────────────────────────────────────────────${R}\n`);
    CFG.token      = (await ask(rl, `${Y}  🍫 Account Token        : ${R}`)).trim();
    CFG.guildId    = (await ask(rl, `${Y}  🍫 Kendi Server ID      : ${R}`)).trim();
    CFG.webhookUrl = (await ask(rl, `${Y}  🍫 Webhook URL (opsiy.) : ${R}`)).trim();
    CFG.vanityUrl  = (await ask(rl, `${Y}  🍫 Hedef Vanity URL     : ${R}`)).trim();
    process.stdout.write(`${GR}  ─────────────────────────────────────────────────────${R}\n\n`);

    const sv = await ask(rl, `${Y}  Config kaydet? (e/h): ${R}`);
    if (sv.trim().toLowerCase() === "e") {
      fs.writeFileSync("config.json", JSON.stringify({
        token: CFG.token, guildId: CFG.guildId,
        webhookUrl: CFG.webhookUrl, vanityUrl: CFG.vanityUrl,
      }, null, 2));
      log("💾", CY, "config.json kaydedildi.");
    }
  }

  rl.close();
  console.log();

  log("🚀", Y + BOLD, `NUTELLA SNIPER v3.0 başlatıldı!`);
  log("🎯", Y,        `Hedef: discord.gg/${CFG.vanityUrl}`);
  log("⚡", CY,       `Mod: GATEWAY (anlık) + POLLING 10ms + 10x PARALEL CLAIM`);
  log("🔥", G,        `Pre-built buffer + Pre-warmed TLS soketler aktif`);
  console.log();

  buildBuffers();
  await warmSockets();
  startGateway();
  await sleep(1000);
  await autoJoinTarget();
  await sleep(500);
  if (!claimed) startPolling();
}

main().catch((e) => { console.error(e); process.exit(1); });