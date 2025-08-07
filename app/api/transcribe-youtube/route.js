import { NextResponse } from 'next/server';
import { SpeechClient } from '@google-cloud/speech';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ytdl from 'ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';

// --- 1. INICIALIZACIÓN DE CLIENTES Y PLANTILLA ---

const speechClient = new SpeechClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

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


// --- 2. FUNCIÓN DE LA API ---

export async function POST(request) {
  console.log("INFO: Recibida solicitud para transcribir URL de YouTube.");
  const tempFiles = []; // Array para guardar rutas de archivos temporales

  try {
    const { url } = await request.json();
    if (!url || !ytdl.validateURL(url)) {
      return NextResponse.json({ error: "URL de YouTube no válida." }, { status: 400 });
    }

    const tempDir = os.tmpdir();
    // Definimos rutas para el audio descargado y el convertido
    const downloadedAudioPath = path.join(tempDir, `yt-audio-${Date.now()}.mp4`);
    tempFiles.push(downloadedAudioPath);
    const convertedWavPath = path.join(tempDir, `yt-converted-${Date.now()}.wav`);
    tempFiles.push(convertedWavPath);

    // Paso 1: Descargar el stream de audio de YouTube
    await new Promise((resolve, reject) => {
      console.log(`INFO: Descargando audio de ${url}`);
      ytdl(url, { filter: 'audioonly', quality: 'lowestaudio' })
        .pipe(fs.createWriteStream(downloadedAudioPath))
        .on('finish', resolve)
        .on('error', (err) => reject(new Error(`Error descargando de YouTube: ${err.message}`)));
    });
    
    // Paso 2: Convertir el audio descargado a WAV estándar con FFmpeg
    await new Promise((resolve, reject) => {
        console.log(`INFO: Convirtiendo audio de YouTube a WAV...`);
        ffmpeg(downloadedAudioPath)
            .toFormat('wav')
            .audioChannels(1).audioFrequency(16000)
            .on('error', (err) => reject(new Error(`Error de FFmpeg: ${err.message}`)))
            .on('end', () => {
                console.log('INFO: Conversión a WAV completada.');
                resolve();
            })
            .save(convertedWavPath);
    });

    // Paso 3: Transcribir el archivo WAV (similar a la subida de archivos)
    console.log("INFO: Enviando audio de YouTube a Google Speech-to-Text...");
    const audioBytes = fs.readFileSync(convertedWavPath);
    const audio = { content: audioBytes.toString('base64') };
    const config = { 
        encoding: 'LINEAR16', 
        sampleRateHertz: 16000, 
        languageCode: 'es-PE', 
        model: 'telephony',
        enableAutomaticPunctuation: true
    };
    const [response] = await speechClient.recognize({ audio, config });
    const rawTranscript = response.results.map(r => r.alternatives[0].transcript).join('\n');

    if (!rawTranscript) {
      return NextResponse.json({ error: "No se pudo extraer texto del audio de YouTube." }, { status: 400 });
    }
    
    console.log("INFO: Transcripción de YouTube completada. Llamando a Gemini...");

    // Paso 4: Generar la minuta con Gemini
    const prompt = GEMINI_PROMPT_TEMPLATE.replace('{transcript}', rawTranscript);
    const result = await geminiModel.generateContent(prompt);
    const geminiResponse = await result.response;
    const finalMinutes = geminiResponse.text();
    
    // Paso 5: Devolver tanto la minuta como la transcripción completa
    return NextResponse.json({ 
        minutes: finalMinutes,
        rawTranscript: rawTranscript 
    });

  } catch (error) {
    console.error("ERROR: Error fatal en la API de YouTube:", error);
    return NextResponse.json({ error: `Error en el servidor: ${error.message}` }, { status: 500 });
  } finally {
      // Paso 6: Limpiar todos los archivos temporales creados
      tempFiles.forEach(filePath => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.error(`Error al limpiar archivo temporal ${filePath}:`, e);
        }
      });
  }
}