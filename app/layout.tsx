import { Inter } from "next/font/google";
import "./globals.css";

// Carga la fuente 'Inter' de Google para un aspecto moderno
const inter = Inter({ subsets: ["latin"] });

// Define los metadatos del sitio (título en la pestaña del navegador, descripción, etc.)
export const metadata = {
  title: "MinutaGen Pro | Asistente de Reuniones con IA",
  description: "Genera minutas de reunión automáticamente desde un archivo de audio o una grabación en tiempo real, impulsado por la IA de Google.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {/* La variable 'children' es donde Next.js insertará el contenido de tus páginas (como page.js) */}
        {children}
      </body>
    </html>
  );
}