"use strict";

const NEED = { 15: 4, 30: 2, 60: 1 };
const PLACE = /(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/;
const TONES = { ok: "status", busy: "status status--busy", warn: "status status--error" };
const MAPS = '<a href="#" data-url="https://yandex.ru/maps">Яндекс Картах</a>';
const PLACE_HINT = `Нажмите на точку в ${MAPS} и скопируйте координаты из карточки места.`;
const PLACE_ERROR = "Не похоже на координаты. Нужны широта и долгота через запятую.";

const $ = (selector) => document.querySelector(selector);

function showStatus({ tone, text, age }) {
  const time = age == null ? "" : new Date(Date.now() - age).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  const parts = tone === "ok" ? [`Обновлено в ${time}`, text] : [text, time && `данные от ${time}`];
  $("#status").textContent = parts.filter(Boolean).join(" · ");
  $("#status").className = TONES[tone] ?? TONES.busy;
  if (tone !== "busy") $("#refresh").removeAttribute("aria-busy");
}

function showGlobals(globals) {
  const keys = String(globals.keys ?? "").split(/[\s,;]+/).filter(Boolean).length;
  const need = NEED[globals.interval ?? 60] ?? 1;
  const quota = $("#quota");
  quota.textContent = keys >= need
    ? `Ключей хватает: ${keys} из ${need} нужных.`
    : `Для такой частоты нужно ключей: ${need}, сейчас ${keys}. Один ключ выдерживает обновление раз в час.`;
  quota.classList.toggle("hint--error", keys < need);

  const coords = String(globals.coords ?? "").trim();
  const bad = Boolean(coords) && !PLACE.test(coords);
  const hint = $("#coordsHint");
  hint.classList.toggle("hint--error", bad);
  hint.innerHTML = bad ? PLACE_ERROR : PLACE_HINT;
  if (bad) $("#coords").setAttribute("aria-invalid", "true");
  else $("#coords").removeAttribute("aria-invalid");
}

function showSettings(settings) {
  $('[data-show="color"]').hidden = settings.background !== "color";
}

showGlobals({});
showSettings({});

opensd.ready.then(() => {
  showGlobals(opensd.globals);
  showSettings(opensd.settings);
});

opensd.on("globals", showGlobals);
opensd.on("settings", showSettings);
opensd.on("message", showStatus);

document.addEventListener("input", () => showGlobals(opensd.globals));
document.addEventListener("change", () => {
  showGlobals(opensd.globals);
  showSettings(opensd.settings);
});

$("#refresh").addEventListener("click", () => {
  $("#refresh").setAttribute("aria-busy", "true");
  showStatus({ tone: "busy", text: "Обновление…", age: null });
  opensd.send({ refresh: true });
});

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-url]");
  if (!link) return;
  event.preventDefault();
  opensd.openUrl(link.dataset.url);
});
