import Uploader from "@/components/Uploader";

export default function Home() {
  return (
    <main className="main-container">
      <header>
        <h1>🎙️ MinutaGen Pro</h1>
        <p>Tu asistente IA para generar minutas de reunión, desde un archivo o en tiempo real.</p>
      </header>
      
      {/* Aquí importamos y renderizamos el componente Uploader.
        Toda la lógica interactiva (botones, tabs, estados, etc.) 
        vive dentro de ese componente para mantener nuestro código organizado.
      */}
      <Uploader />
    </main>
  );
}