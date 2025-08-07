"use client";

import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// Se declara fuera del componente para que no se reinicie en cada renderizado
let socket;
// La URL de nuestro servidor de WebSockets independiente
const SOCKET_URL = "http://localhost:3001"; 

export default function Uploader() {
  // --- Estados de React para manejar la UI ---
  const [activeTab, setActiveTab] = useState('live'); // 'live', 'upload', o 'url'
  const [isRecording, setIsRecording] = useState(false);
  const [liveStatus, setLiveStatus] = useState('Listo para grabar.');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalMinutes, setFinalMinutes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  
  // --- NUEVO ESTADO PARA GUARDAR LA TRANSCRIPCIÓN FINAL ---
  const [finalTranscript, setFinalTranscript] = useState('');

  // Referencias para manejar objetos que no necesitan re-renderizar la UI
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  // --- Efecto para Conectar y Desconectar el WebSocket ---
  useEffect(() => {
    socket = io(SOCKET_URL);

    // Definición de los listeners para eventos del servidor
    socket.on('connect', () => console.log('Conectado al servidor de WebSocket en el puerto 3001!'));
    
    socket.on('interim_transcript', (data) => setLiveTranscript(data.transcript));
    
    socket.on('final_transcript_chunk', (data) => {
      setLiveTranscript(prev => prev + data.transcript + ' ');
    });
    
    socket.on('final_minutes', (data) => {
      setFinalMinutes(data.minutes);
      // --- AÑADIDO: Guardar la transcripción final que viene del backend ---
      setFinalTranscript(data.rawTranscript || ''); 
      setIsLoading(false);
      setLiveStatus('¡Minuta generada con éxito!');
    });

    socket.on('transcription_error', (data) => {
      setIsLoading(false);
      setLiveStatus(`Error: ${data.error}`);
    });

    // Función de limpieza
    return () => {
      if (socket) socket.disconnect();
    };
  }, []); // El array vacío asegura que este efecto se ejecute solo una vez

  // --- Manejadores de Eventos ---

  // Función para reiniciar los estados antes de una nueva operación
  const resetStateForNewRun = () => {
    setLiveTranscript('');
    setFinalMinutes('');
    setFinalTranscript('');
    setIsLoading(true); // Se activa el loader
  };

  const handleStartRecording = async () => {
    if (isRecording) return;
    resetStateForNewRun();
    setLiveStatus("Solicitando permiso de micrófono...");
    setIsLoading(false); // No mostramos el loader principal mientras grabamos

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.connected) {
          socket.emit('audio_chunk', event.data);
        }
      };
      
      mediaRecorderRef.current.onstart = () => {
        socket.emit('start_transcription');
        setIsRecording(true);
        setLiveStatus("🔴 Grabando... Habla ahora.");
      };
      
      mediaRecorderRef.current.onstop = () => {
        // --- AÑADIDO: Guardar la transcripción completa del modo en vivo ---
        setFinalTranscript(liveTranscript);
        socket.emit('stop_transcription');
        setLiveStatus("Procesando minuta final... por favor espera.");
        setIsLoading(true);
      };

      mediaRecorderRef.current.start(1000);

    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      setLiveStatus(`Error: No se pudo acceder al micrófono. ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    resetStateForNewRun();
    setLiveStatus("Subiendo y procesando archivo...");

    const formData = new FormData();
    formData.append('audioFile', file);

    try {
      const response = await fetch('/api/transcribe-file', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error del servidor: ${response.status}`);
      }
      const data = await response.json();
      setFinalMinutes(data.minutes);
      // --- AÑADIDO: Guardar la transcripción que viene de la API ---
      setFinalTranscript(data.rawTranscript || '');
      setLiveStatus("Archivo procesado con éxito.");
    } catch (error) {
      setFinalMinutes(`<p style="color: red;">Ocurrió un Error: ${error.message}</p>`);
      setLiveStatus(`Error al procesar el archivo.`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleUrlSubmit = async () => {
    if (!youtubeUrl) {
      alert("Por favor, introduce una URL de YouTube.");
      return;
    }
    resetStateForNewRun();
    setLiveStatus("Procesando URL de YouTube... Esto puede tardar varios minutos.");

    try {
      const response = await fetch('/api/transcribe-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error del servidor: ${response.status}`);
      }
      const data = await response.json();
      setFinalMinutes(data.minutes);
      // --- AÑADIDO: Guardar la transcripción que viene de la API ---
      setFinalTranscript(data.rawTranscript || '');
      setLiveStatus("URL procesada con éxito.");
    } catch (error) {
      setFinalMinutes(`<p style="color: red;">Ocurrió un Error: ${error.message}</p>`);
      setLiveStatus(`Error al procesar la URL.`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- NUEVA FUNCIÓN PARA DESCARGAR EL ARCHIVO DE TEXTO ---
  const handleDownloadTranscript = () => {
    if (!finalTranscript) return;
    // Crear un objeto Blob, que es como un archivo en memoria
    const blob = new Blob([finalTranscript], { type: 'text/plain;charset=utf-8' });
    // Crear una URL temporal para ese "archivo"
    const url = URL.createObjectURL(blob);
    // Crear un enlace invisible para hacer clic en él
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcripcion-completa.txt'; // Nombre del archivo a descargar
    document.body.appendChild(a);
    a.click(); // Simular un clic para iniciar la descarga
    // Limpiar eliminando el enlace y la URL temporal
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Renderizado del Componente JSX ---
  return (
    <div>
      <div className="tabs">
        <button className={`tab-button ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>Grabar en Vivo</button>
        <button className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>Subir Archivo</button>
        <button className={`tab-button ${activeTab === 'url' ? 'active' : ''}`} onClick={() => setActiveTab('url')}>Desde URL</button>
      </div>

      {/* Contenido Pestaña "Grabar en Vivo" */}
      {activeTab === 'live' && (
        <div className="tab-content active">
          <h3>Transcripción en Tiempo Real</h3>
          <div className="live-controls">
            <button onClick={handleStartRecording} disabled={isLoading || isRecording}>▶️ Grabar</button>
            <button onClick={handleStopRecording} disabled={!isRecording}>⏹️ Detener</button>
          </div>
          <div className="status-box">{liveStatus}</div>
          <div className={(liveTranscript || finalTranscript) ? 'visible' : 'hidden'}>
            <div className="transcript-header">
                <h4>Transcripción Completa</h4>
                {/* --- NUEVO BOTÓN DE DESCARGA (aparece cuando hay una transcripción final) --- */}
                {finalTranscript && !isLoading && (
                    <button onClick={handleDownloadTranscript} className="download-btn">Descargar (.txt)</button>
                )}
            </div>
            <p className="transcript-box">{finalTranscript || liveTranscript}</p>
          </div>
        </div>
      )}

      {/* Contenido Pestaña "Subir Archivo" */}
      {activeTab === 'upload' && (
        <div className="tab-content active">
          <h3>Procesar desde Archivo de Audio</h3>
          <div className="file-upload-wrapper">
            <input type="file" id="audio-file-input" accept="audio/*" onChange={handleFileUpload} style={{ display: 'none' }} />
            <label htmlFor="audio-file-input">
              Haz clic para seleccionar un archivo (.mp3, .m4a, .wav, etc.)
            </label>
          </div>
          <div className="status-box">{liveStatus}</div>
        </div>
      )}

      {/* NUEVO Contenido Pestaña "Desde URL" */}
      {activeTab === 'url' && (
        <div className="tab-content active">
          <h3>Procesar desde URL de YouTube</h3>
          <div className="url-controls">
             <input 
                type="text" 
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Pega aquí el enlace de YouTube..."
                className="url-input"
             />
             <button onClick={handleUrlSubmit} disabled={isLoading}>Generar Minuta</button>
          </div>
          <div className="status-box">{liveStatus}</div>
        </div>
      )}

      {/* Sección de Resultados (común para todas las pestañas) */}
      <section className={(isLoading || finalMinutes) ? 'visible' : 'hidden'}>
        <hr />
        <div className="transcript-header">
             <h2>Minuta Final Generada</h2>
             {/* --- AÑADIMOS EL BOTÓN DE DESCARGA TAMBIÉN AQUÍ --- */}
             {finalTranscript && !isLoading && (
                <button onClick={handleDownloadTranscript} className="download-btn">Descargar Transcripción (.txt)</button>
             )}
        </div>
        {isLoading && <div className="loader"></div>}
        {finalMinutes && <div className="final-minutes-output" dangerouslySetInnerHTML={{ __html: finalMinutes.replace(/\n/g, '<br/>') }} />}
      </section>
    </div>
  );
}