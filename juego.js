// Datazo — trivia argentina de cartas. Primera versión: ronda del día y partida contra la máquina, sin servidor.
const CATS = [
  { id: 'h', n: 'Historia', c: 'var(--c1)', e: '📜' },
  { id: 'g', n: 'Geografía', c: 'var(--c2)', e: '🗺️' },
  { id: 'c', n: 'Cultura pop', c: 'var(--c3)', e: '🎸' },
  { id: 'd', n: 'Deporte', c: 'var(--c4)', e: '⚽' },
];
const META = 10;           // cartas para ganar una partida
const TURNOS_DIA = 5;      // cartas de la ronda del día
const TIEMPO = 20;         // segundos por pregunta
const PUNTERIA_RIVAL = .55;
const COSTO = { mitad: 30, tiempo: 20 };

const $ = s => document.querySelector(s);
const app = $('#app');
const azar = n => Math.floor(Math.random() * n);
const porCat = CATS.map(k => PREGUNTAS.filter(p => p.cat === k.id));

// ---------- Lo que se guarda en el celular ----------
const E = Object.assign({ monedas: 100, racha: 0, ultima: '', dia: null, jugadas: 0, ganadas: 0, vistas: [], tema: 'claro' }, leer());
function leer() { try { return JSON.parse(localStorage.getItem('datazo')) || {}; } catch { return {}; } }
function guardar() { try { localStorage.setItem('datazo', JSON.stringify(E)); } catch {} pintarBarra(); }

