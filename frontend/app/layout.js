export const metadata = {
  title: "Tel T&D",
  description: "Portal de Treinamento e Desenvolvimento"
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f4f7fb" }}>
        {children}
      </body>
    </html>
  );
}
