# Java Radio · 140.1

**Radio independiente, open source y sin anuncios.** Suena en el navegador,
toma la música de una carpeta de **Google Drive** (o de una carpeta local),
la clasifica por género, estilo y emoción, y la recomienda según la hora del
día. Entre canción y canción hablan **cuatro locutores** con voz propia.

Cero dependencias: Node 18+ en el servidor y HTML/CSS/JS en el cliente.
No hay frameworks, ni build, ni base de datos.

> **Open Source.** El código está publicado bajo licencia **MIT** (ver
> [`LICENSE`](LICENSE)): puedes leerlo, modificarlo, desplegarlo y compartirlo.
> Java Radio nació como homenaje a Java, el primer lenguaje con el que su
> autor aprendió a programar.
>
> **Autor:** Lott Campuzano · [GitHub](https://github.com/Lott-Campuzano) ·
> [Portafolio](https://lott-campuzano.vercel.app/)

---

## La cabina

| Locutor | Territorio | Carácter | Color |
|---|---|---|---|
| **Xander** | Electrónica, pop, trap, funk | Joven, rápido, obsesionado con el bajo | Cian y coral |
| **Sari** | Folk, balada, indie, acústico | Romántica, pausada, cercana | Ámbar y rosa |
| **Jai** | Rock, metal, instrumental, jazz | Directo, seco, pocas palabras | Menta y ámbar |
| **Bry** | Urbano, reggaetón, trap, hip-hop | Calle, flow, actitud | Magenta y dorado |

Puedes **fijar un locutor** en la sección «La cabina» o dejar el **modo
automático**: la hora y el género de cada pista deciden quién habla. El fondo
de la página cambia con la paleta de ropa del locutor activo.

Cada locutor tiene libretos distintos (`public/app.js` → `DJ_PROFILES`), una
velocidad y un tono de voz diferentes, y comenta también las dedicatorias.

---

## Cómo recomienda la música

La cola no es aleatoria. El servidor clasifica cada pista y el cliente la
ordena según la franja horaria:

| Franja | Horas | Energía objetivo | Emoción prioritaria |
|---|---|---|---|
| Mañana | 06:00–11:59 | Alta (≈80/100) | Energética |
| Tarde | 12:00–19:59 | Media-baja (≈46/100) | Emocional / calmada |
| Noche | 20:00–23:59 | Media (≈62/100) | Equilibrada / energética |
| Madrugada | 00:00–05:59 | Baja (≈24/100) | Calmada / emocional |

La puntuación compara la energía de cada tema con la energía objetivo y suma
puntos si la emoción coincide. El resultado es estable durante la sesión: la
cola no baila en cada recarga, pero cambia al cambiar de franja. El botón de
aleatorio desactiva la recomendación y mezcla toda la biblioteca.

La franja activa aparece en la insignia **«Mañana · energía»**, **«Tarde ·
emoción»**, etc., junto a la cola.

---

## Arrancarla en un minuto

```bash
cd java-radio
npm start
```

Abre <http://127.0.0.1:4321> y pulsa **Encender la radio**. No hay que instalar
nada: el proyecto no tiene dependencias.

Para escucharla desde el móvil en la misma red:

```bash
HOST=0.0.0.0 npm start
# entra desde el móvil a http://IP-DE-TU-ORDENADOR:4321
```

Para probar sin Drive, genera cuatro temas instrumentales de demostración:

```bash
npm run demo-audio   # crea WAVs en musica/
SOURCE=local npm start
```

---

## Conectar Google Drive

Copia `.env.example` a `.env` y elige un camino.

### Opción 0 · carpeta pública, sin API key (la más rápida)

1. Sube tus audios a una carpeta de Drive.
2. Compártela: **Cualquiera con el enlace → Lector**.
3. Pega el enlace en `.env`:

```env
DRIVE_FOLDER_ID=https://drive.google.com/drive/folders/12V93aLPixMP6QjPKCsDJ3lyvLiChxXIK?usp=share_link
```

El servidor lista la carpeta con la vista pública de Drive y sirve el audio a
través de su proxy con soporte de `Range`. **El navegador nunca recibe el ID
ni la URL de Drive**, solo un token firmado.

> Limitación del modo público: Drive puede cambiar su HTML interno. Si el
> listado falla, usa la Opción A o B. Además, los archivos deben ser audios
> (mp3, m4a, flac, wav, ogg, opus, aac, webm).

### Opción A · carpeta pública + API key

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un
   proyecto y habilita **Google Drive API**.
2. **Credenciales → Crear credenciales → Clave de API** y restíngela a
   Google Drive API.
3. Rellena:

```env
DRIVE_FOLDER_ID=1AbCdEfGh...
GOOGLE_API_KEY=AIza...
```

La clave se queda en el servidor. El navegador no la ve.

### Opción B · cuenta de servicio (carpeta privada, recomendada)

1. Habilita **Google Drive API**.
2. Crea una **cuenta de servicio** y descarga su clave JSON.
3. Comparte la carpeta con el email de la cuenta de servicio como **Lector**.
4. Apunta al JSON:

```env
DRIVE_FOLDER_ID=1AbCdEfGh...
GOOGLE_SERVICE_ACCOUNT_FILE=/ruta/a/clave.json
```

También puedes pegar el JSON completo en `GOOGLE_SERVICE_ACCOUNT_JSON`.

### Nombres, portadas y subcarpetas

```
Artista - Título.mp3                 → artista / título
01 - Artista - Título.mp3            → el número se ignora
Título.mp3                           → «Lott Campuzano» (autor del proyecto)
Artista - Título [rock].mp3          → género manual entre corchetes
Artista - Título.jpg                 → portada con el mismo nombre
```

- Portada: imagen con el mismo nombre que el audio, o `cover.jpg`,
  `portada.jpg`, `front.jpg`, `folder.jpg`, `album.jpg` en la misma carpeta.
- Subcarpetas: se leen hasta 4 niveles; el nombre de la subcarpeta de primer
  nivel aparece como **álbum**.
- Sin portada, la web genera una portada tipográfica con color derivado del
  título.
- Formatos: mp3, m4a, aac, wav, flac, ogg, opus, webm.

---

## Clasificación: género, estilo y emoción

El servidor lee las etiquetas reales de los archivos (**ID3v2** en MP3,
**Vorbis comments** en FLAC/OGG y **RIFF INFO** en WAV) y extrae género, estado
de ánimo y BPM si existen. El cliente recibe:

```json
{
  "genre": "rock",
  "genreLabel": "Rock",
  "style": "Rock",
  "styleLabel": "Rock",
  "mood": "energetic",
  "moodLabel": "Energética",
  "energy": 82,
  "bpm": 128,
  "classification": "tag"
}
```

Orden de prioridad:

1. Etiqueta real del archivo (`genre`, `mood`, `bpm`).
2. Sufijo manual en el nombre: `Tema [electronica].mp3`.
3. Palabras clave en el nombre o la carpeta.
4. **Perfil estimado** determinista a partir del nombre del archivo.

La estimación no adivina el género real: reparte la biblioteca en arquetipos
variados para que la recomendación por hora funcione desde el primer minuto.
En la interfaz, los chips estimados llevan borde discontinuo y un tooltip que
lo explica. Para afinarla, añade etiquetas ID3/Vorbis o el sufijo `[genero]`.

Géneros reconocidos: electrónica, synthpop, pop, urbano, trap, reggaetón,
hip-hop, R&B, rock, metal, indie, folk, balada, acústico, country, lofi,
ambient, jazz, clásica, latino, funk e instrumental.

---

## La voz de los locutores

Java Radio usa **dos motores de voz gratuitos**, en este orden:

1. **`speechSynthesis`** del navegador: local, instantáneo y sin red. Es el
   motor principal y el que usa la mayoría de los equipos.
2. **Respaldo del servidor** (`/api/tts`): si el navegador no tiene voces, las
   bloquea o el sistema está mudo, el cliente pide el MP3 al servidor. El
   servidor lo sintetiza con el endpoint público de **Google Translate TTS**,
   que **no necesita API key ni pago**. La respuesta se cachea en memoria y
   está limitada por IP para no abusar del servicio.

Si los dos fallan, la radio sigue sonando y el comentario queda **escrito** en
el bocadillo. Nunca se rompe la reproducción por culpa de la voz.

Detalles de la implementación (`public/app.js` y `server.js`):

- La frase se lanza **antes** de esperar a `audio.play()`. Si se espera
  primero, Safari/Chrome pierden el gesto del usuario y la voz queda muda
  aunque el texto aparezca en el bocadillo.
- Se elige una voz en español del sistema y se reparte entre los locutores
  con distinto `rate` y `pitch`.
- Un `resume()` periódico evita el fallo de Chrome que deja la cola pausada.
- Si el motor del navegador no arranca en 1,5 s, se reintenta una vez. Si
  sigue mudo, entra el respaldo del servidor automáticamente.
- El respaldo se reproduce por Web Audio (ya desbloqueado en el primer clic);
  si no hay `AudioContext`, usa un `<audio>` con un blob temporal.
- El botón **Voz del locutor** silencia solo la voz; los comentarios siguen
  escritos y la música no se detiene.
- La música se atenúa mientras habla el locutor y vuelve a su volumen después.

> **Aviso del proveedor de respaldo.** Google Translate TTS es un endpoint
> público **no oficial**. Puede cambiar, limitar o dejar de responder sin
> previo aviso. Si eso pasa, Java Radio avisa y mantiene los comentarios
> escritos; no hay claves ni facturas de por medio. Para cambiar de proveedor
> solo hay que editar `fetchTtsChunk()` en `server.js`.

### Si no se oye la voz

1. Pulsa primero **Encender la radio** (el navegador exige un clic real).
2. Comprueba que el botón de voz esté activo.
3. Instala una voz en español en el sistema para evitar depender del respaldo:
   - **macOS:** Ajustes → Accesibilidad → Contenido leído → Voces →
     Gestionar voces → Español.
   - **Windows:** Configuración → Hora e idioma → Voz → Agregar voces.
   - **Linux:** instala `espeak-ng` o `speech-dispatcher` con voces `es`.
4. Recarga la página después de instalar la voz: el navegador cachea la lista.
5. Si tu red bloquea `translate.google.com`, el respaldo tampoco podrá bajar el
   MP3. En ese caso quedan los comentarios escritos.

---

## Qué protege el audio (y qué no)

Lo que **sí** hace el proyecto:

- El navegador nunca recibe el ID ni la URL de Drive: recibe un token aleatorio.
- Cada URL de audio va firmada con HMAC y caduca a las 6 horas.
- La firma está atada a la cookie de sesión (`HttpOnly`, `SameSite=Strict`):
  copiar el enlace a otro navegador no sirve.
- Se rechazan peticiones de otro origen y se limita el número de peticiones.
- El audio se sirve `inline`, sin `Content-Disposition: attachment`, sin
  enlaces de descarga y con `no-store`.
- La web bloquea el menú contextual, el arrastre de audio/imágenes y los
  atajos habituales de herramientas de desarrollo y «ver código fuente».
- El código del servidor no se sirve nunca: solo la carpeta `public/`.

Lo que **no** se puede prometer:

- **No existe DRM en una web abierta.** Cualquiera puede grabar con la tarjeta
  de sonido o un proxy. Estas medidas son disuasión razonable, no una cárcel.
- El JavaScript del cliente siempre es legible por quien se lo proponga.
  Bloquear F12 molesta, no impide.
- Si publicas la radio, la gente podrá oírla. Para control de acceso real,
  añade login y sirve el audio solo a usuarios autenticados.

La parte importante: **no hay una URL pública de Drive ni un endpoint de
descarga** en la interfaz ni en el HTML.

---

## Configuración (`.env`)

| Variable | Para qué |
|---|---|
| `PORT` / `HOST` | Puerto y dirección. `HOST=0.0.0.0` para red local o producción. |
| `SESSION_SECRET` | Firma sesiones y URLs de audio. Si falta, se genera uno temporal en cada arranque. |
| `DRIVE_FOLDER_ID` | Carpeta de Drive (enlace completo o solo el ID). |
| `GOOGLE_API_KEY` | Opción A. |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Opción B (ruta al JSON). |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Opción B (JSON en una línea). |
| `SOURCE` | `auto` (por defecto), `drive` o `local`. |
| `MUSIC_DIR` | Carpeta local alternativa a `musica/`. |
| `RADIO_ALBUM` | Álbum por defecto de los audios sueltos. |
| `SECURE_COOKIES` | `1` si sirves la radio por HTTPS. |

Genera un secreto fijo con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Desplegarla

Necesita un servidor Node con procesos vivos y streaming (Render, Railway,
Fly.io, un VPS…). **No encaja en funciones serverless** como Vercel/Netlify
Functions por las sesiones en memoria y el proxy de audio con `Range`.

1. Sube el proyecto (sin `.env` ni `musica/` si usas Drive).
2. Define las variables de entorno.
3. `HOST=0.0.0.0`, `SECURE_COOKIES=1` y un `SESSION_SECRET` fijo.
4. `npm start`.

Cada oyente consume ancho de banda del servidor: Drive no es una CDN. Para
mucha audiencia, pon una caché/CDN delante o sirve desde object storage.

**Derechos:** sube solo música que puedas emitir. Drive es el almacén, no una
licencia.

---

## Estructura

```
java-radio/
├── server.js                 # servidor, proxy de Drive, sesiones y clasificación
├── package.json
├── .env.example
├── LICENSE                   # MIT
├── musica/                   # modo local (audios ignorados por git)
│   └── LEEME.txt
├── scripts/
│   └── make-demo-audio.js    # genera 4 temas de prueba en WAV
└── public/
    ├── index.html            # estructura y retratos SVG de los locutores
    ├── styles.css            # estilos y fondo dinámico por locutor
    ├── app.js                # reproductor, locutores, voz, cola y dedicatorias
    └── favicon.svg           # taza de café
```

### Cambiar a los locutores o sus frases

Todo está en `public/app.js`:

- `DJ_PROFILES`: nombre, rol, paleta, géneros afines, emociones, horas,
  velocidad/tono de voz y libretos.
- `SLOTS`: energía y emociones objetivo de cada franja horaria.
- `chooseDjForTrack()`: decide el locutor automático.
- `recommendationScore()`: ordena la cola.

Los libretos aceptan `{next}`, `{artist}`, `{prev}` y `{hora}`. Cada locutor
elige una frase distinta cada vez y evita repetir la última.

### Diagnóstico

- `GET /api/status` — modo, pistas, avisos, estado de Drive y `ttsFallback`.
- `GET /api/health` — latido del servidor.
- `GET /api/tts?text=…&lang=es` — voz de respaldo en MP3 (solo mismo origen).

`/api/status` y `/api/health` nunca devuelven claves ni IDs completos.

---

## Problemas frecuentes

| Síntoma | Qué mirar |
|---|---|
| «No pude cargar la selección» | Abre `/api/status`. Si `driveConfigured` es `false`, falta `DRIVE_FOLDER_ID`. |
| Drive responde 403 | La carpeta no está compartida como «Cualquiera con el enlace» o la API key no tiene Drive API activa. |
| Drive responde 404 | ID de carpeta incorrecto o el archivo se movió. |
| El listado público devuelve 0 pistas | Drive cambió su HTML o la carpeta no es pública. Usa API key o cuenta de servicio. |
| Un tema de más de 100 MB falla | Drive devuelve una página de aviso en vez del audio. Comprime el archivo. |
| No suena nada al pulsar play | El navegador exige un clic real. Pulsa el botón. |
| El locutor escribe pero no habla | Pulsa **Encender la radio** (gesto real) y revisa el botón de voz. Si el navegador no tiene voces, el respaldo `/api/tts` habla por él. Ver «Si no se oye la voz». |
| Todos los temas salen «estimado» | No tienen etiquetas ID3/Vorbis. Añade `[genero]` al nombre o etiqueta los archivos. |
| El puerto está ocupado | `PORT=4322 npm start`. |
| Se ven mal las fuentes | Sin Google Fonts se usan las del sistema; la radio sigue funcionando. |

---

## Contribuir

Java Radio es un proyecto abierto. Si encuentras un fallo o quieres añadir un
locutor, un género o una mejora:

1. Haz un fork.
2. Crea una rama (`git checkout -b mi-mejora`).
3. Mantén el estilo: cero dependencias, comentarios directos y español en la
   interfaz.
4. Abre un pull request explicando qué cambia y por qué.

No hace falta pedir permiso para experimentar: el código es tuyo también.

---

## Licencia

MIT © 2026 Lott Campuzano. Consulta [`LICENSE`](LICENSE).

- GitHub: <https://github.com/Lott-Campuzano>
- Portafolio: <https://lott-campuzano.vercel.app/>

Hecho para sonar de fondo, con la luz baja y una taza de café cerca.
