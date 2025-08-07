# 🎙️ MinutaGen Pro (Next.js & Gemini)

**MinutaGen Pro** es una aplicación web full-stack que transforma conversaciones de audio en minutas de reunión profesionales y estructuradas. Utiliza la inteligencia artificial de Google para transcribir audio en tiempo real o desde archivos y luego generar resúmenes, puntos clave, decisiones y tareas con la potencia de los modelos Gemini.



---

## ✨ Características Principales

-   **Transcripción en Tiempo Real:** Graba audio directamente desde el navegador y ve la transcripción aparecer al instante.
-   **Procesamiento de Archivos:** Sube archivos de audio en múltiples formatos (`.mp3`, `.m4a`, `.wav`, etc.). La aplicación los convierte y procesa automáticamente.
-   **Análisis desde YouTube:** Pega un enlace de un video de YouTube y la aplicación extraerá el audio para generar la minuta.
-   **Generación de Minutas por IA:** Utiliza **Google Gemini** para analizar la transcripción y crear una minuta con resumen ejecutivo, puntos clave, decisiones y una tabla de tareas.
-   **Descarga de Transcripciones:** Además de la minuta, puedes descargar la transcripción completa y sin procesar en un archivo `.txt`.
-   **Arquitectura Robusta:** Construido con Next.js para el frontend y un servidor Node.js + Socket.IO dedicado para la comunicación en tiempo real.

---

## 🛠️ Stack Tecnológico

-   **Framework:** Next.js (con App Router)
-   **Lenguaje:** JavaScript
-   **Comunicación en Tiempo Real:** Socket.IO
-   **IA - Transcripción:** Google Cloud Speech-to-Text
-   **IA - Generación de Minutas:** Google Gemini 1.5 Flash / Pro
-   **Procesamiento de Audio:** FFmpeg, `fluent-ffmpeg`, `ytdl-core`

---

## 🔑 Configuración Requerida

Antes de ejecutar el proyecto, necesitas obtener tres credenciales de Google Cloud. Sigue estos pasos:

### **Paso 1: Crear un Bucket en Google Cloud Storage (`BUCKET_NAME`)**

Necesitamos un "almacén" en la nube para manejar archivos de audio grandes.

1.  Ve a la **Consola de Google Cloud** > **Cloud Storage** > **Buckets**.
2.  Haz clic en **"+ CREAR"**.
3.  **Dale un nombre único a nivel mundial** (ej. `minutagen-audios-kenne-2025`). **Copia este nombre, lo necesitarás.**
4.  Elige **"Región"** y selecciona una cercana (ej. `us-central1`).
5.  Deja el resto de las opciones por defecto (`Standard`, `Uniforme`) y haz clic en **"CREAR"**.



### **Paso 2: Obtener las Credenciales de Servicio (`GOOGLE_APPLICATION_CREDENTIALS`)**

Necesitamos una "llave" para que nuestra aplicación se autentique de forma segura.

1.  Ve a la **Consola de Google Cloud** > **IAM y administración** > **Cuentas de servicio**.
2.  Haz clic en **"+ CREAR CUENTA DE SERVICIO"**.
3.  Dale un nombre (ej. `minutagen-app-runner`) y haz clic en "Crear y continuar".
4.  En "Rol", busca y selecciona **"Editor"**. Haz clic en "Continuar" y luego en "Listo".
5.  Busca la cuenta que acabas de crear, haz clic en los tres puntos (⋮) al final y selecciona **"Administrar claves"**.
6.  Haz clic en **"Agregar clave"** > **"Crear clave nueva"**.
7.  Selecciona **JSON** y haz clic en **"CREAR"**. Un archivo `.json` se descargará.
8.  **Acción Final:** Renombra este archivo a `service-account-key.json` y colócalo en la **raíz de tu proyecto `minutagen-nextjs/`**.

### **Paso 3: Obtener la Clave de API de Gemini (`GEMINI_API_KEY`)**

Esta clave es para el modelo de lenguaje que genera las minutas.

1.  Ve a **Google AI Studio**: [https://aistudio.google.com/](https://aistudio.google.com/)
2.  Inicia sesión y haz clic en el botón **"Get API key"** (Obtener clave de API).
3.  Haz clic en **"Create API key in new project"**.
4.  Copia la clave generada. Es una cadena larga de texto.



---

## 🚀 Instalación y Ejecución

1.  **Clonar el Repositorio (si aplica):**
    ```bash
    git clone [URL_DEL_REPOSITORIO]
    cd minutagen-nextjs
    ```

2.  **Configurar las Claves:**
    * Crea un archivo llamado `.env.local` en la raíz del proyecto.
    * Pega el siguiente contenido y rellena los valores que obtuviste en los pasos anteriores:
      ```env
      # Clave de la API de Gemini (Paso 3)
      GEMINI_API_KEY="AIzaSy...tu_clave_aqui"

      # Ruta al archivo de credenciales (Paso 2)
      GOOGLE_APPLICATION_CREDENTIALS="service-account-key.json"
      ```

3.  **Instalar Dependencias:**
    ```bash
    npm install
    ```

4.  **Ejecutar la Aplicación:**
    * Necesitarás **dos terminales** abiertas en la raíz del proyecto.

    * **En la Terminal 1 (Servidor de Sockets):**
      ```bash
      node socket-server.js
      ```
      *Verás un mensaje indicando que está escuchando en el puerto 3001.*

    * **En la Terminal 2 (Aplicación Next.js):**
      ```bash
      npm run dev
      ```
      *Verás un mensaje indicando que está corriendo en http://localhost:3000.*

5.  **Abrir en el Navegador:**
    * Abre [http://localhost:3000](http://localhost:3000) en tu navegador para usar la aplicación.

---

## ⚙️ Personalización: Cambiar el Modelo de IA

Por defecto, el proyecto usa `gemini-1.5-flash` por su balance de velocidad y costo. Si deseas usar el modelo más potente, `gemini-1.5-pro`, puedes hacerlo fácilmente.

1.  Abre los siguientes archivos:
    * `socket-server.js`
    * `app/api/transcribe-file/route.js`
    * `app/api/transcribe-youtube/route.js`

2.  En cada uno de esos archivos, busca esta línea:
    ```javascript
    const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
    ```

3.  Y simplemente cámbiala por:
    ```javascript
    const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro"});
    ```
4.  Reinicia los servidores. Ten en cuenta que el modelo `pro` es más lento y tiene un costo mayor por petición.