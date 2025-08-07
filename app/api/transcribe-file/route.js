import { NextResponse } from 'next/server';
import { SpeechClient } from '@google-cloud/speech';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Storage } from '@google-cloud/storage'; // <-- Nueva importación
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';

// --- 1. INICIALIZACIÓN DE CLIENTES Y CONSTANTES ---

const speechClient = new SpeechClient();
const storage = new Storage(); // <-- Nuevo cliente de GCS
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// IMPORTANTE: Reemplaza esto con el nombre exacto de tu bucket de GCS
const BUCKET_NAME = "minutagen-pro-audios-kenne-45549055"; 

const GEMINI_PROMPT_TEMPLATE = `
Actúa como un asistente ejecutivo altamente competente, encargado de documentar una reunión de trabajo.
Analiza la siguiente transcripción y genera una minuta profesional y concisa en español, utilizando el formato Markdown.

La minuta debe contener obligatoriamente las siguientes secciones:

# Minuta de la Reunión

## 1. Resumen Ejecutivo
Un párrafo conciso que resuma el propósito y los resultados clave de la reunión.

## 2. Puntos Clave Discutidos
Una lista de viñetas con los temas más importantes que se trataron.

## 3. Decisiones Tomadas
Una lista numerada que enumere claramente cada decisión final que se acordó.

## 4. Tareas y Acciones a Realizar (Action Items)
Una tabla con tres columnas: 'Tarea', 'Responsable(s)' y 'Fecha Límite'. Infiere los responsables a partir del texto. Si no se menciona un responsable o fecha, indica 'No especificado'.

---
TRANSCRIPCIÓN PARA ANALIZAR:
{transcript}
---
`;

// --- 2. FUNCIÓN DE LA API (ROUTE HANDLER) ---

export async function POST(request) {
  console.log("INFO: Recibida solicitud para transcribir archivo largo.");
  const tempFiles = [];
  let gcsFileName = ''; // Variable para guardar el nombre del archivo en GCS

  try {
    const formData = await request.formData();
    const file = formData.get('audioFile');
    if (!file) {
      return NextResponse.json({ error: "No se encontró el archivo de audio." }, { status: 400 });
    }
    
    // Paso 1: Convertir el archivo a formato WAV estándar (igual que antes)
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, file.name);
    tempFiles.push(tempFilePath);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, fileBuffer);
    
    const convertedWavPath = path.join(tempDir, `converted-${Date.now()}.wav`);
    tempFiles.push(convertedWavPath);
    
    await new Promise((resolve, reject) => {
        console.log(`INFO: Convirtiendo archivo a WAV...`);
        ffmpeg(tempFilePath)
            .toFormat('wav').audioChannels(1).audioFrequency(16000)
            .on('error', (err) => reject(new Error(`Error de FFmpeg: ${err.message}`)))
            .on('end', () => resolve())
            .save(convertedWavPath);
    });

    // Paso 2: Subir el archivo convertido a Google Cloud Storage
    gcsFileName = `audio-uploads/${Date.now()}-${path.basename(convertedWavPath)}`;
    console.log(`INFO: Subiendo archivo a GCS en gs://${BUCKET_NAME}/${gcsFileName}`);
    
    await storage.bucket(BUCKET_NAME).upload(convertedWavPath, {
      destination: gcsFileName,
    });
    
    const gcsUri = `gs://${BUCKET_NAME}/${gcsFileName}`;

    // Paso 3: Usar la API Asíncrona con la URI de GCS
    console.log("INFO: Enviando URI a la API asíncrona de Speech-to-Text...");
    const audio = { uri: gcsUri };
    const config = { 
        encoding: 'LINEAR16', 
        sampleRateHertz: 16000, 
        languageCode: 'es-PE', 
        model: 'telephony',
        enableAutomaticPunctuation: true
    };
    
    // Usamos longRunningRecognize para archivos largos
    const [operation] = await speechClient.longRunningRecognize({ audio, config });
    
    console.log("INFO: Transcripción en proceso... Esperando resultado. Esto puede tardar varios minutos.");
    // La librería se encarga de esperar (hacer polling) hasta que la operación termine
    const [response] = await operation.promise();
    
    const rawTranscript = response.results.map(r => r.alternatives[0].transcript).join('\n');

    if (!rawTranscript) {
      return NextResponse.json({ error: "No se pudo extraer texto del audio." }, { status: 400 });
    }
    
    // Paso 4: Generar Minuta con Gemini (igual que antes)
    console.log("INFO: Transcripción completada. Llamando a Gemini...");
    const prompt = GEMINI_PROMPT_TEMPLATE.replace('{transcript}', rawTranscript);
    const result = await geminiModel.generateContent(prompt);
    const finalMinutes = result.response.text();
    
    // Paso 5: Devolver la respuesta al frontend
    return NextResponse.json({ 
        minutes: finalMinutes,
        rawTranscript: rawTranscript 
    });

  } catch (error) {
    console.error("ERROR: Error fatal en la API de transcripción:", error);
    return NextResponse.json({ error: `Error en el servidor: ${error.message}` }, { status: 500 });
  } finally {
    // Paso 6: Limpieza Final
    // Borramos el archivo de GCS para no acumular costos de almacenamiento
    if (gcsFileName) {
      try {
        await storage.bucket(BUCKET_NAME).file(gcsFileName).delete();
        console.log(`INFO: Archivo temporal en GCS eliminado: ${gcsFileName}`);
      } catch (e) {
        console.error(`Error al limpiar archivo de GCS ${gcsFileName}:`, e);
      }
    }
    // Limpiar archivos temporales locales
    tempFiles.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) { console.error(`Error al limpiar archivo local ${filePath}:`, e); }
    });
  }
}