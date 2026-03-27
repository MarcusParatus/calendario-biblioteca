export default async (request, context) => {
  const url = new URL(request.url);
  const eventoSlug = url.searchParams.get("evento");

  // Se non c'è un parametro evento, lascia passare la risposta normale
  const response = await context.next();
  if (!eventoSlug) return response;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  // L'ID del Google Sheet della BIBLIOTECA
  const sheetId = "1khYOAiwdSGne5HjY3lpirYJQVOmjfbtKEZFk9_zYDFM";
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

  // Testi di base se non trova l'evento
  let ogTitle = "Calendario Eventi | Biblioteca Comunale";
  let ogDesc = "Scopri tutti gli eventi, i laboratori e gli incontri in programma.";
  let ogImage = "https://tuosito.netlify.app/immagine-default-biblioteca.jpg"; // Opzionale: metti un'immagine di base

  try {
    const sheetRes = await fetch(csvUrl);
    const csvText = await sheetRes.text();
    const righe = csvText.split(/\r?\n/);
    const intestazioni = parsaRigaCSV(righe[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());

    const idxTitolo    = intestazioni.indexOf("titolo");
    const idxDesc      = intestazioni.indexOf("descrizione");
    // ATTENZIONE: Se nel tuo foglio Google della biblioteca vuoi le immagini, 
    // crea una colonna chiamata "immagine" e incolla lì i link delle foto.
    const idxImmagine  = intestazioni.indexOf("immagine"); 

    for (let i = 1; i < righe.length; i++) {
      if (!righe[i].trim()) continue;
      const valori = parsaRigaCSV(righe[i]).map(v => v.replace(/^"|"$/g, '').trim());
      const titolo = valori[idxTitolo] || "";
      if (!titolo) continue;

      // Ricrea lo slug ESATTAMENTE come fa la funzione createSlug nell'HTML della biblioteca
      const slug = encodeURIComponent(
        titolo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
      );

      if (slug === eventoSlug || decodeURIComponent(slug) === decodeURIComponent(eventoSlug)) {
        ogTitle = titolo + " | Biblioteca Comunale";
        ogDesc  = (valori[idxDesc] || "").substring(0, 160);
        
        // Prende l'immagine se esiste la colonna nel file Google
        if (idxImmagine !== -1 && valori[idxImmagine]) {
          ogImage = valori[idxImmagine];
        }
        break;
      }
    }
  } catch (err) {
    console.error("Edge function error:", err);
  }

  // Inietta i meta tag nell'HTML
  const ogTags = `
    <meta property="og:title" content="${escapeHtml(ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(ogDesc)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:url" content="${url.href}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />`;

  let html = await response.text();
  // Sostituisce i tag base e inietta quelli nuovi
  html = html.replace(/<meta property="og:image"[^>]*>/g, '');
  html = html.replace(/<meta name="twitter:image"[^>]*>/g, '');
  html = html.replace('</head>', ogTags + '\n</head>');

  return new Response(html, {
    status: response.status,
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
};

function parsaRigaCSV(riga) {
  const risultati = [];
  let campo = '';
  let dentroVirgolette = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (c === '"') {
      if (dentroVirgolette && riga[i + 1] === '"') { campo += '"'; i++; }
      else { dentroVirgolette = !dentroVirgolette; }
    } else if (c === ',' && !dentroVirgolette) {
      risultati.push(campo); campo = '';
    } else {
      campo += c;
    }
  }
  risultati.push(campo);
  return risultati;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}