// La ronda cambia a la medianoche de Argentina, para todos igual.
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const diaAntes = f => new Date(new Date(f + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
const lindo = f => f.slice(8) + '/' + f.slice(5, 7);

function semilla(txt) {
  let h = 1779033703;
  for (const ch of txt) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
// Mismo dado y mismas cartas para todo el país: sale todo de la fecha.
function planDelDia(fecha) {
  const r = semilla('datazo-' + fecha), usadas = new Set();
  return Array.from({ length: TURNOS_DIA }, () => ({
    dado: 1 + Math.floor(r() * 6),
    catSorpresa: Math.floor(r() * 4),
    porCat: porCat.map(lista => { let p; do p = lista[Math.floor(r() * lista.length)]; while (usadas.has(p.id)); usadas.add(p.id); return p; }),
  }));
}

// ---------- Barra y tema ----------
function pintarBarra() {
  $('#monedas').textContent = '🪙 ' + E.monedas;
  $('#racha').textContent = '🔥 ' + E.racha + (E.racha === 1 ? ' día' : ' días');
  document.documentElement.dataset.tema = E.tema;
  $('#tema').textContent = E.tema === 'oscuro' ? '☀️' : '🌙';
  $('#tema').title = E.tema === 'oscuro' ? 'Pasar a tema claro' : 'Pasar a tema oscuro';
}
$('#tema').onclick = () => { E.tema = E.tema === 'oscuro' ? 'claro' : 'oscuro'; guardar(); };

// ---------- Inicio ----------
const cuadros = marcas => marcas.map(m => m === 'bien' ? '🟩' : '🟥').join('');
function inicio() {
  pararReloj();
  const f = hoy(), d = E.dia && E.dia.fecha === f ? E.dia : null;
  if (E.ultima && E.ultima !== f && E.ultima !== diaAntes(f)) { E.racha = 0; guardar(); }
  const ronda = d && d.fin
    ? `<h3>☀️ Ronda del día · ${lindo(f)}</h3><div class="puntos-dia">${d.puntos} puntos</div><div class="cuadros">${cuadros(d.marcas)}</div>
       <p>Volvé mañana: hay ronda nueva a la medianoche.</p><button class="boton" id="compartir">Compartir mi resultado</button>`
    : `<h3>☀️ Ronda del día · ${lindo(f)}</h3><p>${TURNOS_DIA} cartas, las mismas para todo el país. Cuanto más rápido respondés, más puntos.</p>
       <button class="boton" id="jugar-dia">${d ? 'Seguir la ronda' : 'Jugar ahora'}</button>`;
  app.innerHTML = `
    <div class="logo">Datazo</div><p class="lema">Tirá el dado y juntá ${META} cartas antes que nadie</p>
    <div class="panel destacado">${ronda}</div>
    <div class="panel"><h3>🎲 Partida completa</h3><p>Vos contra la máquina, por turnos. Gana quien junta ${META} cartas primero.</p>
      <button class="boton" id="jugar-maquina">Jugar una partida</button></div>
    <div class="panel"><h3>Tus números</h3>
      <div class="fila"><b>Partidas ganadas</b><span>${E.ganadas} de ${E.jugadas}</span></div>
      <div class="fila"><b>Racha de rondas del día</b><span>${E.racha}</span></div></div>
    <div class="panel"><h3>Muy pronto</h3><p>Duelos con amigos, ranking de todo el país y mazos temáticos.</p></div>`;
  if (d && d.fin) $('#compartir').onclick = compartir;
  else $('#jugar-dia').onclick = () => empezar('dia');
  $('#jugar-maquina').onclick = () => empezar('maquina');
}

async function compartir() {
  const d = E.dia, txt = `Datazo ${lindo(d.fecha)} · ${d.puntos} puntos\n${cuadros(d.marcas)}`;
  try { if (navigator.share) await navigator.share({ text: txt }); else { await navigator.clipboard.writeText(txt); $('#compartir').textContent = '¡Copiado!'; } } catch {}
}

// ---------- Partida ----------
let P = null, fase = '', reloj = null, restante = 0, actual = null;

function empezar(modo) {
  P = { modo, turno: 0, yo: 0, rival: 0, puntos: 0, marcas: [], doble: false };
  if (modo === 'dia') {
    const f = hoy();
    if (!E.dia || E.dia.fecha !== f) E.dia = { fecha: f, puntos: 0, marcas: [], fin: false };
    Object.assign(P, { plan: planDelDia(f), turno: E.dia.marcas.length, puntos: E.dia.puntos, marcas: [...E.dia.marcas] });
  }
  app.innerHTML = `
    <div class="marcador" id="marcador"></div>
    <div class="tirada"><button class="dado" id="dado">?</button>
      <div class="caras" id="caras">${CATS.map((k, i) => `<span style="--c:${k.c}"><em>${i + 1}</em>${k.n}</span>`).join('')}
        <span style="--c:#6B7396"><em>5</em>Elegís vos</span><span style="--c:#6B7396"><em>6</em>Carta sorpresa</span></div></div>
    <div class="carta" id="carta"></div>
    <div class="comodines"><button id="mitad">✂️ 50/50<br>🪙 ${COSTO.mitad}</button><button id="tiempo">⏱️ +10 seg<br>🪙 ${COSTO.tiempo}</button></div>
    <button class="enlace" id="salir">Salir al inicio</button>`;
  $('#dado').onclick = tirar;
  $('#mitad').onclick = usarMitad;
  $('#tiempo').onclick = usarTiempo;
  $('#salir').onclick = inicio;
  esperarTirada();
}

function pintarMarcador() {
  const fila = (cls, nombre, n) => `<div class="${cls}">${nombre} <i>${Array.from({ length: META }, (_, i) => `<u class="${i < n ? 'si' : ''}"></u>`).join('')}</i> ${n}</div>`;
  $('#marcador').innerHTML = P.modo === 'dia'
    ? `<div>Ronda <i>${P.plan.map((_, i) => `<u class="${P.marcas[i] || (i === P.turno ? 'ahora' : '')}"></u>`).join('')}</i> ${P.puntos} pts</div>`
    : fila('', 'Vos', P.yo) + fila('rival', 'Máquina', P.rival);
}
function pintarCarta(html, color) {
  const c = $('#carta');
  c.style.setProperty('--c', color || 'var(--acento)');
  c.innerHTML = html;
  c.classList.remove('entra'); void c.offsetWidth; c.classList.add('entra');
}
function marcarCara(v) { document.querySelectorAll('#caras span').forEach((s, i) => s.classList.toggle('on', i === v - 1)); }
function comodines(activos) {
  $('#mitad').disabled = !activos || E.monedas < COSTO.mitad;
  $('#tiempo').disabled = !activos || E.monedas < COSTO.tiempo;
}
function girar(despues, ms = 450) {
  const d = $('#dado'); d.classList.remove('listo', 'gira'); void d.offsetWidth; d.classList.add('gira');
  setTimeout(() => { if (P) despues(); }, ms);
}

function esperarTirada() {
  fase = 'tirar'; pintarMarcador(); marcarCara(0); comodines(false);
  const d = $('#dado'); d.textContent = '?'; d.disabled = false; d.classList.add('listo');
  pintarCarta('<div class="centro"><big>🎲</big>Te toca: tocá el dado</div>');
}
function tirar() {
  if (fase !== 'tirar') return;
  fase = 'girando'; $('#dado').disabled = true;
  const v = P.modo === 'dia' ? P.plan[P.turno].dado : 1 + azar(6);
  girar(() => resolver(v));
}
function resolver(v) {
  $('#dado').textContent = v; marcarCara(v); P.doble = false;
  if (v <= 4) return preguntar(v - 1);
  if (v === 5) {
    pintarCarta(`<div class="centro">Elegís vos<small>¿De qué querés la carta?</small></div>
      <div class="elegir">${CATS.map((k, i) => `<button data-i="${i}" style="--c:${k.c}">${k.e} ${k.n}</button>`).join('')}</div>`);
    document.querySelectorAll('.elegir button').forEach(b => b.onclick = () => preguntar(+b.dataset.i));
    return;
  }
  // Carta sorpresa: en partida le robás una carta al rival; si no tiene (o en la ronda del día), la carta vale doble.
  if (P.modo === 'maquina' && P.rival > 0) {
    P.rival--; P.yo++; pintarMarcador();
    pintarCarta('<div class="centro"><big>🃏</big>¡Carta sorpresa!<small>Le robaste una carta a la máquina.</small></div><button class="boton" id="seguir">Seguir</button>');
    $('#seguir').onclick = despues;
    return;
  }
  P.doble = true;
  const ci = P.modo === 'dia' ? P.plan[P.turno].catSorpresa : azar(4);
  pintarCarta(`<div class="centro"><big>🃏</big>¡Carta sorpresa!<small>La próxima vale doble: ${CATS[ci].n}.</small></div><button class="boton" id="seguir">Dale</button>`);
  $('#seguir').onclick = () => preguntar(ci);
}

function sortear(ci) {
  const lista = porCat[ci], libres = lista.filter(p => !E.vistas.includes(p.id));
  const p = (libres.length ? libres : lista)[azar(libres.length || lista.length)];
  E.vistas = [...E.vistas, p.id].slice(-50);
  return p;
}
function preguntar(ci) {
  const k = CATS[ci];
  actual = P.modo === 'dia' ? P.plan[P.turno].porCat[ci] : sortear(ci);
  const ops = actual.o.map((t, i) => ({ t, ok: i === 0 })).sort(() => Math.random() - .5);
  pintarCarta(`<span class="cat">${k.n}${P.doble ? ' · vale doble' : ''}</span><p class="pregunta">${actual.q}</p>
    <div class="ops">${ops.map(o => `<button data-ok="${o.ok ? 1 : ''}">${o.t}</button>`).join('')}</div>
    <div class="reloj"><b id="arena"></b></div><div id="pie"></div>`, k.c);
  document.querySelectorAll('.ops button').forEach(b => b.onclick = () => responder(b));
  fase = 'responder'; comodines(true);
  restante = TIEMPO; pararReloj();
  reloj = setInterval(() => {
    restante -= .1;
    const a = $('#arena'); if (a) a.style.width = Math.max(0, Math.min(100, restante / TIEMPO * 100)) + '%';
    if (restante <= 0) responder(null);
  }, 100);
}
function pararReloj() { clearInterval(reloj); reloj = null; }

function responder(b) {
  if (fase !== 'responder') return;
  fase = 'resuelto'; pararReloj(); comodines(false);
  const ok = !!(b && b.dataset.ok);
  document.querySelectorAll('.ops button').forEach(x => { x.disabled = true; if (x.dataset.ok) x.classList.add('bien'); });
  if (b && !ok) b.classList.add('mal');
  let texto;
  if (P.modo === 'dia') {
    const pts = ok ? (100 + Math.round(100 * Math.max(0, restante) / TIEMPO)) * (P.doble ? 2 : 1) : 0;
    P.puntos += pts; P.marcas.push(ok ? 'bien' : 'mal');
    Object.assign(E.dia, { puntos: P.puntos, marcas: [...P.marcas] });
    texto = ok ? `¡Bien! +${pts} puntos` : b ? 'No era esa.' : 'Se acabó el tiempo.';
  } else {
    const gana = ok ? (P.doble ? 2 : 1) : 0;
    P.yo = Math.min(META, P.yo + gana);
    texto = ok ? (gana === 2 ? '¡Bien! Te llevás dos cartas.' : '¡Bien! La carta es tuya.') : b ? 'No era esa. La carta vuelve al mazo.' : 'Se acabó el tiempo.';
  }
  if (ok) E.monedas += 10;
  guardar(); pintarMarcador();
  $('#pie').innerHTML = `<p class="veredicto">${texto}</p><button class="boton" id="seguir">Seguir</button>`;
  $('#seguir').onclick = despues;
}

function despues() {
  if (P.modo === 'dia') { P.turno++; return P.turno >= TURNOS_DIA ? fin() : esperarTirada(); }
  if (P.yo >= META) return fin();
  turnoRival();
}

function turnoRival() {
  fase = 'rival'; marcarCara(0); comodines(false);
  const d = $('#dado'); d.textContent = '?'; d.disabled = true; d.classList.remove('listo');
  pintarCarta('<div class="centro"><big>🤖</big>Juega la máquina…</div>');
  girar(() => {
    const v = 1 + azar(6); d.textContent = v; marcarCara(v);
    let texto;
    if (v === 6 && P.yo > 0) { P.yo--; P.rival++; texto = 'Sacó carta sorpresa y te robó una carta.'; }
    else {
      const k = CATS[v <= 4 ? v - 1 : azar(4)], doble = v === 6, acierta = Math.random() < PUNTERIA_RIVAL;
      if (acierta) P.rival = Math.min(META, P.rival + (doble ? 2 : 1));
      texto = `Le tocó ${k.n}${doble ? ' (vale doble)' : ''} y ${acierta ? 'acertó' : 'falló'}.`;
    }
    pintarMarcador();
    const termino = P.rival >= META;
    pintarCarta(`<div class="centro"><big>🤖</big>${texto}</div><button class="boton" id="seguir">${termino ? 'Ver resultado' : 'Me toca'}</button>`);
    $('#seguir').onclick = termino ? fin : esperarTirada;
  }, 900);
}

function fin() {
  pararReloj();
  let html;
  if (P.modo === 'dia') {
    const f = E.dia.fecha;
    if (!E.dia.fin) { E.dia.fin = true; E.racha = E.ultima === diaAntes(f) ? E.racha + 1 : 1; E.ultima = f; E.monedas += 20; }
    html = `<div class="logo">Datazo</div><div class="panel destacado"><h3>Ronda del día · ${lindo(f)}</h3>
      <div class="puntos-dia">${P.puntos} puntos</div><div class="cuadros">${cuadros(P.marcas)}</div>
      <p>🔥 Racha: ${E.racha} ${E.racha === 1 ? 'día' : 'días'} · 🪙 +20 por jugar hoy</p>
      <button class="boton" id="compartir">Compartir mi resultado</button></div>`;
  } else {
    const gane = P.yo >= META;
    E.jugadas++; if (gane) { E.ganadas++; E.monedas += 50; }
    html = `<div class="logo">Datazo</div><div class="panel destacado"><h3>${gane ? '🏆 ¡Ganaste!' : 'Ganó la máquina'}</h3>
      <div class="puntos-dia">${P.yo} a ${P.rival}</div><p>${gane ? '🪙 +50 por la victoria' : 'Estuvo cerca. ¿Revancha?'}</p>
      <button class="boton" id="otra">Jugar otra</button></div>`;
  }
  P = null; guardar();
  app.innerHTML = html + '<button class="boton dos" id="volver">Volver al inicio</button>';
  $('#volver').onclick = inicio;
  if ($('#compartir')) $('#compartir').onclick = compartir;
  if ($('#otra')) $('#otra').onclick = () => empezar('maquina');
}

// ---------- Comodines ----------
function usarMitad() {
  if (fase !== 'responder' || E.monedas < COSTO.mitad) return;
  const malas = [...document.querySelectorAll('.ops button')].filter(b => !b.dataset.ok && !b.disabled);
  if (malas.length < 3) return;
  malas.sort(() => Math.random() - .5).slice(0, 2).forEach(b => { b.disabled = true; b.classList.add('fuera'); });
  E.monedas -= COSTO.mitad; guardar(); comodines(true); $('#mitad').disabled = true;
}
function usarTiempo() {
  if (fase !== 'responder' || E.monedas < COSTO.tiempo) return;
  restante += 10; E.monedas -= COSTO.tiempo; guardar(); comodines(true);
}

pintarBarra();
inicio();
