// Importamos las librerías necesarias
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { SpeechClient } from '@google-cloud/speech';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config'; // Para cargar las variables de .env.local

// --- 1. CONFIGURACIÓN DEL SERVIDOR ---

const app = express();
app.use(cors()); // Habilita CORS para el servidor Express
const server = http.createServer(app);

// Puerto dedicado para este servidor de WebSockets
const PORT = 3001; 

// Inicializa Socket.IO con configuración de CORS para permitir
// la conexión desde tu aplicación Next.js (que corre en el puerto 3000)
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});


// --- 2. INICIALIZACIÓN DE CLIENTES DE IA ---

// Cliente de Google Speech-to-Text (se autentica automáticamente con la variable de entorno)
const speechClient = new SpeechClient();

// Cliente de Gemini (lee la clave directamente desde las variables de entorno)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// Plantilla de prompt para Gemini
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

// Almacenamiento temporal para las transcripciones de cada cliente
const clientTranscriptions = {};


// --- 3. LÓGICA DEL SERVIDOR DE WEBSOCKETS ---

io.on('connection', (socket) => {
  console.log(`✅ Cliente de WebSocket conectado: ${socket.id}`);
  let recognizeStream = null;

  // Evento que se dispara cuando el frontend pide iniciar la grabación
  socket.on('start_transcription', () => {
    console.log(`[${socket.id}] Iniciando transcripción...`);
    
    // Reinicia la transcripción para esta sesión
    clientTranscriptions[socket.id] = '';

    recognizeStream = speechClient.streamingRecognize({
      config: { 
        encoding: 'WEBM_OPUS', 
        sampleRateHertz: 48000, 
        languageCode: 'es-PE', 
        enableAutomaticPunctuation: true, 
        model: 'telephony' 
      },
      interimResults: true,
    })
    .on('error', (err) => {
      console.error('Error de API de Speech:', err);
      socket.emit('transcription_error', { error: err.message });
    })
    .on('data', data => {
      const transcript = data.results[0]?.alternatives[0]?.transcript;
      if (data.results[0]?.isFinal) {
        // Acumula los trozos finales de la transcripción
        clientTranscriptions[socket.id] += transcript + ' ';
        socket.emit('final_transcript_chunk', { transcript });
      } else {
        // Envía los resultados intermedios (que se sobreescriben en el frontend)
        socket.emit('interim_transcript', { transcript });
      }
    });
  });

  // Evento que recibe los fragmentos de audio desde el navegador
  socket.on('audio_chunk', (chunk) => {
    if (recognizeStream) {
      recognizeStream.write(chunk);
    }
  });

  // Evento que se dispara cuando el usuario detiene la grabación
  socket.on('stop_transcription', async () => {
    console.log(`[${socket.id}] Deteniendo transcripción.`);
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }

    const fullTranscript = clientTranscriptions[socket.id] || '';

    if (fullTranscript.trim()) {
      try {
        console.log(`[${socket.id}] Enviando transcripción a Gemini...`);
        const prompt = GEMINI_PROMPT_TEMPLATE.replace('{transcript}', fullTranscript);
        
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const finalMinutes = response.text();

        // --- LÍNEA MODIFICADA ---
        // Ahora enviamos un objeto con la minuta Y la transcripción completa
        socket.emit('final_minutes', { 
            minutes: finalMinutes, 
            rawTranscript: fullTranscript 
        });

      } catch (e) {
        console.error("Error con Gemini:", e);
        socket.emit('transcription_error', { error: `Error con Gemini: ${e.message}` });
      }
    } else {
      socket.emit('final_minutes', { 
          minutes: "No se generó minuta porque no se transcribió texto.",
          rawTranscript: ""
      });
    }
    delete clientTranscriptions[socket.id];
  });

  // Evento que se dispara si el usuario cierra la pestaña del navegador
  socket.on('disconnect', () => {
    console.log(`Cliente de WebSocket desconectado: ${socket.id}`);
    if (recognizeStream) {
        recognizeStream.end();
        recognizeStream = null;
    }
    delete clientTranscriptions[socket.id];
  });
});

// --- 4. INICIAR EL SERVIDOR ---
server.listen(PORT, () => {
  console.log(`🚀 Servidor de Socket.IO escuchando en el puerto ${PORT}`);
});