// @ts-check
/// <reference path="./opensd.d.ts" />

const ACTION = "com.whxtelxs.yandexweather.now";
const API = "https://api.weather.yandex.ru/v2/forecast";
const ICONS = "https://yastatic.net/weather/i/icons/funky";
const THEMES = ["light", "dark", "circle", "flat"];
const PLACE = /(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/;
const MINUTE = 60000;
const RETRY = 5 * MINUTE;
const TAP_GAP = 10 * MINUTE;
const SETTLE = 1500;

const CONDITIONS = {
  clear: "ясно",
  "partly-cloudy": "малооблачно",
  cloudy: "облачно",
  overcast: "пасмурно",
  "light-rain": "небольшой дождь",
  rain: "дождь",
  "heavy-rain": "сильный дождь",
  showers: "ливень",
  "wet-snow": "дождь со снегом",
  "light-snow": "небольшой снег",
  snow: "снег",
  "snow-showers": "снегопад",
  hail: "град",
  thunderstorm: "гроза",
  "thunderstorm-with-rain": "дождь с грозой",
  "thunderstorm-with-hail": "гроза с градом",
};

let weather = null;
let status = { tone: "busy", text: "Загрузка…", short: "…" };
let fetchedAt = -Infinity;
let due = 0;
let keyIndex = 0;
let busy = false;
let signature = "";
let timer;

const icons = new Map();
const loading = new Set();
const settings = new Map();
const drawn = new Map();

function config() {
  const g = opensd.globals;
  const place = PLACE.exec(String(g.coords ?? ""));
  const keys = String(g.keys ?? "").split(/[\s,;]+/).filter(Boolean);
  return {
    lat: place?.[1],
    lon: place?.[2],
    keys,
    interval: (Number(g.interval) || 60) * MINUTE,
  };
}

function text(x, y, size, color, value, weight = 600) {
  const font = `font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}"`;
  return `<text x="${x}" y="${y}" text-anchor="middle" ${font} fill="${color}">${value}</text>`;
}

function fit(value, size, width = 128) {
  return Math.min(size, Math.floor(width / (String(value).length * 0.58)));
}

function svg(side, body) {
  const box = side ? "0 -15 145 175" : "0 0 145 145";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`;
}

function uri(image) {
  const bytes = new TextEncoder().encode(image);
  return "data:image/svg+xml;base64," + btoa(String.fromCharCode(...bytes));
}

function degrees(n) {
  const t = Math.round(n);
  const sign = t > 0 ? "+" : t < 0 ? "−" : "";
  return `${sign}${Math.abs(t)}°`;
}

function bright(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255 > 0.6;
}

function look(s) {
  const valid = typeof s.color === "string" && /^#[0-9a-f]{6}$/i.test(s.color);
  const fill = s.background === "color" && valid ? s.color : null;
  const light = !!fill && bright(fill);
  const auto = light ? "light" : "dark";
  return {
    theme: THEMES.includes(String(s.theme)) ? String(s.theme) : auto,
    back: fill ? `<rect x="0" y="-15" width="145" height="175" fill="${fill}"/>` : "",
    ink: light ? "#1B1B1B" : "white",
    dim: light ? "#555555" : "#8A8A8A",
  };
}

function art(theme, name, x, y, size) {
  const id = `${theme}/${name}`;
  const icon = icons.get(id);
  if (!icon) {
    if (!loading.has(id)) loadIcon(theme, name);
    return "";
  }
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${icon.box}">${icon.body}</svg>`;
}

function draw(s, side) {
  const { theme, back, ink, dim } = look(s);
  if (!weather) {
    return svg(side, back + text(72.5, 80, fit(status.short, 22), dim, status.short));
  }

  const temp = degrees(weather.temp);
  const captions = { feels: degrees(weather.feels), condition: CONDITIONS[weather.condition] ?? "" };
  const caption = captions[String(s.caption)] ?? "";

  if (!caption) {
    const icon = art(theme, weather.icon, 34.5, 4, 76);
    return svg(side, back + icon + text(72.5, 128, fit(temp, 46), ink, temp, 700));
  }

  const icon = art(theme, weather.icon, 40.5, 2, 64);
  const big = text(72.5, 104, fit(temp, 40), ink, temp, 700);
  const small = text(72.5, 133, fit(caption, 18), dim, caption);
  return svg(side, back + icon + big + small);
}

function render() {
  for (const key of opensd.keys(ACTION)) {
    const image = uri(draw(settings.get(key.context) ?? {}, key.controller === "side"));
    if (drawn.get(key.context) === image) continue;
    drawn.set(key.context, image);
    key.setImage(image);
  }
}

function report() {
  return { ...status, age: weather ? opensd.now() - fetchedAt : null };
}

function setStatus(tone, text, short = "ошибка") {
  status = { tone, text, short };
  for (const key of opensd.keys(ACTION)) key.toInspector(report());
}

async function loadIcon(theme, name) {
  if (!/^[\w+-]+$/.test(name)) return;
  const id = `${theme}/${name}`;
  loading.add(id);
  try {
    const response = await opensd.http(`${ICONS}/${theme}/${encodeURIComponent(name)}.svg`);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    const raw = response.body;
    const box = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? "0 0 32 32";
    const body = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    icons.set(id, { box, body });
    render();
  } catch (error) {
    opensd.warn(`icon ${id}:`, error);
  } finally {
    loading.delete(id);
  }
}

async function fetchWeather() {
  const { lat, lon, keys } = config();
  if (!keys.length) {
    setStatus("warn", "Добавьте ключ API", "нет ключа");
    return false;
  }
  if (!lat) {
    setStatus("warn", "Укажите координаты", "нет места");
    return false;
  }

  let failure = "";
  for (let i = 0; i < keys.length; i++) {
    const index = (keyIndex + i) % keys.length;
    try {
      const response = await opensd.http(`${API}?lat=${lat}&lon=${lon}&limit=1`, {
        headers: { "X-Yandex-Weather-Key": keys[index] },
        timeout: 10000,
      });

      if (response.status !== 200) {
        const rejected = [401, 403, 429].includes(response.status);
        failure = rejected ? `Ключ ${index + 1} не принят (${response.status})` : `Ошибка API (${response.status})`;
        continue;
      }

      const fact = JSON.parse(response.body).fact;
      weather = { temp: fact.temp, feels: fact.feels_like, icon: fact.icon, condition: fact.condition };
      keyIndex = index;
      fetchedAt = opensd.now();
      setStatus("ok", keys.length > 1 ? `ключ ${index + 1} из ${keys.length}` : "");
      return true;
    } catch {
      failure = "Нет связи с Яндекс Погодой";
    }
  }

  setStatus("warn", failure, failure.startsWith("Ключ") ? "ключ" : "нет сети");
  return false;
}

async function update() {
  busy = true;
  const ok = await fetchWeather();
  busy = false;
  due = opensd.now() + (ok ? config().interval : RETRY);
  render();
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (busy || !opensd.keys(ACTION).length) return;
  timer = setTimeout(() => {
    if (opensd.keys(ACTION).length) update();
  }, Math.max(0, due - opensd.now()));
}

function refreshNow() {
  due = 0;
  schedule();
}

opensd.on("globals", () => {
  const { lat, lon, keys, interval } = config();
  const next = `${lat},${lon},${keys}`;
  if (next === signature) {
    due = fetchedAt + interval;
  } else {
    signature = next;
    keyIndex = 0;
    due = opensd.now() + SETTLE;
  }
  schedule();
});

opensd.on("systemWake", refreshNow);

opensd.action(ACTION, {
  appear({ context, settings: values }) {
    settings.set(context, values);
    drawn.delete(context);
    render();
    schedule();
  },
  settings({ context, settings: values }) {
    settings.set(context, values);
    render();
  },
  disappear({ context }) {
    settings.delete(context);
    drawn.delete(context);
  },
  keyDown({ key }) {
    if (opensd.now() - fetchedAt < TAP_GAP) key.flash("ok");
    else refreshNow();
  },
  inspectorOpen({ key }) {
    key.toInspector(report());
  },
  inspectorMessage({ payload }) {
    if (payload && typeof payload === "object" && "refresh" in payload) refreshNow();
  },
});
