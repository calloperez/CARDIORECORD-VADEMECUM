/* Motor de sugerencias — reglas explícitas y transparentes.
   Cada regla devuelve: tipo (iniciar | titular | mantener | revisar | evitar | info | urgente),
   título, detalle, fármacos vinculados y fuentes. Nada aquí es una prescripción: es apoyo a la decisión. */

const ENG = (() => {

  const R = (tipo, t, d, drugs = [], src = [], j = "") => ({ tipo, t, d, drugs, src, j });
  const num = v => (v === "" || v == null || isNaN(+v)) ? null : +v;

  // ───────── Función renal
  function ckdepi(cr, edad, sexo) {
    if (!cr || !edad || !sexo) return null;
    const f = sexo === "F";
    const k = f ? 0.7 : 0.9, a = f ? -0.241 : -0.302;
    const r = cr / k;
    return Math.round(142 * Math.pow(Math.min(r, 1), a) * Math.pow(Math.max(r, 1), -1.2) * Math.pow(0.9938, edad) * (f ? 1.012 : 1));
  }
  function cockcroft(cr, edad, peso, sexo) {
    if (!cr || !edad || !peso || !sexo) return null;
    return Math.round(((140 - edad) * peso) / (72 * cr) * (sexo === "F" ? 0.85 : 1));
  }
  function imc(peso, talla) {
    if (!peso || !talla) return null;
    const m = talla > 3 ? talla / 100 : talla;
    return Math.round(peso / (m * m) * 10) / 10;
  }
  function derive(p) {
    const edad = num(p.edad), peso = num(p.peso), cr = num(p.cr);
    return {
      edad, peso, cr, sexo: p.sexo,
      tfg: ckdepi(cr, edad, p.sexo),
      clcr: cockcroft(cr, edad, peso, p.sexo),
      imc: imc(peso, num(p.talla)),
      emb: p.sexo === "F" && !!p.emb
    };
  }

  // ───────── Scores FA
  function cha2ds2va(p, s) {
    const e = num(p.edad) || 0;
    let sc = 0; const det = [];
    if (p.ic) { sc++; det.push("IC +1"); }
    if (p.hta) { sc++; det.push("HTA +1"); }
    if (e >= 75) { sc += 2; det.push("Edad ≥75 +2"); } else if (e >= 65) { sc++; det.push("Edad 65–74 +1"); }
    if (p.dm) { sc++; det.push("DM +1"); }
    if (s.acv) { sc += 2; det.push("ACV/AIT/embolia +2"); }
    if (p.ecv) { sc++; det.push("Enf. vascular +1"); }
    return { sc, det };
  }
  function hasbled(p, s, d) {
    let sc = 0; const det = [];
    if (s.htaNoCtrl) { sc++; det.push("HTA no controlada (PAS >160)"); }
    if ((d.tfg != null && d.tfg < 30) || s.renalAlt) { sc++; det.push("Función renal alterada"); }
    if (s.hepat) { sc++; det.push("Hepatopatía"); }
    if (s.acv) { sc++; det.push("ACV previo"); }
    if (s.sangrado) { sc++; det.push("Sangrado previo o predisposición"); }
    if (s.inrLabil) { sc++; det.push("INR lábil"); }
    if ((d.edad || 0) > 65) { sc++; det.push("Edad >65"); }
    if (s.farmacos) { sc++; det.push("Antiagregantes/AINE"); }
    if (s.alcohol) { sc++; det.push("Alcohol ≥8 tragos/semana"); }
    return { sc, det };
  }

  // ═════════════════════ INSUFICIENCIA CARDÍACA (ESC 2026)
  function ic(p, s) {
    const d = derive(p), out = [];
    const fevi = num(s.fevi), pas = num(s.pas), fc = num(s.fc), k = num(s.k);
    if (fevi == null) return { res: "Ingresá la FEVI.", items: [] };
    const tfg = d.tfg;
    const fer = fevi < 50;
    const fenotipo = fer ? `IC con FEVI reducida (FEVI ${fevi}% <50%)` : `IC con FEVI preservada (FEVI ${fevi}% ≥50%)`;
    const kAlto = k != null && k > 5.0;
    const hipoT = pas != null && pas < 100;

    if (pas != null && pas < 90) out.push(R("urgente", "Hipotensión (PAS <90 mmHg)", "Evaluar hipoperfusión o shock. No iniciar ni titular vasodilatadores ni betabloqueantes hasta estabilizar.", [], ["ESC_IC26"]));
    if (k != null && k > 5.5) out.push(R("urgente", `Hiperpotasemia (K⁺ ${k})`, "No iniciar ARM ni subir IECA/ARA/ARNI. Revisar suplementos de K⁺, AINE y dieta; si K⁺ >6,0 suspender el ARM.", ["espironolactona"], ["ESC_IC26"]));
    if (d.emb) out.push(R("evitar", "Embarazo", "IECA, ARA-II, ARNI, ARM, iSGLT2 e ivabradina están contraindicados. Opciones: betabloqueante cardioselectivo, hidralazina + nitrato y diurético si hay congestión. Manejo conjunto con obstetricia.", ["bisoprolol", "hidralazina", "furosemida"], ["ESC_IC26"]));

    if (s.congestion) out.push(R(s.diur ? "titular" : "iniciar", s.diur ? "Congestión: ajustar diurético de asa" : "Congestión: iniciar diurético de asa",
      "Dosis mínima que logre la euvolemia; en la descompensación, guiar la respuesta por el sodio urinario (ESC 2026). Peso diario, K⁺ y Cr.", ["furosemida"], ["ESC_IC26"],
      "Paciente con signos de congestión; se indica diurético de asa para alcanzar la euvolemia, con ajuste según la respuesta clínica y el peso."));

    // iSGLT2 — clase I en todo el espectro
    if (!d.emb) {
      if (s.isglt2) out.push(R("mantener", "iSGLT2 en curso", "Mantener a dosis fija. Un descenso inicial de la TFG es esperable y no obliga a suspender.", ["dapagliflozina", "empagliflozina"], ["ESC_IC26"]));
      else if (tfg != null && tfg < 20) out.push(R("evitar", "iSGLT2: TFG <20", "No iniciar con TFG <20 mL/min/1,73 m².", [], ["ESC_IC26"]));
      else out.push(R("iniciar", "iSGLT2 — terapia médica fundamental", `Clase I en todo el espectro de FEVI (ESC 2026). Dapagliflozina 10 mg/d o empagliflozina 10 mg/d, sin titulación.${tfg != null && tfg < 25 ? " Con TFG 20–24: empagliflozina." : ""} Puede iniciarse durante la internación una vez estabilizado.`,
        ["dapagliflozina", "empagliflozina"], ["ESC_IC26"],
        `Los inhibidores de SGLT2 forman parte de la terapia médica fundamental de la insuficiencia cardíaca, con recomendación clase I independientemente de la FEVI (ESC 2026), por su reducción de la muerte cardiovascular y del empeoramiento de la IC.`));
    }

    // ARM — clase I independiente de FEVI
    if (!d.emb) {
      if (s.arm) out.push(R("mantener", "ARM en curso", "Controlar K⁺ y Cr. Ginecomastia con espironolactona → eplerenona o finerenona.", ["espironolactona", "eplerenona", "finerenona"], ["ESC_IC26"]));
      else if (kAlto || (tfg != null && tfg < 25)) out.push(R("evitar", "ARM no indicado ahora", `${kAlto ? "K⁺ >5,0" : "TFG <25"}: no iniciar.`, [], ["ESC_IC26"]));
      else {
        const opts = fer ? ["espironolactona", "eplerenona"] : ["finerenona", "espironolactona"];
        out.push(R("iniciar", "ARM — terapia médica fundamental",
          fer ? `Clase I en IC sintomática (ESC 2026). Espironolactona 25 mg/d${tfg != null && tfg < 50 ? " (TFG 30–49: 25 mg día por medio para empezar)" : ""} o eplerenona 25 mg/d. K⁺ a la semana y al mes.`
              : `Clase I en IC sintomática independientemente de la FEVI (ESC 2026). En FEVI preservada, finerenona es el ARM de elección (ACC 2026): ${tfg != null && tfg <= 60 ? "10 mg/d" : "20 mg/d"}. Si no hay acceso: espironolactona 25 mg/d.`,
          opts, fer ? ["ESC_IC26"] : ["ESC_IC26", "ACC_FEP26"],
          `Los antagonistas mineralocorticoides tienen recomendación clase I en la insuficiencia cardíaca sintomática independientemente de la FEVI (ESC 2026)${fer ? "" : "; en FEVI preservada la finerenona es el ARM de elección según la vía de decisión ACC 2026 (FINEARTS-HF)"}. K⁺ ${k ?? "no informado"} y TFG ${tfg ?? "no informada"} permiten su inicio.`));
      }
    }

    if (fer && !d.emb) {
      const renalMala = tfg != null && tfg < 30;
      // SRAA
      if (s.ras === "arni") out.push(R("titular", "ARNI en curso: titular a la dosis objetivo", hipoT ? "PAS <100: no subir; revisar diuréticos y otros hipotensores." : "Subir cada 1–2 semanas (ESC 2026) hasta 97/103 mg c/12 h si la PA, el K⁺ y la Cr lo permiten.", ["sacval"], ["ESC_IC26"],
        "Paciente en tratamiento con sacubitril/valsartán; se titula hacia la dosis objetivo según la tolerancia hemodinámica y de laboratorio."));
      else if (hipoT) out.push(R("revisar", "SRAA con PAS <100", s.ras === "ninguno" ? "Iniciar a dosis muy baja solo si no hay hipoperfusión, o diferir hasta mejorar la PA." : "Mantener sin subir; no pasar a ARNI mientras la PAS sea <100.", ["enalapril", "losartan"], ["ESC_IC26"]));
      else if (kAlto || renalMala) out.push(R("revisar", "SRAA con K⁺ >5,0 o TFG <30", "Dosis bajas con control de K⁺/Cr a la semana. Si se elige ARNI: 24/26 mg c/12 h. Considerar nefrología.", ["sacval", "enalapril"], ["ESC_IC26"]));
      else {
        const desde = s.ras === "ieca" ? "Cambiar IECA → ARNI (suspender el IECA 36 h antes)." : s.ras === "ara" ? "Cambiar ARA-II → ARNI (sin lavado)." : "Iniciar ARNI; si no hay acceso, IECA (o ARA-II ante intolerancia).";
        out.push(R("iniciar", s.ras === "ninguno" ? "Inhibición del SRAA — terapia médica fundamental" : "Optimizar a ARNI",
          `${desde} Sacubitril/valsartán 49/51 mg c/12 h (24/26 si PAS 100–110, TFG <30 o ≥75 años) → 97/103 mg c/12 h.`,
          ["sacval", "enalapril", "losartan", "valsartan"], ["ESC_IC26", "AHA_IC22"],
          `La inhibición del sistema renina-angiotensina (IECA, ARA-II o ARNI) forma parte de la terapia médica fundamental de la IC con FEVI reducida (ESC 2026); el sacubitril/valsartán es superior a enalapril en la reducción de muerte CV y hospitalización por IC (PARADIGM-HF) y es de elección para AHA/ACC.`));
      }
      // Betabloqueante
      const bradi = fc != null && fc < 60;
      if (p.asma) out.push(R("revisar", "Betabloqueante con asma", "Evitar carvedilol. Si el asma está controlada: bisoprolol a dosis baja con vigilancia.", ["bisoprolol"], ["ESC_IC26"]));
      if (s.bb === "objetivo") out.push(R("mantener", "Betabloqueante a dosis objetivo", "Mantener.", ["bisoprolol", "carvedilol", "metoprolol"], ["ESC_IC26"]));
      else if (bradi) out.push(R("revisar", "Betabloqueante: FC <60", "No subir. Revisar digoxina, amiodarona o diltiazem/verapamilo.", ["bisoprolol"], ["ESC_IC26"]));
      else if (s.congestion && s.bb === "no") out.push(R("revisar", "Betabloqueante: euvolemia primero", "Iniciar a dosis baja al lograr la euvolemia. Si ya lo recibía, no suspenderlo salvo shock.", ["bisoprolol", "carvedilol"], ["ESC_IC26"]));
      else out.push(R(s.bb === "baja" ? "titular" : "iniciar", s.bb === "baja" ? "Titular betabloqueante" : "Betabloqueante — terapia médica fundamental",
        `Bisoprolol 1,25 → 10 mg/d, carvedilol 3,125 → 25 mg c/12 h o metoprolol succinato 12,5 → 200 mg/d${(d.edad || 0) >= 70 ? "; nebivolol en ≥70 años" : ""}. Subir cada 1–2 semanas (ESC 2026), aunque mejoren los síntomas o la FEVI.${p.epoc ? " Con EPOC: bisoprolol." : ""}`,
        ["bisoprolol", "carvedilol", "metoprolol", "nebivolol"], ["ESC_IC26"],
        `Los betabloqueantes con evidencia (bisoprolol, carvedilol, metoprolol succinato) forman parte de la terapia médica fundamental de la IC con FEVI reducida (ESC 2026), con reducción de la mortalidad cercana al 35%. FC ${fc ?? "—"} lpm y PAS ${pas ?? "—"} mmHg permiten su ${s.bb === "baja" ? "titulación" : "inicio"}.`));

      // Terapia adicional
      if (s.ritmo === "sinusal" && fc != null && fc >= 70 && (s.bb === "objetivo" || p.asma))
        out.push(R("iniciar", "Terapia adicional: ivabradina", `Ritmo sinusal con FC ${fc} lpm pese a BB a dosis objetivo. 5 mg c/12 h${(d.edad || 0) >= 75 ? " (2,5 mg c/12 h si ≥75 años)" : ""}.`, ["ivabradina"], ["ESC_IC26"],
          `IC con FEVI reducida en ritmo sinusal con FC ${fc} lpm pese al betabloqueante a dosis máxima tolerada; la ivabradina reduce la muerte CV u hospitalización por IC (SHIFT) y es terapia médica adicional (ESC 2026).`));
      else if (s.ritmo === "sinusal" && fc != null && fc >= 70) out.push(R("info", "FC ≥70 en ritmo sinusal", "Primero el betabloqueante a la dosis máxima tolerada; si persiste ≥70: ivabradina.", ["ivabradina"], ["ESC_IC26"]));
      if (s.empeora) out.push(R("iniciar", "Terapia adicional: vericiguat", "Empeoramiento reciente (internación o diurético IV) pese a la terapia fundamental. 2,5 mg/d → 10 mg/d.", ["vericiguat"], ["ESC_IC26"],
        "IC con FEVI reducida y un episodio reciente de empeoramiento pese a la terapia médica fundamental; el vericiguat reduce la muerte CV u hospitalización por IC (VICTORIA)."));
      if (s.nyha >= "3" || s.ritmo === "fa") out.push(R("info", "Terapia adicional: digoxina", "Clase IIa en IC FEr sintomática pese a la terapia fundamental (ESC 2026), o para el control de FC en FA. Nivel meta 0,5–0,9 ng/mL.", ["digoxina"], ["ESC_IC26"],
        "Paciente sintomático pese a la terapia médica fundamental; la digoxina tiene recomendación IIa (ESC 2026) para reducir hospitalizaciones."));
      if (p.afro) out.push(R("info", "Afrodescendiente", "En NYHA III–IV pese a tratamiento óptimo: hidralazina + dinitrato de isosorbide (A-HeFT).", ["hidralazina"], ["AHA_IC22"]));
      if (s.ritmo === "fa") out.push(R("info", "FA asociada", "Control de FC con betabloqueante ± digoxina; evitar diltiazem/verapamilo con FEVI reducida. Anticoagulación: módulo FA.", ["digoxina"], ["ESC_FA24"]));
    }

    if (!fer && !d.emb) {
      if (d.imc != null && d.imc >= 30) out.push(R("iniciar", "IC FEp + obesidad: semaglutida o tirzepatida", `IMC ${d.imc}: clase IIa (ESC 2026), con o sin DM, para bajar de peso y mejorar los síntomas y la capacidad de ejercicio.`, ["semaglutida", "tirzepatida"], ["ESC_IC26", "ADA26"],
        `IC con FEVI preservada y obesidad (IMC ${d.imc} kg/m²); la semaglutida o la tirzepatida tienen recomendación IIa (ESC 2026) para mejorar los síntomas, la calidad de vida y la capacidad funcional (STEP-HFpEF, SUMMIT).`));
      out.push(R("info", "FEVI preservada: comorbilidades", "Tratar la HTA (PAS <130), la FA, la obesidad y la isquemia. Buscar causas específicas: amiloidosis TTR, MCH.", [], ["ESC_IC26"]));
    }
    if (pas != null && pas >= 130) out.push(R("info", "Meta de PA", "ESC 2026: PAS <130 mmHg en HTA o IC estadio B en adelante.", [], ["ESC_IC26"]));

    // Hierro — ESC 2026: TSAT <20%
    const ferr = num(s.ferritina), tsat = num(s.tsat);
    if (tsat != null && tsat < 20) out.push(R("iniciar", "Déficit de hierro (TSAT <20%)", `TSAT ${tsat}%${ferr != null ? `, ferritina ${ferr}` : ""}: hierro IV (carboximaltosa o derisomaltosa). ESC 2026 adopta la TSAT <20% como definición. Buscar sangrado digestivo.`, [], ["ESC_IC26"]));
    else if (tsat == null) out.push(R("info", "Perfil de hierro", "Pedir ferritina y saturación de transferrina (TSAT <20% define el déficit, ESC 2026).", [], ["ESC_IC26"]));
    if (p.dm) out.push(R("evitar", "DM2 + IC", "Evitar pioglitazona y saxagliptina.", ["pioglitazona"], ["ADA26"]));

    return { res: `${fenotipo}${tfg != null ? ` · TFG ${tfg}` : ""}${k != null ? ` · K⁺ ${k}` : ""}${pas != null ? ` · PAS ${pas}` : ""}`, items: out };
  }

  // ═════════════════════ HIPERTENSIÓN (ESC 2024 · AHA/ACC 2025 · GPC Colombia 2025)
  function hta(p, s) {
    const d = derive(p), out = [];
    const pas = num(s.pas), pad = num(s.pad);
    if (pas == null) return { res: "Ingresá la PA.", items: [] };
    const cat = (pas >= 140 || (pad || 0) >= 90) ? "HTA (≥140/90)" : (pas >= 130 || (pad || 0) >= 80) ? "HTA estadio 1 AHA (130–139/80–89)" : (pas >= 120) ? "PA elevada (120–129)" : "PA normal";
    const altoRiesgo = p.ecv || p.dm || p.ic || (d.tfg != null && d.tfg < 60) || s.albu;
    const fragil = p.fragil || (d.edad || 0) >= 85 || s.ortost;
    const meta = d.emb ? "<140/90 (embarazo)" : fragil ? "La más baja razonablemente alcanzable sin hipotensión ortostática" : "<130/80 (AHA 2025); PAS 120–129 si se tolera (ESC 2024)";
    const nm = +s.nmeds || 0;
    const ctx = `PA ${pas}/${pad ?? "—"} mmHg${altoRiesgo ? ", con riesgo CV alto" : ""}`;

    if (!s.confirmada && pas >= 130) out.push(R("revisar", "Confirmar el diagnóstico", "Confirmar con MAPA o AMPA antes de iniciar o escalar (bata blanca).", [], ["ESC_HTA24", "AHA_HTA25"]));
    if (pas >= 180 || (pad || 0) >= 110) out.push(R("urgente", "PA ≥180/110", "Buscar daño agudo de órgano blanco; si existe: emergencia hipertensiva, manejo hospitalario.", [], ["ESC_HTA24"]));
    if (s.adh === "mala" || s.adh === "dudosa") out.push(R("revisar", "Adherencia", "Antes de agregar fármacos: una toma diaria y combinaciones en una sola píldora; revisar costo y efectos adversos.", [], ["AHA_HTA25"]));
    out.push(R("info", "Estudio basal", "Relación albúmina/creatinina en orina (estándar en AHA 2025), Cr, K⁺, Na⁺, glucemia, perfil lipídico, TSH y ECG.", [], ["AHA_HTA25"]));

    if (d.emb) {
      out.push(R("evitar", "Embarazo: contraindicados", "IECA, ARA-II, ARNI y espironolactona.", [], ["ESC_HTA24"]));
      out.push(R("iniciar", "Embarazo: opciones", "Nifedipino LP, metildopa o labetalol; tratar si ≥140/90.", ["nifedipino", "metildopa", "hidralazina"], ["ESC_HTA24", "AHA_HTA25"],
        `Gestante con ${ctx}; se indica un antihipertensivo con seguridad fetal demostrada, según ESC 2024 y AHA/ACC 2025.`));
      return { res: `${cat} · Meta ${meta}`, items: out };
    }
    if (cat === "PA normal") { out.push(R("info", "Sin indicación farmacológica", "Estilo de vida y control anual.", [], ["AHA_HTA25"])); return { res: cat, items: out }; }
    if ((pas < 140 && (pad || 0) < 90) && nm === 0) {
      const tratar = pas >= 130 && altoRiesgo;
      out.push(R(tratar ? "iniciar" : "info", tratar ? "130–139/80–89 con riesgo CV alto: tratar" : "Estilo de vida",
        tratar ? "Si persiste tras 3 meses de estilo de vida: iniciar fármacos (GPC Colombia 2025: riesgo moderado-alto). Con DM/ERC/albuminuria: IECA o ARA-II." : "Sodio <2 g/d, DASH, actividad física, peso, alcohol. Reevaluar en 3–6 meses; estimar el riesgo (PREVENT en AHA 2025).",
        tratar ? ["losartan", "enalapril"] : [], ["AHA_HTA25", "COL_HTA25"],
        tratar ? `Paciente con ${ctx} y riesgo cardiovascular alto; las guías AHA/ACC 2025 y la GPC colombiana 2025 recomiendan tratamiento farmacológico asociado al estilo de vida en este escenario.` : ""));
      return { res: `${cat} · Meta ${meta}`, items: out };
    }

    const avoidThz = p.gota;
    const combos = avoidThz ? "ARA-II + calcioantagonista dihidropiridínico" : p.afro ? "ARA-II + calcioantagonista o ARA-II + diurético tipo tiazida" : "ARA-II + calcioantagonista, ARA-II + diurético tipo tiazida o IECA + diurético tipo tiazida";
    const jDoble = `Paciente con ${ctx}. La GPC colombiana de HTA (Minsalud 2025), la ESC 2024 y la AHA/ACC 2025 recomiendan iniciar con una combinación de dos fármacos de primera línea a dosis bajas, preferentemente en una sola píldora, por su mayor eficacia y adherencia.`;
    if (nm === 0) {
      if (fragil) out.push(R("iniciar", "Monoterapia a dosis baja", "Fragilidad, ≥85 años o hipotensión ortostática (GPC Colombia 2025): amlodipino 2,5–5 mg o ARA-II a dosis baja; subir lentamente.", ["amlodipino", "losartan"], ["COL_HTA25", "ESC_HTA24"],
        `Paciente frágil o con riesgo de caídas y ${ctx}; la GPC colombiana 2025 sugiere iniciar con monoterapia a dosis baja.`));
      else out.push(R("iniciar", "Combinación doble en una sola píldora", `${combos}, a dosis bajas.${avoidThz ? " Con gota: evitar la tiazida; losartán es uricosúrico." : ""}`,
        ["losartan", "valsartan", "enalapril", "amlodipino", "clortalidona", "indapamida", "hctz"], ["COL_HTA25", "ESC_HTA24", "AHA_HTA25"], jDoble));
    } else if (nm === 1) out.push(R("titular", "Pasar a combinación doble", `${combos}, en una sola píldora.`, ["losartan", "amlodipino", "clortalidona", "hctz"], ["COL_HTA25", "ESC_HTA24"], jDoble));
    else if (nm === 2) out.push(R("titular", "Combinación triple", `IECA/ARA-II + calcioantagonista + ${avoidThz ? "(gota: optimizar dosis o pasar a espironolactona)" : "diurético tipo tiazida"}, idealmente en una sola píldora.`, ["losartan", "amlodipino", "clortalidona", "indapamida"], ["ESC_HTA24", "AHA_HTA25"],
      `HTA no controlada (${ctx}) con dos fármacos; se escala a triple terapia IECA/ARA-II + calcioantagonista + diurético tipo tiazida según ESC 2024 y AHA/ACC 2025.`));
    else {
      out.push(R("revisar", "HTA resistente", "Confirmar con MAPA y descartar mala adherencia, AINE, alcohol y SAHOS. Buscar hiperaldosteronismo primario (aldosterona/renina) en todos, independientemente del K⁺ (AHA 2025).", [], ["AHA_HTA25", "ESC_HTA24"]));
      if (s.clases?.esp) out.push(R("info", "Ya recibe espironolactona", "Siguientes opciones: bisoprolol, doxazosina, eplerenona o derivar (denervación renal).", ["bisoprolol"], ["ESC_HTA24"]));
      else if ((d.tfg == null || d.tfg >= 30) && (num(s.k) == null || num(s.k) <= 4.5))
        out.push(R("iniciar", "Agregar espironolactona", "25 mg/d. K⁺ y Cr al mes.", ["espironolactona"], ["ESC_HTA24", "AHA_HTA25"],
          `HTA resistente (${ctx} con tres o más fármacos incluido un diurético); la espironolactona es el cuarto fármaco de elección (PATHWAY-2) según ESC 2024 y AHA/ACC 2025. TFG ${d.tfg ?? "—"} y K⁺ ${s.k || "—"} permiten su uso.`));
      else out.push(R("evitar", "Espironolactona no indicada", "TFG <30 o K⁺ >4,5: bisoprolol, doxazosina o diurético de asa si TFG <30.", ["furosemida", "bisoprolol"], ["ESC_HTA24"]));
    }
    if (p.dm || s.albu || (d.tfg != null && d.tfg < 60)) out.push(R("info", "DM / ERC / albuminuria", "IECA o ARA-II obligatorio, nunca ambos (GPC Colombia 2025). Con DM2 o ERC: iSGLT2; con DM2 y albuminuria persistente: finerenona.", ["losartan", "enalapril", "dapagliflozina", "finerenona"], ["COL_HTA25", "ADA26"]));
    if (d.imc != null && d.imc >= 30) out.push(R("info", "Obesidad", `IMC ${d.imc}: AHA 2025 contempla arGLP-1 en HTA con sobrepeso u obesidad.`, ["semaglutida", "tirzepatida"], ["AHA_HTA25"]));
    if (p.ecv) out.push(R("info", "Cardiopatía isquémica", "Betabloqueante si hay angina o IAM previo, más IECA/ARA-II.", ["bisoprolol"], ["ESC_HTA24"]));
    if (p.ic) out.push(R("info", "Insuficiencia cardíaca", "Usar el módulo IC: la terapia fundamental reemplaza el algoritmo de HTA.", [], ["ESC_IC26"]));
    if (p.asma) out.push(R("evitar", "Asma", "Evitar betabloqueantes no selectivos.", ["propranolol", "carvedilol"], ["ESC_HTA24"]));
    if (avoidThz) out.push(R("evitar", "Gota", "Evitar las tiazidas.", ["hctz", "clortalidona"], ["ESC_HTA24"]));
    if (p.afro) out.push(R("info", "Afrodescendiente", "La base debe ser un calcioantagonista o una tiazida; preferir ARA-II sobre IECA (angioedema).", ["amlodipino", "losartan"], ["ESC_HTA24"]));
    return { res: `${cat} · Meta ${meta}${d.tfg != null ? ` · TFG ${d.tfg}` : ""}`, items: out };
  }

  // ═════════════════════ DIABETES TIPO 2 (ADA 2026 · ACE Colombia 2025)
  function dm(p, s) {
    const d = derive(p), out = [];
    const a1c = num(s.a1c), glu = num(s.glu), met = num(s.met) || 0, basal = num(s.basal) || 0;
    if (a1c == null) return { res: "Ingresá la HbA1c.", items: [] };
    const tfg = d.tfg;
    const meta = s.meta && s.meta !== "auto" ? +s.meta : ((d.edad || 0) >= 75 || p.fragil || s.hipos ? 8 : 7);
    const gap = Math.round((a1c - meta) * 10) / 10;
    const enMeta = gap <= 0;
    const ercDM = (tfg != null && tfg < 60) || s.albu;
    const sobrepeso = d.imc != null && d.imc >= 27;
    const adhOK = s.adh === "buena" || !s.adh;
    const severa = a1c >= 10 || (glu != null && glu >= 300) || s.catab;
    const nOral = (met > 0) + !!s.su + !!s.dpp4 + !!s.isglt2;
    const ctx = `HbA1c ${a1c}% (meta <${meta}%${enMeta ? "" : `, ${gap} puntos por encima`})${d.imc ? `, IMC ${d.imc} kg/m²` : ""}${tfg != null ? `, TFG ${tfg}` : ""}`;

    if (d.emb) out.push(R("urgente", "Embarazo", "Insulina de elección. Suspender arGLP-1, iSGLT2, iDPP-4 y SU. Manejo con endocrinología y obstetricia.", ["nph", "glargina"], ["ADA26"]));

    if (severa && !d.emb) {
      const deficit = s.catab || (d.imc != null && d.imc < 27);
      out.push(R("urgente", "Hiperglucemia severa", `${deficit ? "Signos de déficit de insulina (catabolismo o IMC <27): insulina basal de inicio, 0,2 U/kg/d (ACE 2025)." : "HbA1c ≥10% o glucemia ≥300: considerar insulina basal o arGLP-1 (o la combinación fija) de inicio."} Titular cada 3 días hasta ayunas 70–130 mg/dL.`,
        ["glargina", "nph", "semaglutida"], ["COL_DM25", "ADA26"],
        `Paciente con DM2 e hiperglucemia severa (${ctx}${s.catab ? ", con síntomas catabólicos" : ""}); según la ACE 2025 y la ADA 2026 se indica insulinización basal para revertir la glucotoxicidad, con titulación cada 3 días hasta ayunas de 70–130 mg/dL.`));
      if (s.catab && (d.imc != null && d.imc < 25 || (d.edad || 99) < 40)) out.push(R("revisar", "¿DM1 o LADA?", "Pedir anti-GAD y péptido C.", [], ["ADA26"]));
    }

    if (!adhOK) {
      const b = s.barr || {}, sug = [];
      if (b.gi) sug.push("efectos GI → metformina XR con las comidas, titulación lenta");
      if (b.costo) sug.push("costo → priorizar lo cubierto por el PBS");
      if (b.complej) sug.push("complejidad → combinaciones fijas o arGLP-1 semanal (ACE 2025)");
      if (b.hipo) sug.push("miedo a la hipoglucemia → retirar la SU");
      if (b.creencias) sug.push("creencias → educación diabetológica");
      out.push(R("revisar", "Primero: la adherencia", `Con adherencia ${s.adh}, una HbA1c alta puede no ser fracaso terapéutico. ${sug.length ? sug.join("; ") + "." : "Indagar barreras: efectos adversos, costo, complejidad, creencias."} Sin hiperglucemia severa: corregir y repetir la HbA1c en 3 meses antes de intensificar.`, ["metformina"], ["ADA26", "COL_DM25"]));
    }

    // Cardiorrenal — independiente de la HbA1c (ACE 2025, ADA 2026)
    if (!d.emb) {
      const jCR = cond => `Paciente con DM2 y ${cond}; la ADA 2026 y la guía colombiana ACE 2025 recomiendan priorizar fármacos con beneficio cardiorrenal demostrado independientemente del control glucémico (${ctx}).`;
      if (p.ic && !s.isglt2) out.push(R("iniciar", "IC → iSGLT2", tfg != null && tfg < 20 ? "TFG <20: no iniciar." : "Empagliflozina o dapagliflozina 10 mg/d, independientemente de la HbA1c.", ["empagliflozina", "dapagliflozina"], ["ADA26", "ESC_IC26"], jCR("insuficiencia cardíaca")));
      if (p.ic) out.push(R("evitar", "Con IC evitar", "Pioglitazona y saxagliptina.", ["pioglitazona"], ["ADA26"]));
      if (ercDM) {
        if (!s.isglt2 && !(tfg != null && tfg < 20)) out.push(R("iniciar", "ERC → iSGLT2", `TFG ${tfg ?? "—"}${s.albu ? " con albuminuria" : ""}: iSGLT2 con beneficio renal; se mantiene la nefroprotección aunque baje su efecto glucémico.`, ["dapagliflozina", "empagliflozina"], ["ADA26", "COL_DM25"], jCR("enfermedad renal crónica")));
        if (s.albu) out.push(R("iniciar", "Albuminuria persistente pese a IECA/ARA-II → finerenona", "Recomendación condicional ACE 2025 (FIDELIO/FIGARO). TFG ≥25 y K⁺ ≤5,0.", ["finerenona"], ["COL_DM25", "ADA26"], jCR("enfermedad renal con albuminuria persistente pese a IECA/ARA-II")));
        if (!s.glp1) out.push(R("info", "ERC: arGLP-1", "Semaglutida con beneficio renal (FLOW).", ["semaglutida"], ["ADA26"]));
      }
      if (p.ecv && !s.glp1) out.push(R("iniciar", "ECV → arGLP-1 con beneficio CV", "Independiente de la HbA1c. Semaglutida SC u oral, dulaglutida, liraglutida o tirzepatida (con datos CV en ADA 2026). Alternativa: iSGLT2.", ["semaglutida", "dulaglutida", "liraglutida", "tirzepatida", "empagliflozina"], ["ADA26", "COL_DM25"], jCR("enfermedad cardiovascular aterosclerótica establecida")));
    }

    // Metformina
    if (!d.emb) {
      if (met > 0 && tfg != null && tfg < 30) out.push(R("evitar", "Suspender metformina", "TFG <30.", ["metformina"], ["ADA26"]));
      else if (met > 1000 && tfg != null && tfg < 45) out.push(R("titular", "Reducir metformina", `TFG ${tfg}: máximo 1.000 mg/d.`, ["metformina"], ["ADA26"]));
      else if (met === 0 && !(tfg != null && tfg < 45) && !severa) {
        if (gap > 1) out.push(R("iniciar", "Terapia combinada de inicio", `HbA1c >1 punto sobre la meta: metformina + iSGLT2 (o iDPP-4) desde el diagnóstico (ACE 2025). No usar combinaciones con SU.${sobrepeso ? " Con IMC ≥27, un arGLP-1 es alternativa." : ""}`,
          ["metformina", "empagliflozina", "dapagliflozina", "sitagliptina", "linagliptina"], ["COL_DM25", "ADA26"],
          `DM2 con ${ctx}; la guía colombiana ACE 2025 recomienda iniciar con metformina asociada a un iSGLT2 o un iDPP-4 cuando la HbA1c supera en más de 1 punto la meta individual.`));
        else out.push(R("iniciar", "Iniciar metformina", "500 mg con la cena → subir 500 mg/semana hasta 2.000 mg/d; XR si hay intolerancia.", ["metformina"], ["ADA26", "COL_DM25"],
          `DM2 con ${ctx}; la metformina es el tratamiento farmacológico de inicio por su eficacia, seguridad y bajo costo (ADA 2026, ACE 2025).`));
      } else if (met > 0 && met < 2000 && !enMeta && adhOK && (tfg == null || tfg >= 45)) out.push(R("titular", "Optimizar metformina", `${met} mg/d → hasta 2.000 mg/d si se tolera.`, ["metformina"], ["ADA26"]));
    }

    // Intensificación (adherencia buena)
    if (!d.emb && !enMeta && adhOK && !severa && (met > 0 || nOral > 0 || basal > 0)) {
      if (basal > 0) {
        const ukg = d.peso ? Math.round(basal / d.peso * 100) / 100 : null;
        if (glu != null && glu > 130 && !(ukg && ukg > 0.5)) out.push(R("titular", "Titular insulina basal", `Ayunas ${glu}: subir cada 3 días (2 U, o 4 U si >180) hasta 70–130 mg/dL; bajar 10–20% si <70 (ACE 2025).`, ["glargina", "nph"], ["COL_DM25"],
          `DM2 en insulinoterapia basal con glucemia de ayunas ${glu} mg/dL por encima de la meta; se titula la insulina basal según el algoritmo de la ACE 2025.`));
        else out.push(R("iniciar", ukg && ukg > 0.5 ? `Sobrebasalización (${ukg} U/kg/d): agregar arGLP-1` : "Ayunas en meta, HbA1c alta: agregar arGLP-1",
          s.glp1 ? "Ya con arGLP-1: agregar insulina prandial en la comida principal (4 U o 10% de la basal)." : "arGLP-1 + insulina (o combinación fija basal/arGLP-1) antes de un esquema basal-bolo (ACE 2025, recomendación fuerte).",
          s.glp1 ? ["prandial"] : ["semaglutida", "dulaglutida", "liraglutida", "tirzepatida"], ["COL_DM25", "ADA26"],
          `DM2 no controlada con insulina basal (${ctx}); la guía colombiana ACE 2025 recomienda asociar un arGLP-1 antes de pasar a un esquema basal-bolo, por menor hipoglucemia y aumento de peso.`));
      } else if (nOral >= 2 && !s.glp1) {
        out.push(R("iniciar", "Falla de ≥2 orales → arGLP-1", `Escalón preferido, sobre todo con IMC ≥27 (ACE 2025, fuerte).${s.dpp4 ? " Suspender el iDPP-4." : ""}`, ["semaglutida", "dulaglutida", "tirzepatida", "liraglutida"], ["COL_DM25", "ADA26"],
          `DM2 no controlada con dos o más antidiabéticos orales (${ctx}); la guía colombiana ACE 2025 recomienda intensificar con un agonista del receptor de GLP-1 como paso preferido.`));
      } else if (s.glp1 && nOral >= 1) {
        out.push(R("iniciar", "Ya con arGLP-1 → insulina basal", "0,2 U/kg/d, titulando cada 3 días (o una combinación fija con el arGLP-1).", ["glargina", "nph"], ["COL_DM25"],
          `DM2 no controlada pese a orales y arGLP-1 (${ctx}); se inicia insulina basal según la ACE 2025.`));
      } else {
        out.push(R("iniciar", "Metformina insuficiente → agregar iSGLT2 o arGLP-1", `Ambos con recomendación fuerte (ACE 2025). ${sobrepeso ? `IMC ${d.imc}: favorece el arGLP-1/tirzepatida.` : "Sin obesidad: iSGLT2 es una opción oral."} iDPP-4 como alternativa si los anteriores no son adecuados.`,
          sobrepeso ? ["semaglutida", "tirzepatida", "dulaglutida", "empagliflozina", "dapagliflozina", "sitagliptina"] : ["empagliflozina", "dapagliflozina", "semaglutida", "dulaglutida", "sitagliptina", "linagliptina"], ["COL_DM25", "ADA26"],
          `DM2 no controlada con metformina (${ctx}); la guía colombiana ACE 2025 recomienda agregar un iSGLT2 o un arGLP-1 (recomendación fuerte), favoreciendo el arGLP-1 con sobrepeso u obesidad.`));
      }
    }
    if (enMeta) out.push(R("mantener", "HbA1c en meta", "Mantener el esquema; HbA1c cada 6 meses. Igual revisar la indicación cardiorrenal.", [], ["ADA26"]));
    if (s.su) out.push(R("evitar", "Sulfonilurea", "La ACE 2025 desaconseja las combinaciones con SU (hipoglucemia y aumento de peso). Planificar su reemplazo por iSGLT2, arGLP-1 o iDPP-4.", ["glibenclamida", "glimepirida"], ["COL_DM25"]));
    if (s.dpp4 && s.glp1) out.push(R("evitar", "iDPP-4 + arGLP-1", "Sin beneficio adicional: suspender el iDPP-4.", ["sitagliptina"], ["ADA26"]));
    if (s.tiroides_mtc) out.push(R("evitar", "Antecedente de carcinoma medular / MEN2", "arGLP-1 y tirzepatida contraindicados.", ["semaglutida"], ["ADA26"]));
    out.push(R("info", "Seguimiento", "HbA1c cada 3 meses hasta la meta. Fondo de ojo, albuminuria, TFG y pie anuales. MCG cuando esté disponible (ADA 2026). Estatina según el riesgo.", [], ["ADA26"]));
    return { res: `HbA1c ${a1c}% · meta <${meta}% · ${enMeta ? "en meta" : `+${gap} sobre la meta`}${tfg != null ? ` · TFG ${tfg}` : ""}${d.imc ? ` · IMC ${d.imc}` : ""}`, items: out };
  }

  // ═════════════════════ HIPOTIROIDISMO
  const LT4_TABS = [25, 50, 75, 88, 100, 112, 125, 137, 150, 175, 200];
  const roundLT4 = x => LT4_TABS.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a);

  function hipo(p, s) {
    const d = derive(p), out = [];
    const tsh = num(s.tsh), lt4 = num(s.lt4) || 0, uln = num(s.uln) || 4.5;
    if (tsh == null) return { res: "Ingresá la TSH.", items: [] };
    const cardio = p.ecv || p.fa || p.ic;
    const mayor = (d.edad || 0) >= 60;

    if (s.amio) out.push(R("info", "Paciente con amiodarona", "El hipotiroidismo inducido por amiodarona se trata con levotiroxina sin suspender el antiarrítmico.", ["amiodarona", "levotiroxina"], ["ATA_HIPO14"]));

    if (lt4 === 0) {
      if (s.t4l === "baja" && tsh <= uln) {
        out.push(R("urgente", "Probable hipotiroidismo central", "T4L baja con TSH normal o baja: derivar a endocrinología, evaluar la hipófisis y descartar insuficiencia suprarrenal antes de iniciar levotiroxina. Monitorear con T4L, no con TSH.", [], ["ATA_HIPO14"]));
      } else if (s.t4l === "baja" && tsh > uln) {
        const full = d.peso ? roundLT4(1.6 * d.peso) : null;
        if (!mayor && !cardio) out.push(R("iniciar", "Hipotiroidismo primario manifiesto: dosis plena", `1,6 mcg/kg/d${full ? ` ≈ ${full} mcg/d (${d.peso} kg)` : ""}. Control de TSH a las 6–8 semanas.`, ["levotiroxina"], ["ATA_HIPO14"], `Hipotiroidismo primario manifiesto (TSH ${tsh} mU/L con T4 libre baja) en paciente menor de 60 años sin cardiopatía; se indica levotiroxina a dosis plena de reemplazo (1,6 mcg/kg/d) según la ATA 2014.`));
        else out.push(R("iniciar", "Hipotiroidismo manifiesto: dosis baja y progresiva", `${cardio ? "Cardiopatía" : "≥60 años"}: iniciar con ${p.ecv ? "12,5–25" : "25"} mcg/d y subir 12,5–25 mcg cada 4–6 semanas${full ? ` hasta ≈${full} mcg/d` : ""}. Vigilar angina o arritmias.`, ["levotiroxina"], ["ATA_HIPO14"], `Hipotiroidismo primario manifiesto (TSH ${tsh} mU/L con T4 libre baja) en paciente ${cardio ? "con cardiopatía" : "de 60 años o más"}; se inicia levotiroxina a dosis baja con titulación progresiva para evitar la isquemia o las arritmias (ATA 2014).`));
      } else if (tsh > uln) {
        // subclínico
        out.push(R("revisar", "Hipotiroidismo subclínico: confirmar", "Repetir TSH, T4L y anti-TPO en 6–12 semanas (puede ser transitorio o una fase de recuperación).", [], ["ATA_HIPO14"]));
        if (d.emb || s.planEmb) {
          out.push(R("iniciar", "Embarazo o búsqueda de embarazo", `Tratar si TSH > límite del trimestre (≈4,0) o >2,5 con anti-TPO positivos. Meta TSH <2,5. ${d.peso ? `Dosis aproximada 1,2 mcg/kg ≈ ${roundLT4(1.2 * d.peso)} mcg/d o 50 mcg/d.` : "25–50 mcg/d."}`, ["levotiroxina"], ["ATA_EMB17"]));
        } else if (tsh >= 10) {
          out.push(R("iniciar", "TSH ≥10: tratar", `Levotiroxina ${mayor || cardio ? "25 mcg/d" : "25–50 mcg/d (o 1 mcg/kg)"}, control a las 6–8 semanas.`, ["levotiroxina"], ["ATA_HIPO14"], `Hipotiroidismo subclínico con TSH ${tsh} mU/L (≥10); la ATA 2014 recomienda tratarlo por el mayor riesgo de progresión a hipotiroidismo manifiesto y de eventos cardiovasculares.`));
        } else if ((d.edad || 0) >= 70) {
          out.push(R("info", "≥70 años con TSH <10", "En general no tratar: una TSH de 6–7 puede ser normal para la edad. Controlar cada 6–12 meses.", [], ["ATA_HIPO14"]));
        } else {
          const motivos = [s.sint && "síntomas", s.tpo === "pos" && "anti-TPO positivos", p.dlp && "dislipidemia", p.ic && "IC", p.ecv && "ECV"].filter(Boolean);
          out.push(R(motivos.length ? "iniciar" : "info", "TSH entre el límite y 10", motivos.length ? `Considerar levotiroxina 25–50 mcg/d (${motivos.join(", ")}).` : "Sin motivos adicionales: observar y repetir en 6–12 meses.", ["levotiroxina"], ["ATA_HIPO14"]));
        }
      } else out.push(R("info", "TSH normal", "Sin indicación de levotiroxina.", [], ["ATA_HIPO14"]));
    } else {
      // en tratamiento
      const mcgkg = d.peso ? Math.round(lt4 / d.peso * 100) / 100 : null;
      if (d.emb) out.push(R("titular", "Embarazo en tratamiento", "Aumentar la dosis 20–30% (≈2 tabletas extra por semana) al confirmar el embarazo. TSH cada 4 semanas hasta la semana 20, meta <2,5.", ["levotiroxina"], ["ATA_EMB17"]));
      if (tsh > uln) {
        const chk = [];
        if (s.toma !== "correcta") chk.push("tomarla en ayunas, 30–60 min antes del desayuno, solo con agua");
        if (s.adh && s.adh !== "buena") chk.push("adherencia (si olvida dosis: acumular la semana en una toma semanal supervisada es una alternativa)");
        if (s.inter) chk.push("separar ≥4 h del calcio, hierro, IBP y antiácidos");
        out.push(R("revisar", "TSH alta en tratamiento: antes de subir", `Revisar: ${chk.length ? chk.join("; ") : "toma, adherencia e interacciones"}.${mcgkg && mcgkg > 1.9 ? ` Requiere ${mcgkg} mcg/kg: sospechar malabsorción (celiaquía, gastritis atrófica, H. pylori).` : ""}`, ["levotiroxina"], ["ATA_HIPO14"]));
        if (!d.emb) out.push(R("titular", "Subir levotiroxina", `De ${lt4} a ${roundLT4(lt4 + (tsh > 10 ? 25 : 12.5))} mcg/d${cardio || mayor ? " (subir de a 12,5 mcg por la cardiopatía o la edad)" : ""}. TSH a las 6–8 semanas.`, ["levotiroxina"], ["ATA_HIPO14"]));
      } else if (tsh < 0.1) {
        out.push(R("titular", "TSH suprimida: sobretratamiento", `Reducir a ${roundLT4(lt4 - 25)} mcg/d (salvo cáncer de tiroides con supresión indicada). Riesgo de FA y osteoporosis.`, ["levotiroxina"], ["ATA_HIPO14"]));
      } else if (tsh < 0.4) {
        out.push(R(mayor || cardio ? "titular" : "info", "TSH baja", mayor || cardio ? `Adulto mayor o cardiopatía: reducir a ${roundLT4(lt4 - 12.5)} mcg/d.` : "Considerar reducir 12,5 mcg si tiene síntomas.", ["levotiroxina"], ["ATA_HIPO14"]));
      } else out.push(R("mantener", "TSH en rango", `Mantener ${lt4} mcg/d. TSH cada 6–12 meses.${mayor ? " En ≥70 años se acepta una TSH de 4–6." : ""}`, ["levotiroxina"], ["ATA_HIPO14"]));
    }
    out.push(R("info", "Impacto cardiovascular", "El hipotiroidismo eleva el LDL (pedir TSH antes de tratar una dislipidemia), aumenta el riesgo de miopatía por estatinas y puede causar derrame pericárdico y bradicardia. La levotiroxina potencia el efecto de la warfarina.", ["atorvastatina", "warfarina"], ["ATA_HIPO14"]));
    return { res: `TSH ${tsh} mU/L${s.t4l ? ` · T4L ${s.t4l}` : ""}${lt4 ? ` · levotiroxina ${lt4} mcg/d` : " · sin tratamiento"}`, items: out };
  }

  // ═════════════════════ HIPERTIROIDISMO
  function hiper(p, s) {
    const d = derive(p), out = [];
    const tsh = num(s.tsh), x = num(s.t4lx), fc = num(s.fc);
    if (tsh == null) return { res: "Ingresá la TSH.", items: [] };
    const tri = d.emb ? (s.tri || "1") : null;
    const cardio = p.ecv || p.fa || p.ic;

    if (s.ae_fiebre) out.push(R("urgente", "Fiebre u odinofagia con antitiroideo", "Suspender el antitiroideo y pedir un hemograma con recuento de neutrófilos urgente (agranulocitosis si <500/mm³).", ["metimazol", "ptu"], ["ATA_HIPER16"]));
    if (s.ae_icter) out.push(R("urgente", "Ictericia o coluria", "Suspender y pedir PFH: hepatotoxicidad (PTU: hepatocelular, metimazol: colestásica).", ["ptu"], ["ATA_HIPER16"]));

    if (x == null && !s.t3alta) return { res: `TSH ${tsh}`, items: [R("revisar", "Falta la T4 libre", "Cargá la T4L como múltiplo del límite superior normal (ej.: T4L 2,7 con límite 1,8 → 1,5) para diferenciar subclínico de manifiesto y calcular la dosis de metimazol.", [], ["ATA_HIPER16"]), ...out] };
    const manifiesto = tsh < 0.4 && ((x != null && x > 1) || s.t3alta);
    if (tsh >= 0.4) return { res: `TSH ${tsh}: no compatible con hipertiroidismo primario`, items: [R("info", "TSH normal o alta", "Si la T4L está alta con TSH no suprimida: pensar en un adenoma hipofisario productor de TSH o en interferencia de laboratorio (biotina). Derivar.", [], ["ATA_HIPER16"]), ...out] };

    if (!manifiesto) {
      const riesgo = (d.edad || 0) >= 65 || cardio || s.osteo || s.sint;
      out.push(R("revisar", "Hipertiroidismo subclínico", "Repetir TSH, T4L y T3 en 6–12 semanas para confirmar.", [], ["ATA_HIPER16"]));
      if (tsh < 0.1) out.push(R(riesgo ? "iniciar" : "info", "TSH <0,1", riesgo ? "Tratar: ≥65 años, cardiopatía, FA, osteoporosis o síntomas. Definir la etiología (TRAb, gammagrafía)." : "Considerar tratamiento según la etiología; vigilar.", ["metimazol"], ["ATA_HIPER16"]));
      else out.push(R("info", "TSH 0,1–0,4", riesgo ? "Considerar tratar si ≥65 años o hay cardiopatía u osteoporosis." : "Observar y repetir cada 6–12 meses.", [], ["ATA_HIPER16"]));
      if (cardio && (fc || 0) > 80) out.push(R("iniciar", "Betabloqueante", "Para control sintomático y de la FC.", ["atenolol", "propranolol"], ["ATA_HIPER16"]));
      return { res: `TSH ${tsh} · T4L normal → subclínico`, items: out };
    }

    // Betabloqueo
    if ((fc != null && fc > 90) || (d.edad || 0) >= 60 || cardio) {
      if (p.asma) out.push(R("iniciar", "Control de FC (asma)", "Betabloqueante contraindicado: diltiazem 60 mg c/8 h (o verapamilo).", ["diltiazem"], ["ATA_HIPER16"]));
      else out.push(R("iniciar", "Betabloqueante sintomático", `${fc ? `FC ${fc} lpm. ` : ""}${d.emb ? "Propranolol a dosis baja y por el menor tiempo posible (evitar atenolol en el embarazo)." : "Propranolol 10–40 mg c/6–8 h o atenolol 25–100 mg/d."} Meta FC <90.${p.ic ? " Con IC: titular con cuidado (puede ser una miocardiopatía por taquicardia)." : ""}`, ["propranolol", "atenolol"], ["ATA_HIPER16"]));
    }

    const et = s.etio || "nd";
    if (et === "nd") out.push(R("revisar", "Definir la etiología", `TRAb (anticuerpos anti-receptor de TSH), ecografía doppler${d.emb ? "" : " y gammagrafía o captación de yodo"}. ${d.emb ? "En el embarazo la gammagrafía está contraindicada." : ""}`, [], ["ATA_HIPER16"]));
    if (et === "tiroiditis") {
      out.push(R("evitar", "Tiroiditis (captación baja): sin antitiroideos", "No hay síntesis aumentada: el metimazol no sirve. Solo betabloqueante; AINE o prednisona si es subaguda dolorosa. Puede seguir una fase de hipotiroidismo: control de TSH y T4L cada 4–6 semanas.", ["propranolol"], ["ATA_HIPER16"]));
    } else if (et === "amio") {
      out.push(R("urgente", "Tirotoxicosis por amiodarona (AIT)", "Derivar a endocrinología. Tipo 1 (exceso de yodo, tiroides previa enferma): metimazol a dosis altas. Tipo 2 (tiroiditis destructiva): prednisona 40 mg/d. La decisión de suspender la amiodarona se toma con cardiología.", ["metimazol", "amiodarona"], ["ATA_HIPER16"]));
    } else {
      // Antitiroideo
      let dosis = "10–30 mg/d según la severidad";
      if (x != null) dosis = x <= 1.5 ? "5–10 mg/d" : x <= 2 ? "10–20 mg/d" : "30–40 mg/d";
      if (d.emb && tri === "1") out.push(R("iniciar", "1er trimestre: propiltiouracilo", "PTU a la menor dosis eficaz (50–150 mg c/8 h). Meta: T4L en el límite superior normal. Valorar el cambio a metimazol después del 1er trimestre. Manejo conjunto con endocrinología y obstetricia.", ["ptu"], ["ATA_EMB17"], "Hipertiroidismo manifiesto en el primer trimestre del embarazo; el propiltiouracilo es el antitiroideo de elección en esta etapa por el riesgo de embriopatía del metimazol (ATA 2017)."));
      else out.push(R(s.ttoActual === "si" ? "titular" : "iniciar", s.ttoActual === "si" ? "Ajustar metimazol" : "Iniciar metimazol",
        s.ttoActual === "si" ? "Si la T4L se normalizó: reducir la dosis un 30–50% hacia el mantenimiento (5–10 mg/d). Si persiste alta: revisar la adherencia y subir." : `T4L ${x ?? "?"}× LSN → ${dosis} en una toma. Hemograma y PFH basales. Control de T4L y T3 a las 4–6 semanas.${d.emb ? " Embarazo 2º–3º trimestre: dosis mínima eficaz." : ""}`,
        ["metimazol"], ["ATA_HIPER16"], `Hipertiroidismo manifiesto (TSH ${tsh} mU/L, T4 libre ${x ?? "—"} veces el límite superior)${et === "graves" ? " por enfermedad de Graves" : et === "bmn" ? " por bocio multinodular tóxico" : et === "adenoma" ? " por adenoma tóxico" : ""}; se indica metimazol a una dosis ajustada a la severidad según la ATA 2016, con hemograma y perfil hepático basales.`));
      if (et === "graves" && !d.emb) out.push(R("info", "Enfermedad de Graves", "Metimazol por 12–18 meses y medir TRAb antes de suspender (si son negativos, mayor probabilidad de remisión). Alternativas: yodo radiactivo o tiroidectomía. Si hay orbitopatía: dejar de fumar y evitar el yodo sin cobertura esteroidea.", ["metimazol"], ["ATA_HIPER16"]));
      if (et === "bmn" || et === "adenoma") out.push(R("info", et === "bmn" ? "Bocio multinodular tóxico" : "Adenoma tóxico", "No remite espontáneamente: preferir un tratamiento definitivo (yodo radiactivo o cirugía). El metimazol a dosis baja de largo plazo es una alternativa aceptable.", ["metimazol"], ["ATA_HIPER16"]));
    }
    if (p.fa) out.push(R("info", "FA por tirotoxicosis", "Anticoagular según CHA₂DS₂-VA (módulo FA). Control de FC con betabloqueante. La cardioversión suele diferirse hasta el eutiroidismo; muchas revierten solas.", ["warfarina", "apixaban"], ["ESC_FA24", "ATA_HIPER16"]));
    if (s.warf) out.push(R("info", "Warfarina", "Al normalizarse la función tiroidea disminuye la sensibilidad a la warfarina: controlar el INR con más frecuencia.", ["warfarina"], ["ATA_HIPER16"]));
    if (x != null && x > 3 && (fc || 0) > 130) out.push(R("urgente", "¿Tormenta tiroidea?", "FC >130 con T4L >3× LSN: evaluar fiebre, IC, alteración mental o síntomas GI (escala de Burch-Wartofsky). Si se sospecha: manejo hospitalario con PTU, propranolol, yodo y corticoide.", ["ptu", "propranolol"], ["ATA_HIPER16"]));
    return { res: `TSH ${tsh} · T4L ${x ?? "?"}× LSN → hipertiroidismo manifiesto${d.emb ? ` · embarazo ${tri}º trim.` : ""}`, items: out };
  }

  // ═════════════════════ FA — ANTICOAGULACIÓN
  function fa(p, s) {
    const d = derive(p), out = [];
    const C = cha2ds2va(p, s), H = hasbled(p, s, d);
    const cl = d.clcr;
    if (s.mec || s.em) {
      out.push(R("iniciar", s.mec ? "Válvula mecánica → warfarina" : "Estenosis mitral moderada-severa → warfarina", `ACOD contraindicados. INR ${s.mec ? "2,5–3,5 según la prótesis" : "2,0–3,0"}.`, ["warfarina"], ["ESC_FA24"], `Fibrilación auricular con ${s.mec ? "prótesis valvular mecánica" : "estenosis mitral moderada-severa"}; los anticoagulantes directos están contraindicados y la warfarina es el anticoagulante de elección (ESC 2024).`));
      return { res: `CHA₂DS₂-VA ${C.sc} · HAS-BLED ${H.sc}`, items: out };
    }
    if (C.sc >= 2) out.push(R("iniciar", `CHA₂DS₂-VA ${C.sc}: anticoagulación recomendada`, `${C.det.join(", ")}. Preferir ACOD sobre warfarina (clase I).`, [], ["ESC_FA24"]));
    else if (C.sc === 1) out.push(R("info", "CHA₂DS₂-VA 1: considerar anticoagulación", `${C.det.join(", ")}. Decisión compartida (IIa).`, [], ["ESC_FA24"]));
    else { out.push(R("info", "CHA₂DS₂-VA 0", "Sin indicación de anticoagulación. Reevaluar periódicamente.", [], ["ESC_FA24"])); }
    if (d.emb) out.push(R("evitar", "Embarazo", "ACOD contraindicados; usar HBPM (enoxaparina).", ["enoxaparina"], ["ESC_FA24"]));

    if (C.sc >= 1 && !d.emb) {
      if (cl == null) out.push(R("revisar", "Falta la depuración de creatinina", "Cargá edad, peso, sexo y creatinina para calcular la dosis de cada ACOD.", [], ["CG76"]));
      else {
        // Apixabán
        const crit = [(d.edad || 0) >= 80 && "edad ≥80", (d.peso || 99) <= 60 && "peso ≤60", (d.cr || 0) >= 1.5 && "Cr ≥1,5"].filter(Boolean);
        let ap = cl < 15 ? "No recomendado (ClCr <15)" : (crit.length >= 2 || cl < 30) ? `2,5 mg c/12 h (${crit.length >= 2 ? crit.join(" + ") : "ClCr 15–29"})` : "5 mg c/12 h";
        let rv = cl < 15 ? "No usar (ClCr <15)" : cl < 50 ? "15 mg/d con comida (ClCr 15–49)" : "20 mg/d con comida";
        let db = cl < 30 ? "Contraindicado (ClCr <30)" : ((d.edad || 0) >= 80 || s.verap) ? "110 mg c/12 h" : ((d.edad || 0) >= 75 || H.sc >= 3) ? "150 o 110 mg c/12 h (según el riesgo de sangrado)" : "150 mg c/12 h";
        let ed = cl < 15 ? "No usar" : (cl <= 50 || (d.peso || 99) <= 60 || s.pgp) ? "30 mg/d" : cl > 95 ? "60 mg/d (menor eficacia con ClCr >95)" : "60 mg/d";
        out.push(R("iniciar", `Dosis de ACOD (ClCr ${cl} mL/min)`, `• Apixabán: ${ap}\n• Rivaroxabán: ${rv}\n• Dabigatrán: ${db}\n• Edoxabán: ${ed}`, ["apixaban", "rivaroxaban", "dabigatran", "edoxaban"], ["ESC_FA24", "CG76"], `Fibrilación auricular no valvular con CHA₂DS₂-VA de ${C.sc} (${C.det.join(", ")}) y HAS-BLED de ${H.sc}; la ESC 2024 recomienda anticoagulación oral, prefiriendo los anticoagulantes directos sobre la warfarina. Depuración de creatinina (Cockcroft-Gault) ${cl} mL/min para el ajuste de dosis. El HAS-BLED no contraindica la anticoagulación: se corrigen los factores de sangrado modificables.`));
        if (cl < 30 || (d.edad || 0) >= 80) out.push(R("info", "Elección del ACOD", "Con ERC avanzada o en el adulto mayor, apixabán tiene el mejor perfil de sangrado.", ["apixaban"], ["ESC_FA24"]));
        if (s.adh === "dudosa") out.push(R("info", "Adherencia dudosa", "Un ACOD de una toma diaria (rivaroxabán, edoxabán) puede facilitarla.", ["rivaroxaban"], ["ESC_FA24"]));
      }
      out.push(R(H.sc >= 3 ? "revisar" : "info", `HAS-BLED ${H.sc}${H.sc >= 3 ? " (alto)" : ""}`, `${H.det.length ? H.det.join(", ") + ". " : ""}No contraindica la anticoagulación: corregir los factores modificables (PA, AINE, alcohol, INR lábil) y hacer un seguimiento más estrecho.`, [], ["ESC_FA24"]));
      if (s.farmacos) out.push(R("revisar", "Antiagregante + anticoagulante", "Si no hay SCA ni ICP reciente, suspender el antiagregante (en coronariopatía estable >12 meses basta con el ACO solo). Agregar IBP.", ["aas", "clopidogrel"], ["ESC_FA24"]));
    }
    out.push(R("info", "Control de FC / ritmo", `FEVI >40%: betabloqueante, diltiazem o digoxina. FEVI ≤40%: betabloqueante ± digoxina. Pedir TSH (tirotoxicosis) y ecocardiograma.`, ["bisoprolol", "diltiazem", "digoxina"], ["ESC_FA24"]));
    return { res: `CHA₂DS₂-VA ${C.sc} · HAS-BLED ${H.sc}${cl != null ? ` · ClCr ${cl}` : ""}`, items: out };
  }

  // ═════════════════════ DISLIPIDEMIA
  function lip(p, s) {
    const d = derive(p), out = [];
    const ldl = num(s.ldl);
    if (ldl == null) return { res: "Ingresá el LDL.", items: [] };
    let cat = s.riesgo || "auto", porque = "";
    if (cat === "auto") {
      if (p.ecv) { cat = "muy"; porque = "ECV establecida"; }
      else if (d.tfg != null && d.tfg < 30) { cat = "muy"; porque = "TFG <30"; }
      else if (p.dm && (s.dano || [p.hta, p.tab, p.dlp].filter(Boolean).length >= 3)) { cat = "muy"; porque = "DM con daño de órgano o ≥3 FR"; }
      else if (ldl >= 190) { cat = "alto"; porque = "LDL ≥190 (sospechar hipercolesterolemia familiar)"; }
      else if (p.dm || (d.tfg != null && d.tfg < 60)) { cat = "alto"; porque = p.dm ? "DM sin daño de órgano" : "TFG 30–59"; }
      else { cat = "mod"; porque = "Sin criterios automáticos: estimá el riesgo (Framingham ajustado ×0,75 según la GPC colombiana o SCORE2) y elegí la categoría manualmente"; }
    }
    const META = { muy: 55, alto: 70, mod: 100, bajo: 116 };
    const NOM = { muy: "Muy alto", alto: "Alto", mod: "Moderado", bajo: "Bajo" };
    const meta = META[cat];
    const red = Math.max(0, Math.round((1 - meta / ldl) * 100));
    const jL = `Riesgo cardiovascular ${NOM[cat].toLowerCase()}${porque ? ` (${porque})` : ""} con LDL ${ldl} mg/dL; la meta según ESC/EAS 2019 es <${meta} mg/dL, lo que requiere una reducción de ~${red}%. La reducción de eventos es proporcional al descenso del LDL (metaanálisis CTT).`;
    const est = s.estat || "no";

    if (s.sca) out.push(R("iniciar", "Post-SCA", "Estatina de alta intensidad lo antes posible, independiente del LDL basal. Considerar ezetimibe precoz si la meta parece lejana.", ["atorvastatina", "rosuvastatina", "ezetimibe"], ["ESC_SCA23"]));
    if (ldl <= meta && !(p.ecv && est === "no")) {
      out.push(R("mantener", "LDL en meta", `LDL ${ldl} < ${meta} mg/dL. Mantener y controlar en 6–12 meses.`, [], ["ESC_LIP19"]));
    } else if (est === "no") {
      if (s.intol) out.push(R("iniciar", "Intolerancia a estatinas", "Probar otra estatina a dosis baja o en días alternos (rosuvastatina 5 mg). Si no es posible: ezetimibe ± iPCSK9.", ["rosuvastatina", "ezetimibe", "evolocumab"], ["ESC_LIP19"], jL));
      else if (p.ecv) out.push(R("iniciar", "ECV establecida: estatina de alta intensidad", `Indicada independientemente del LDL basal${red > 50 ? `; se necesita ~${red}% de reducción: sumar ezetimibe` : ""}.`, red > 50 ? ["atorvastatina", "rosuvastatina", "ezetimibe"] : ["atorvastatina", "rosuvastatina"], ["ESC_LIP19"], jL));
      else if (red <= 30 && cat !== "muy") out.push(R("iniciar", "Estatina de moderada intensidad", `Se necesita una reducción de ~${red}%: atorvastatina 10–20 mg o rosuvastatina 5–10 mg.`, ["atorvastatina", "rosuvastatina"], ["ESC_LIP19"], jL));
      else if (red <= 50) out.push(R("iniciar", "Estatina de alta intensidad", `Se necesita una reducción de ~${red}%${cat === "muy" ? " (y ≥50% por ser de muy alto riesgo)" : ""}: atorvastatina 40–80 mg o rosuvastatina 20–40 mg.`, ["atorvastatina", "rosuvastatina"], ["ESC_LIP19"], jL));
      else out.push(R("iniciar", "Alta intensidad + ezetimibe", `Se necesita una reducción de ~${red}% (más de lo que logra una estatina sola, ~50%): iniciar ambos o agregar ezetimibe a las 4–6 semanas.`, ["rosuvastatina", "atorvastatina", "ezetimibe"], ["ESC_LIP19"], jL));
    } else {
      if (est === "mod") out.push(R("titular", "Pasar a alta intensidad", `LDL ${ldl} > meta ${meta}: atorvastatina 40–80 mg o rosuvastatina 20–40 mg.`, ["atorvastatina", "rosuvastatina"], ["ESC_LIP19"], jL));
      else if (!s.eze) out.push(R("iniciar", "Agregar ezetimibe", "10 mg/d: un 20–25% adicional.", ["ezetimibe"], ["ESC_LIP19"], jL));
      else if (!s.pcsk9) out.push(R(cat === "muy" || cat === "alto" ? "iniciar" : "info", "Considerar iPCSK9", `Con estatina máxima + ezetimibe fuera de meta${cat === "muy" ? " y riesgo muy alto (clase I)" : ""}. En Colombia suele requerir MIPRES.`, ["evolocumab"], ["ESC_LIP19"]));
      else out.push(R("revisar", "Fuera de meta con triple terapia", "Revisar adherencia y causas secundarias; derivar a una unidad de lípidos.", [], ["ESC_LIP19"]));
    }
    out.push(R("revisar", "Causas secundarias", "Pedir TSH (hipotiroidismo), glucemia, PFH, función renal y proteinuria (síndrome nefrótico). Repetir el perfil a las 4–12 semanas de cada cambio.", ["levotiroxina"], ["ESC_LIP19"]));
    if (d.emb) out.push(R("evitar", "Embarazo", "Estatinas, ezetimibe e iPCSK9 contraindicados.", [], ["ESC_LIP19"]));
    if (d.tfg != null && d.tfg < 30) out.push(R("info", "TFG <30", "Rosuvastatina máx 10 mg; atorvastatina sin ajuste (preferida).", ["atorvastatina"], ["ESC_LIP19"]));
    return { res: `Riesgo ${NOM[cat]}${porque ? ` (${porque})` : ""} · Meta LDL <${meta} mg/dL · LDL ${ldl} → reducción necesaria ~${red}%`, items: out };
  }

  return { ic, hta, dm, hipo, hiper, fa, lip, derive, ckdepi, cockcroft, imc, cha2ds2va, hasbled, roundLT4 };
})();

if (typeof module !== "undefined") module.exports = ENG;
