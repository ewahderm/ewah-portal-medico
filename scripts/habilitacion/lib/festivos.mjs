// Festivos de Colombia calculados (Ley 51 de 1983 "Ley Emiliani" + fechas
// móviles de Pascua). Sirve para cotejar `curaduria/festivos-co.json`: la
// siembra usa el archivo curado, y la validación exige que coincida con este
// cálculo (dos fuentes independientes del mismo dato).
import { iso, sumarDias, diaSemana } from "./fechas.mjs";

/** Domingo de Pascua (algoritmo anónimo gregoriano / Meeus-Jones-Butcher). */
export function domingoDePascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes, dia);
}

/** Traslada al lunes siguiente si no cae en lunes (Ley 51/1983). */
export function alLunesSiguiente(fechaIso) {
  const dow = diaSemana(fechaIso);
  if (dow === 1) return fechaIso;
  return sumarDias(fechaIso, (8 - dow) % 7);
}

export function festivosColombia(anio) {
  const pascua = domingoDePascua(anio);
  const lista = [
    [iso(anio, 1, 1), "Año Nuevo"],
    [alLunesSiguiente(iso(anio, 1, 6)), "Día de los Reyes Magos"],
    [alLunesSiguiente(iso(anio, 3, 19)), "Día de San José"],
    [sumarDias(pascua, -3), "Jueves Santo"],
    [sumarDias(pascua, -2), "Viernes Santo"],
    [iso(anio, 5, 1), "Día del Trabajo"],
    [sumarDias(pascua, 43), "Ascensión del Señor"],
    [sumarDias(pascua, 64), "Corpus Christi"],
    [sumarDias(pascua, 71), "Sagrado Corazón de Jesús"],
    [alLunesSiguiente(iso(anio, 6, 29)), "San Pedro y San Pablo"],
    [iso(anio, 7, 20), "Día de la Independencia"],
    [iso(anio, 8, 7), "Batalla de Boyacá"],
    [alLunesSiguiente(iso(anio, 8, 15)), "La Asunción de la Virgen"],
    [alLunesSiguiente(iso(anio, 10, 12)), "Día de la Raza"],
    [alLunesSiguiente(iso(anio, 11, 1)), "Día de Todos los Santos"],
    [alLunesSiguiente(iso(anio, 11, 11)), "Independencia de Cartagena"],
    [iso(anio, 12, 8), "Día de la Inmaculada Concepción"],
    [iso(anio, 12, 25), "Navidad"],
  ];
  return lista.map(([fecha, nombre]) => ({ fecha, nombre })).sort((x, y) => (x.fecha < y.fecha ? -1 : 1));
}
