export const metadata = {
  title: "Tel T&D",
  description: "Portal de Treinamento e Desenvolvimento",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          fontFamily: "Inter, Arial, Helvetica, sans-serif",
          background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
          color: "#0f172a",
        }}
      >
        {children}
      </body>
    </html>
  );
}
